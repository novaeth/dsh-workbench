import type { RuntimeCapabilities } from '@dsh-workbench/shared';
import { PREFLIGHT_DOCTOR_TIMEOUT_MS, PREFLIGHT_FRESH_MS, PREFLIGHT_INSTALL_TIMEOUT_MS, PREFLIGHT_VERSION_TIMEOUT_MS, WARM_TIMEOUT_MS, now } from '@dsh-workbench/shared/host';
import { tailLines } from '@dsh-workbench/shared/host';
import { quoteShellArgFor } from '@dsh-workbench/shared/host';
import { opencliCommandLine } from '@dsh-workbench/adapter-runtime';
import { productWrite, type Seam } from '@dsh-workbench/shared/host';
import { DIY_UPGRADE_COMMAND } from './diy-preset-health.js';
import type { DiyPresetVerdict } from './diy-preset-health.js';
import { opencliInstallCommand } from './install.js';
import { LOCAL_PNPM_VERSION, type LocalNpmProvision, type LocalPnpmProvision } from './toolchain.js';
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

import type {
  PreflightDiyGap,
  PreflightSnapshot,
  PreflightStep,
} from '@dsh-workbench/shared/host';
import { readBridgeReport, type PreflightBridgeIssue } from './bridge-report.js';
export { BRIDGE_ISSUE_ORDER, readBridgeReport } from './bridge-report.js';
export type { PreflightBridgeIssue } from './bridge-report.js';
export type { PreflightDiyGap, PreflightSnapshot, PreflightStep } from '@dsh-workbench/shared/host';

