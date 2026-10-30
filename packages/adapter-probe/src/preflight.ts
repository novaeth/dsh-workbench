import type { DshShell, RuntimeCapabilities } from '@dsh-workbench/shared';
import {
  INSTALL_TIMEOUT_MS,
  OPENCLI_TIMEOUT_MS,
  PREFLIGHT_FRESH_MS,
  PREFLIGHT_VERSION_TIMEOUT_MS,
  WARM_TIMEOUT_MS,
} from '@dsh-workbench/shared/host';
import { tailLines } from '@dsh-workbench/shared/host';
import { opencliCommandLine } from '@dsh-workbench/adapter-runtime';
import { runShell } from '@dsh-workbench/shared/host';
import { DIY_UPGRADE_COMMAND } from './diy-preset-health.js';
import type { DiyPresetVerdict } from './diy-preset-health.js';
import { opencliInstallCommand } from './install.js';
import { LOCAL_NPM_VERSION, LOCAL_PNPM_VERSION, type LocalNpmProvision, type LocalPnpmProvision } from './toolchain.js';
import type { ToolchainReport } from './toolchain-probe.js';
import type { DesktopBrowser } from './browser-wake.js';
import { bridgeFixCommand } from './browser-wake.js';

export type PreflightFailure = 'permission' | 'network' | 'missing' | 'host' | 'unknown';

export function classifyFailure(text: string): PreflightFailure {
  const lower = text.toLowerCase();
  if (/eacces|eperm|permission denied|operation not permitted/.test(lower)) return 'permission';
  if (/enotfound|etimedout|econnrefused|econnreset|network|proxy|fetch failed/.test(lower)) return 'network';
  if (/command not found|not found|no such file/.test(lower)) return 'missing';
  return 'unknown';
}

export type PreflightGuidance = 'install' | 'path' | 'shell' | 'host';

export type PreflightStepId = 'toolchain' | 'runtime' | 'cli' | 'bridge' | 'diy' | 'warm';

export type PreflightStepStatus = 'pending' | 'running' | 'ok' | 'warn' | 'failed';

export interface PreflightStep {
  readonly id: PreflightStepId;
  readonly status: PreflightStepStatus;
  readonly detail?: string;
  readonly action?: string;
  readonly command?: string;
}

export type PreflightBridgeIssue = 'daemon' | 'extension' | 'profile' | 'stale' | 'unknown';

export const BRIDGE_ISSUE_ORDER: readonly PreflightBridgeIssue[] = ['profile', 'stale', 'daemon', 'extension', 'unknown'];

export function readBridgeReport(stdout: string): {
  readonly ok: boolean;
  readonly issues: readonly PreflightBridgeIssue[];
  readonly detail: string;
} {
  const text = String(stdout ?? '');
  const ok = /^\[OK\] Daemon:/m.test(text) && /^\[OK\] Extension:/m.test(text) && /^\[OK\] Connectivity:/m.test(text);
  if (ok) {
    const good = text.split('\n').find((line) => line.trim() === 'Everything looks good!');
    return { ok: true, issues: [], detail: good?.trim() ?? tailLines(text, 1) };
  }

  const found = new Set<PreflightBridgeIssue>();
  if (!/^\[OK\] Daemon:/m.test(text)) found.add('daemon');
  if (!/^\[OK\] Extension:/m.test(text)) found.add('extension');
  if (/Multiple Chrome profiles are connected/i.test(text)) found.add('profile');
  if (/Default browser profile is stale|Selected browser profile is not connected/i.test(text)) {
    found.add('stale');
  }
  if (found.has('profile') || found.has('stale')) found.delete('extension');
  if (found.size === 0) found.add('unknown');

  return { ok: false, issues: BRIDGE_ISSUE_ORDER.filter((issue) => found.has(issue)), detail: issuesSection(text) };
}

function issuesSection(text: string): string {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => /^Issues:/.test(line.trim()));
  if (start < 0) return tailLines(text, 6);
  return lines.slice(start).join('\n').trim();
}

