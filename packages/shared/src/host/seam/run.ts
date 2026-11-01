import type { DshShell } from '../../api/dsh.js';
import { workbenchRoot } from '../data-root.js';
import { runShell, type ShellResult } from '../shell.js';
import { deniedPathOf, sandboxDeniedOf } from './denial.js';
import { seamProductEnv } from './env.js';
import {
  SeamError,
  type DenialScope,
  type SeamDenial,
  type SeamFact,
  type SeamMode,
  type SeamPolicy,
  type WriteIntent,
} from './intent.js';
import {
  denialScopeOf,
  narrowerMode,
  pathsPolicy,
  policyOf,
  productPolicy,
  seamModeOf,
  workspacePolicy,
} from './policy.js';

export interface SeamRequest {
  readonly command: string;
  readonly intent: WriteIntent;
  readonly session?: unknown;
  readonly workdir?: string | undefined;
  readonly timeoutMs?: number | undefined;
  readonly env?: Readonly<Record<string, string>> | undefined;
  readonly retry?: 'safe' | 'never' | undefined;
  readonly bestEffort?: true | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface SeamOutcome extends ShellResult {
  readonly denial?: SeamDenial | undefined;
}

export interface Seam {
  run(request: SeamRequest): Promise<SeamOutcome>;
  facts(): readonly SeamFact[];
}

export interface SeamPorts {
  readonly shell: DshShell;
  readonly runtimeRoot?: string | undefined;
  readonly ceiling?: SeamMode | undefined;
  readonly grantOf?: ((session: unknown) => SeamPolicy | undefined) | undefined;
  readonly realHome?: string | undefined;
  readonly factLimit?: number | undefined;
  readonly logger?: { warn?(message: string): void } | undefined;
}

const DENIAL_MARKER = /\[sandbox: file access denied under [a-z-]+ mode\]/i;

function scopeText(scope: DenialScope): string {
  if (scope === 'product') return '工作台自己的目录';
  if (scope === 'workspace') return '会话工作区';
  if (scope === 'external') return '工作区之外的路径';
  return '没认出来的路径';
}

function denialMessageOf(scope: DenialScope, path: string | undefined, output: string): string {
  const where = path === undefined ? '' : `：${path}`;
  const marker = DENIAL_MARKER.test(output) ? '' : '（输出里没有沙箱标记，按拒绝处理）';
  const next =
    scope === 'external'
      ? '要写工作区外的路径得先让用户点头：把目标改到工作区，或让工具补上审批后再试'
      : '这是工作台自己的声明问题，不是用户的配置问题：把命令、域与路径一起记下来交给维护者';
  return `被沙箱挡住了（${scopeText(scope)}${where}）${marker}。${next}`;
}

function settle(result: ShellResult, denial?: SeamDenial): SeamOutcome {
  const outcome: SeamOutcome = {
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    aborted: result.aborted,
    stdout: result.stdout,
    stderr: result.stderr,
    truncated: result.truncated,
    stalled: result.stalled,
    ...(denial === undefined ? {} : { denial }),
  };
  return outcome;
}

export function createSeam(ports: SeamPorts): Seam {
  const runtimeRoot = ports.runtimeRoot ?? workbenchRoot();
  const ceiling = ports.ceiling ?? seamModeOf(process.env['DSH_PERMISSION_MODE']);
  const limit = ports.factLimit ?? 80;
  const facts: SeamFact[] = [];

  function record(fact: SeamFact): void {
    facts.push(fact);
    if (facts.length > limit) facts.splice(0, facts.length - limit);
  }

  function grantFor(session: unknown): SeamPolicy | undefined {
    if (ports.grantOf === undefined || session === undefined || session === null) return undefined;
    try {
      return ports.grantOf(session);
    } catch {
      return undefined;
    }
  }

  async function attempt(request: SeamRequest, policy: SeamPolicy): Promise<ShellResult> {
    return runShell(ports.shell, request.command, {
      ...(request.workdir === undefined ? {} : { workdir: request.workdir }),
      ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      env: { ...seamProductEnv({ runtimeRoot, realHome: ports.realHome }), ...(request.env ?? {}) },
      sandboxPolicy: policy,
    });
  }

  function healPolicyOf(intent: WriteIntent, scope: DenialScope, granted: SeamPolicy | undefined): SeamPolicy | undefined {
    if (scope === 'product' && intent.kind !== 'product') return productPolicy(ceiling, runtimeRoot);
    if (scope === 'workspace' && intent.kind === 'workspace') {
      if (granted === undefined) return undefined;
      try {
        return workspacePolicy(ceiling, granted);
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  return {
    async run(request: SeamRequest): Promise<SeamOutcome> {
      const granted = grantFor(request.session);
      const policy = policyOf(request.intent, ceiling, runtimeRoot, granted);
      let result = await attempt(request, policy);
      const denialScopePath = () => deniedPathOf(result.stderr, result.stdout);
      if (!sandboxDeniedOf(result.sandbox)) {
        record({
          at: Date.now(),
          command: request.command,
          intent: request.intent.kind,
          mode: policy.mode,
          workspaceRoot: policy.workspaceRoot,
          exitCode: result.exitCode,
          timedOut: result.timedOut,
          stalled: result.stalled,
        });
        return settle(result);
      }

      const path = denialScopePath();
      const scope = denialScopeOf(path, policy, runtimeRoot, granted);
      const healedPolicy = request.retry === 'safe' ? healPolicyOf(request.intent, scope, granted) : undefined;
      let healed = false;
      if (healedPolicy !== undefined) {
        const retried = await attempt(request, healedPolicy).catch(() => undefined);
        if (retried !== undefined && !sandboxDeniedOf(retried.sandbox)) {
          result = retried;
          healed = true;
        }
      }

      const denial: SeamDenial = {
        ...(path === undefined ? {} : { path }),
        scope,
        ...(healed ? { healed: true } : {}),
      };
      record({
        at: Date.now(),
        command: request.command,
        intent: request.intent.kind,
        mode: policy.mode,
        workspaceRoot: policy.workspaceRoot,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        stalled: result.stalled,
        denial,
      });
      if (healed) return settle(result, denial);
      if (request.bestEffort === true) {
        ports.logger?.warn?.(`[dsh-workbench] ${denialMessageOf(scope, path, `${result.stderr}\n${result.stdout}`)}`);
        return settle(result, denial);
      }
      throw new SeamError('sandbox-denied', denialMessageOf(scope, path, `${result.stderr}\n${result.stdout}`), {
        ...(path === undefined ? {} : { path }),
        scope,
      });
    },
    facts: () => facts,
  };
}

export function sealedPolicyOf(policy: SeamPolicy, ceiling: SeamMode): SeamPolicy {
  return { mode: narrowerMode(ceiling, policy.mode), workspaceRoot: policy.workspaceRoot };
}

export { pathsPolicy, policyOf, productPolicy, workspacePolicy };