export interface Preflight {
  run(options?: { hard?: boolean; only?: PreflightStepId }): Promise<PreflightSnapshot>;
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
  seam: Seam;
  command?: string;
  installCommand?: string;
  logger?: { warn?(message: string): void } | undefined;
  install?: (() => Promise<{ ok: boolean; detail: string }>) | undefined;
  installed?: (() => boolean) | undefined;
  warmReads?: (() => readonly (readonly string[])[]) | undefined;
  probeDiy?: (() => Promise<DiyPresetVerdict | undefined>) | undefined;
  probeToolchain?: (() => Promise<ToolchainReport>) | undefined;
  provisionNpm?: (() => Promise<LocalNpmProvision>) | undefined;
  provisionPnpm?: (() => Promise<LocalPnpmProvision>) | undefined;
  desktopBrowser?: DesktopBrowser | undefined;
  extensionDir?: string | undefined;
  capabilities?: RuntimeCapabilities | undefined;
  runtimeCheck?: (() => Promise<{ ok: boolean; detail: string }>) | undefined;
  runtimeLabel?: string | undefined;
  platform?: NodeJS.Platform | undefined;
}): Preflight {
  const { seam, command = 'opencli', logger } = options;
  const platform = options.platform ?? process.platform;
  const commandToken = quoteShellArgFor(command, platform);
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
  let logLines: string[] = [];
  const stepLogs = new Map<PreflightStepId, string[]>();

  function appendLog(stepId: PreflightStepId, text: string): void {
    const stepLines = stepLogs.get(stepId) ?? [];
    for (const line of String(text).split('\n')) {
      if (line.trim() === '') continue;
      const clipped = line.length > 400 ? `${line.slice(0, 400)}…` : line;
      stepLines.push(clipped);
      logLines.push(clipped);
    }
    if (stepLines.length > 200) stepLines.splice(0, stepLines.length - 200);
    if (logLines.length > 200) logLines = logLines.slice(-200);
    stepLogs.set(stepId, stepLines);
    set({
      steps: current.steps.map((item) =>
        item.id === stepId ? { ...item, log: [...stepLines] } : item,
      ),
    });
  }
  let current: PreflightSnapshot = {
    phase: 'idle',
    steps: steps(),
    at: now(),
    log: [],
    ...(options.desktopBrowser === undefined ? {} : { canWakeBrowser: true }),
    ...(options.extensionDir === undefined ? {} : { extensionDir: options.extensionDir }),
  };
  let running: Promise<PreflightSnapshot> | null = null;
  let shellStalled = false;

  function set(next: Partial<PreflightSnapshot> & { steps?: PreflightStep[] }): PreflightSnapshot {
    current = { ...current, ...next, log: [...logLines], at: now() };
    return current;
  }

  function patchStep(id: PreflightStepId, patch: Partial<PreflightStep>): PreflightSnapshot {
    return set({ steps: current.steps.map((item) => (item.id === id ? { ...item, ...patch } : item)) });
  }

  function hostFailure(detail: string): PreflightSnapshot {
    return set({ phase: 'failed', error: detail, failure: 'host', guidance: 'host' });
  }

  async function exec(
    stepId: PreflightStepId,
    commandLine: string,
    timeoutMs: number,
    retry: 'safe' | 'never' = 'safe',
  ): Promise<
    | { kind: 'ok'; stdout: string }
    | { kind: 'nonzero'; detail: string }
    | { kind: 'error'; detail: string }
    | { kind: 'stalled'; detail: string }
  > {
    if (shellStalled) {
      return { kind: 'stalled', detail: `前一条命令就没交回结果，这一步没跑：${commandLine}` };
    }
    appendLog(stepId, `> ${commandLine}`);
    try {
      const result = await seam.run({ command: commandLine, intent: productWrite(), timeoutMs, retry });
      if (result.stalled) {
        shellStalled = true;
        appendLog(stepId, `没返回：${commandLine}`);
        return { kind: 'stalled', detail: `没有返回（宿主没把结果交回来）：${commandLine}` };
      }
      if (result.timedOut) {
        appendLog(stepId, `超时（${String(timeoutMs)} ms）：${commandLine}`);
        return { kind: 'error', detail: `超时（${String(timeoutMs)} ms）：${commandLine}` };
      }
      const output = result.stdout || result.stderr;
      if (output.trim() !== '') appendLog(stepId, tailLines(output, 12));
      if (result.exitCode !== 0) {
        return { kind: 'nonzero', detail: tailLines(result.stderr || result.stdout, 4) };
      }
      return { kind: 'ok', stdout: result.stdout };
    } catch (error) {
      appendLog(stepId, String(error));
      return { kind: 'error', detail: String(error) };
    }
  }

  async function probeVersion(): Promise<{ ok: boolean; missing: boolean; detail: string; stalled: boolean }> {
    const result = await exec('cli', `${commandToken} --version`, PREFLIGHT_VERSION_TIMEOUT_MS);
    if (result.kind === 'ok') {
      return { ok: true, missing: false, detail: result.stdout.trim().split('\n')[0] ?? '', stalled: false };
    }
    const onDisk = options.installed?.() === true;
    return {
      ok: false,
      missing: result.kind === 'nonzero' && !onDisk,
      detail: result.detail,
      stalled: result.kind === 'stalled',
    };
  }

  async function probeBridge(): Promise<BridgeVerdict> {
    const result = await exec('bridge', `${commandToken} doctor`, PREFLIGHT_DOCTOR_TIMEOUT_MS);
    if (result.kind === 'stalled') {
      return { ok: false, detail: result.detail, issues: ['unknown'], stalled: true };
    }
    if (result.kind !== 'ok') return { ok: false, detail: result.detail, issues: ['unknown'] };
    const report = readBridgeReport(result.stdout);
    if (report.ok) return report;
    return { ...report, command: bridgeFixCommand(command, report.issues, platform) };
  }

  async function installOpencli(): Promise<{ ok: boolean; detail: string }> {
    if (options.install !== undefined) {
      appendLog('cli', '> 安装 opencli');
      const installed = await options.install();
      if (installed.detail.trim() !== '') appendLog('cli', installed.detail);
      return installed;
    }
    const result = await exec('cli', installCommand, PREFLIGHT_INSTALL_TIMEOUT_MS, 'never');
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
      action: '预热浏览器站点',
    });
    const results = await Promise.all(
      reads.map((read) => exec('warm', opencliCommandLine(command, read, 'persistent', platform), WARM_TIMEOUT_MS)),
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

  async function doRun(from?: PreflightStepId): Promise<PreflightSnapshot> {
    const order: readonly PreflightStepId[] = ['toolchain', 'runtime', 'cli', 'bridge', 'diy', 'warm'];
    const skip = (id: PreflightStepId): boolean =>
      from !== undefined && order.indexOf(id) >= 0 && order.indexOf(id) < order.indexOf(from);
    const previous = new Map(current.steps.map((item) => [item.id, item]));
    shellStalled = false;
    logLines = [];
    stepLogs.clear();
    set({
      phase: 'checking',
      error: undefined,
      failure: undefined,
      guidance: undefined,
      bridgeIssues: undefined,
      diyGap: undefined,
      steps: steps().map((item) => {
        const kept = skip(item.id) ? previous.get(item.id) : undefined;
        return kept ?? item;
      }),
    });
    const toolchainStarted = skip('toolchain') ? undefined : options.probeToolchain?.();
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
    if (toolchain !== undefined && toolchain.detail.trim() !== '') appendLog('toolchain', toolchain.detail);
    for (const line of toolchain?.diagnostics ?? []) appendLog('toolchain', line);
    if (toolchain !== undefined && toolchain.ok && toolchain.pnpmProblem && options.provisionPnpm !== undefined) {
      set({ phase: 'installing' });
      patchStep('toolchain', { status: 'running', action: `装本地 pnpm@${LOCAL_PNPM_VERSION}` });
      appendLog('toolchain', '> 安装本地 pnpm');
      const provisioned = await options.provisionPnpm().catch((error: unknown) => ({
        ok: false,
        detail: String(error),
      }));
      if (provisioned.detail.trim() !== '') appendLog('toolchain', provisioned.detail);
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
        status: toolchain.ok && !toolchain.pnpmProblem ? 'ok' : 'failed',
        detail: toolchain.detail,
        action: undefined,
      });
      if (!toolchain.ok || toolchain.pnpmProblem) {
        return toolchain.stalled === true || toolchain.hostBroken === true
          ? hostFailure(toolchain.detail)
          : set({ phase: 'failed', error: toolchain.detail, failure: 'missing', guidance: 'install' });
      }
    }

    if (!skip('runtime') && options.runtimeCheck !== undefined) {
      appendLog('runtime', '> 检查运行环境');
      patchStep('runtime', { status: 'running' });
      const verdict = await options.runtimeCheck().catch((error: unknown) => ({
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      }));
      if (verdict.detail.trim() !== '') appendLog('runtime', verdict.detail);
      patchStep('runtime', { status: verdict.ok ? 'ok' : 'failed', detail: verdict.detail, action: undefined });
      if (!verdict.ok) return set({ phase: 'failed', error: verdict.detail, failure: 'missing', guidance: 'install' });
    }

    const diyStarted = skip('diy') ? undefined : options.probeDiy?.();
    if (withConsole && !skip('cli')) {
      patchStep('cli', { status: 'running', action: '检查 opencli 版本' });
      appendLog('cli', `> 盘上自检：隔离运行时${options.installed?.() === true ? '在' : '不在'}（探测前）`);
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
        appendLog('cli', `> 体检为何要装：${version.detail}`);
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
        patchStep('cli', { status: 'running', action: '安装 opencli', command: installCommand });
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
        patchStep('cli', { status: 'running', action: '检查 opencli 版本' });
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

    const keptBridge = previous.get('bridge');
    if (!skip('bridge')) patchStep('bridge', { status: 'running', action: '检查浏览器通道' });
    const bridge: BridgeVerdict = skip('bridge')
      ? ({
          ok: keptBridge?.status === 'ok',
          detail: keptBridge?.detail ?? '',
          issues: current.bridgeIssues ?? [],
        } as BridgeVerdict)
      : withBridge
        ? await probeBridge()
        : ({ ok: true, detail: '', issues: [] } as BridgeVerdict);
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
    return current.phase === 'ready' && now() - current.at < PREFLIGHT_FRESH_MS;
  }

  async function start(runOptions: { hard?: boolean; only?: PreflightStepId } = {}): Promise<PreflightSnapshot> {
    if (running !== null) return running;
    if (runOptions.hard !== true && runOptions.only === undefined && freshReady()) return current;

    const inflight = doRun(runOptions.only).catch((error: unknown) =>
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