export interface PreflightDiyGap {
  readonly rows: readonly string[];
  readonly detail: string;
  readonly command: string;
}

export interface PreflightSnapshot {
  readonly phase: 'idle' | 'checking' | 'installing' | 'ready' | 'failed';
  readonly steps: readonly PreflightStep[];
  readonly at: number;
  readonly error?: string;
  readonly failure?: PreflightFailure;
  readonly guidance?: PreflightGuidance;
  readonly bridgeIssues?: readonly PreflightBridgeIssue[];
  readonly diyGap?: PreflightDiyGap;
  readonly canWakeBrowser?: boolean;
}

export interface Preflight {
  run(options?: { hard?: boolean }): Promise<PreflightSnapshot>;
  snapshot(): PreflightSnapshot;
}

export function opencliInstallCommandDefault(): string {
  return opencliInstallCommand();
}

const WARMABLE_BRIDGE_ISSUES: readonly PreflightBridgeIssue[] = ['daemon', 'stale'];

export interface BridgeVerdict {
  readonly ok: boolean;
  readonly detail: string;
  readonly issues: readonly PreflightBridgeIssue[];
  readonly command?: string | undefined;
  readonly stalled?: boolean | undefined;
}

export function canWarm(bridge: { ok: boolean; issues: readonly PreflightBridgeIssue[] }): boolean {
  return bridge.ok || bridge.issues.every((issue) => WARMABLE_BRIDGE_ISSUES.includes(issue));
}

function step(id: PreflightStepId, label?: string): PreflightStep {
  return { id, status: 'pending', ...(label === undefined || label === '' ? {} : { label }) };
}

export function createPreflight(options: {
  shell: DshShell;
  command?: string;
  installCommand?: string;
  logger?: { warn?(message: string): void } | undefined;
  install?: (() => Promise<{ ok: boolean; detail: string }>) | undefined;
  warmReads?: (() => readonly (readonly string[])[]) | undefined;
  probeDiy?: (() => Promise<DiyPresetVerdict | undefined>) | undefined;
  probeToolchain?: (() => Promise<ToolchainReport>) | undefined;
  provisionNpm?: (() => Promise<LocalNpmProvision>) | undefined;
  provisionPnpm?: (() => Promise<LocalPnpmProvision>) | undefined;
  desktopBrowser?: DesktopBrowser | undefined;
  capabilities?: RuntimeCapabilities | undefined;
  runtimeCheck?: (() => Promise<{ ok: boolean; detail: string }>) | undefined;
  runtimeLabel?: string | undefined;
}): Preflight {
  const { shell, command = 'opencli', logger } = options;
  const capabilities = options.capabilities ?? { console: true, pluginMarket: true, browserBridge: true };
  const withConsole = capabilities.console;
  const withBridge = capabilities.browserBridge;
  const installCommand = options.installCommand ?? opencliInstallCommandDefault();
  const warmReads = (): readonly (readonly string[])[] => options.warmReads?.() ?? [];
  const steps = (): PreflightStep[] => [
    ...(options.probeToolchain === undefined ? [] : [step('toolchain')]),
    ...(options.runtimeCheck === undefined ? [] : [step('runtime', options.runtimeLabel)]),
    ...(withConsole ? [step('cli')] : []),
    ...(withBridge ? [step('bridge')] : []),
    ...(options.probeDiy === undefined ? [] : [step('diy')]),
    ...(warmReads().length === 0 ? [] : [step('warm')]),
  ];
  let current: PreflightSnapshot = {
    phase: 'idle',
    steps: steps(),
    at: Date.now(),
    ...(options.desktopBrowser === undefined ? {} : { canWakeBrowser: true }),
  };
  let running: Promise<PreflightSnapshot> | null = null;
  let shellStalled = false;

  function set(next: Partial<PreflightSnapshot> & { steps?: PreflightStep[] }): PreflightSnapshot {
    current = { ...current, ...next, at: Date.now() };
    return current;
  }

  function patchStep(id: PreflightStepId, patch: Partial<PreflightStep>): PreflightSnapshot {
    return set({ steps: current.steps.map((item) => (item.id === id ? { ...item, ...patch } : item)) });
  }

  function hostFailure(detail: string): PreflightSnapshot {
    return set({ phase: 'failed', error: detail, failure: 'host', guidance: 'host' });
  }

  async function exec(
    commandLine: string,
    timeoutMs: number,
  ): Promise<
    | { kind: 'ok'; stdout: string }
    | { kind: 'nonzero'; detail: string }
    | { kind: 'error'; detail: string }
    | { kind: 'stalled'; detail: string }
  > {
    if (shellStalled) {
      return { kind: 'stalled', detail: `前一条命令就没交回结果，这一步没跑：${commandLine}` };
    }
    try {
      const result = await runShell(shell, commandLine, { timeoutMs });
      if (result.stalled) {
        shellStalled = true;
        return { kind: 'stalled', detail: `没有返回（宿主没把结果交回来）：${commandLine}` };
      }
      if (result.timedOut) {
        return { kind: 'error', detail: `超时（${String(timeoutMs)} ms）：${commandLine}` };
      }
      if (result.exitCode !== 0) {
        return { kind: 'nonzero', detail: tailLines(result.stderr || result.stdout, 4) };
      }
      return { kind: 'ok', stdout: result.stdout };
    } catch (error) {
      return { kind: 'error', detail: String(error) };
    }
  }

  async function probeVersion(): Promise<{ ok: boolean; missing: boolean; detail: string; stalled: boolean }> {
    const result = await exec(`${command} --version`, PREFLIGHT_VERSION_TIMEOUT_MS);
    if (result.kind === 'ok') {
      return { ok: true, missing: false, detail: result.stdout.trim().split('\n')[0] ?? '', stalled: false };
    }
    return {
      ok: false,
      missing: result.kind === 'nonzero',
      detail: result.detail,
      stalled: result.kind === 'stalled',
    };
  }

  async function probeBridge(): Promise<BridgeVerdict> {
    const result = await exec(`${command} doctor`, OPENCLI_TIMEOUT_MS);
    if (result.kind === 'stalled') {
      return { ok: false, detail: result.detail, issues: ['unknown'], stalled: true };
    }
    if (result.kind !== 'ok') return { ok: false, detail: result.detail, issues: ['unknown'] };
    const report = readBridgeReport(result.stdout);
    if (report.ok) return report;
    return { ...report, command: bridgeFixCommand(command, report.issues) };
  }

  async function installOpencli(): Promise<{ ok: boolean; detail: string }> {
    if (options.install !== undefined) return options.install();
    const result = await exec(installCommand, INSTALL_TIMEOUT_MS);
    if (result.kind !== 'ok') return { ok: false, detail: result.detail };
    return { ok: true, detail: tailLines(result.stdout, 1) };
  }

  async function warmSites(bridge: BridgeVerdict): Promise<BridgeVerdict> {
    const reads = warmReads();
    if (reads.length === 0) return bridge;
    if (!canWarm(bridge)) {
      patchStep('warm', { status: 'warn', detail: '' });
      return bridge;
    }

    patchStep('warm', {
      status: 'running',
      action: `${command} <套件自己声明的那条读命令> --site-session persistent -f json`,
    });
    const results = await Promise.all(
      reads.map((read) => exec(opencliCommandLine(command, read), WARM_TIMEOUT_MS)),
    );
    const failed = reads.filter((_, index) => results[index]?.kind !== 'ok');
    patchStep('warm', {
      status: failed.length === 0 ? 'ok' : 'warn',
      detail: failed.length === 0 ? String(reads.length) : failed.map((read) => read.join(' ')).join(' '),
      action: undefined,
    });
    if (bridge.ok) return bridge;

    const again = await probeBridge();
    patchStep('bridge', {
      status: again.ok ? 'ok' : 'warn',
      detail: again.detail,
      action: undefined,
      command: again.command,
    });
    return again;
  }

  async function settleDiy(
    started: Promise<DiyPresetVerdict | undefined> | undefined,
  ): Promise<PreflightDiyGap | undefined> {
    if (started === undefined) return undefined;
    const verdict = await started.catch(() => undefined);
    if (verdict === undefined) {
      set({ steps: current.steps.filter((item) => item.id !== 'diy') });
      return undefined;
    }
    if (verdict.ok) {
      patchStep('diy', { status: 'ok', detail: verdict.detail });
      return undefined;
    }
    patchStep('diy', { status: 'warn', detail: verdict.detail, command: DIY_UPGRADE_COMMAND });
    return { rows: verdict.rows, detail: verdict.detail, command: DIY_UPGRADE_COMMAND };
  }

  async function doRun(): Promise<PreflightSnapshot> {
    shellStalled = false;
    set({
      phase: 'checking',
      error: undefined,
      failure: undefined,
      guidance: undefined,
      bridgeIssues: undefined,
      diyGap: undefined,
      steps: steps(),
    });
    const toolchainStarted = options.probeToolchain?.();
    if (toolchainStarted !== undefined) {
      patchStep('toolchain', { status: 'running', action: 'node --version · npm --version · pnpm --version' });
    }
    let toolchain =
      toolchainStarted === undefined
        ? undefined
        : await toolchainStarted.catch(
            (): ToolchainReport => ({
              ok: false,
              detail: '工具链探测没跑起来',
              nodeMissing: true,
              npmMissing: true,
              pnpmProblem: true,
              stalled: false,
            }),
          );
    if (toolchain !== undefined && toolchain.ok && toolchain.npmMissing && options.provisionNpm !== undefined) {
      set({ phase: 'installing' });
      patchStep('toolchain', { status: 'running', action: `装本地 npm@${LOCAL_NPM_VERSION}` });
      const provisioned = await options.provisionNpm().catch((error: unknown) => ({
        ok: false,
        detail: String(error),
      }));
      if (provisioned.ok) {
        const reprobed = await options.probeToolchain?.();
        if (reprobed !== undefined) toolchain = reprobed;
      } else {
        toolchain = { ...toolchain, detail: `${toolchain.detail}；本地 npm 没装成：${provisioned.detail}` };
      }
    }
    if (toolchain !== undefined && toolchain.ok && toolchain.pnpmProblem && options.provisionPnpm !== undefined) {
      set({ phase: 'installing' });
      patchStep('toolchain', { status: 'running', action: `装本地 pnpm@${LOCAL_PNPM_VERSION}` });
      const provisioned = await options.provisionPnpm().catch((error: unknown) => ({
        ok: false,
        detail: String(error),
      }));
      if (provisioned.ok) {
        const reprobed = await options.probeToolchain?.();
        if (reprobed !== undefined) toolchain = reprobed;
      } else {
        toolchain = { ...toolchain, detail: `${toolchain.detail}；本地 pnpm 10 没装成：${provisioned.detail}` };
      }
    }
    if (toolchain !== undefined) {
      set({ phase: 'checking' });
      patchStep('toolchain', {
        status: toolchain.ok ? (toolchain.npmMissing || toolchain.pnpmProblem ? 'warn' : 'ok') : 'failed',
        detail: toolchain.detail,
        action: undefined,
      });
      if (!toolchain.ok) {
        return toolchain.stalled === true
          ? hostFailure(toolchain.detail)
          : set({ phase: 'failed', error: toolchain.detail, failure: 'missing', guidance: 'install' });
      }
    }

    if (options.runtimeCheck !== undefined) {
      patchStep('runtime', { status: 'running' });
      const verdict = await options.runtimeCheck().catch((error: unknown) => ({
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      }));
      patchStep('runtime', { status: verdict.ok ? 'ok' : 'failed', detail: verdict.detail, action: undefined });
      if (!verdict.ok) return set({ phase: 'failed', error: verdict.detail, failure: 'missing', guidance: 'install' });
    }

    const diyStarted = options.probeDiy?.();
    if (withConsole) {
      patchStep('cli', { status: 'running', action: `${command} --version` });
      if (diyStarted !== undefined) patchStep('diy', { status: 'running' });

      let version = await probeVersion();
      if (version.stalled) {
        patchStep('cli', { status: 'failed', detail: version.detail, action: undefined });
        return hostFailure(version.detail);
      }
      if (!version.ok && !version.missing) {
        patchStep('cli', { status: 'failed', detail: version.detail, action: undefined });
        return set({
          phase: 'failed',
          error: version.detail,
          failure: classifyFailure(version.detail),
          guidance: 'shell',
        });
      }
      if (!version.ok) {
        if (toolchain?.npmMissing === true && installCommand.trim().startsWith('npm ')) {
          patchStep('cli', { status: 'failed', detail: '没有 npm：装不了 opencli（只影响 opencli 安装）' });
          return set({
            phase: 'failed',
            error: '没有 npm：装不了 opencli（只影响 opencli 安装）',
            failure: 'missing',
            guidance: 'install',
          });
        }
        set({ phase: 'installing' });
        patchStep('cli', { status: 'running', action: installCommand, command: installCommand });
        const installed = await installOpencli();
        if (!installed.ok) {
          patchStep('cli', {
            status: 'failed',
            detail: installed.detail,
            command: installCommand,
          });
          return set({
            phase: 'failed',
            error: installed.detail,
            failure: classifyFailure(installed.detail),
            guidance: 'install',
          });
        }
        patchStep('cli', { status: 'running', action: `${command} --version` });
        version = await probeVersion();
        if (version.stalled) {
          patchStep('cli', { status: 'failed', detail: version.detail, action: undefined });
          return hostFailure(version.detail);
        }
        if (!version.ok) {
          patchStep('cli', { status: 'failed', detail: version.detail, command: installCommand });
          return set({
            phase: 'failed',
            error: version.detail,
            failure: classifyFailure(version.detail),
            guidance: 'path',
          });
        }
      }
      patchStep('cli', { status: 'ok', detail: version.detail, action: undefined });
    }

    patchStep('bridge', { status: 'running', action: `${command} doctor` });
    const bridge = withBridge ? await probeBridge() : { ok: true, detail: '', issues: [] };
    if (bridge.stalled === true) {
      patchStep('bridge', { status: 'failed', detail: bridge.detail, action: undefined });
      return hostFailure(bridge.detail);
    }
    if (withBridge && options.desktopBrowser !== undefined && bridge.ok) {
      await options.desktopBrowser.observe().catch(() => undefined);
    }
    const healable = !bridge.ok && warmReads().length > 0 && canWarm(bridge);
    if (!healable) {
      patchStep('bridge', {
        status: bridge.ok ? 'ok' : 'warn',
        detail: bridge.detail,
        action: undefined,
        ...(bridge.command === undefined ? {} : { command: bridge.command }),
      });
    }

    const settled = withBridge ? await warmSites(bridge) : bridge;
    const diyGap = await settleDiy(diyStarted);

    logger?.warn?.(
      `[dsh-workbench] 环境体检：${current.steps.map((item) => `${item.id}=${item.status}`).join(' ')}`,
    );
    return set({
      phase: 'ready',
      ...(settled.ok ? {} : { bridgeIssues: settled.issues }),
      ...(diyGap === undefined ? {} : { diyGap }),
    });
  }

  function freshReady(): boolean {
    return current.phase === 'ready' && Date.now() - current.at < PREFLIGHT_FRESH_MS;
  }

  async function start(runOptions: { hard?: boolean } = {}): Promise<PreflightSnapshot> {
    if (running !== null) return running;
    if (runOptions.hard !== true && freshReady()) return current;

    const inflight = doRun().catch((error: unknown) =>
      set({
        phase: 'failed',
        error: error instanceof Error ? error.message : String(error),
        failure: 'unknown',
        guidance: 'install',
      }),
    );
    running = inflight;
    await inflight;
    running = null;
    return inflight;
  }

  return {
    run: start,
    snapshot() {
      return current;
    },
  };
}
