import type { InstallFailure, Translate } from '@dsh-workbench/shared';
import type { BundleChange } from '@/kernel/contract/bundle-install';
import { failureCode } from '../market/add-module-text';

export interface FailureCardModel {
  readonly command: string;
  readonly output: string;
  readonly exitCode: number | null;
  readonly title?: string | undefined;
  readonly tone?: 'alert' | undefined;
  readonly fact: string;
  readonly fixLabel: string;
  readonly fix: string;
  readonly copiedHint?: string | undefined;
}

export interface FailureCardExtras {
  readonly actionLabel?: string | undefined;
  readonly askAgent?: string | undefined;
  readonly outputLabel?: string | undefined;
  readonly hideOutputLabel?: string | undefined;
  readonly showCommand?: boolean | undefined;
  readonly actionFirst?: boolean | undefined;
  readonly hideRetry?: boolean | undefined;
}

const TITLE_KEY: Readonly<Record<InstallFailure['kind'], string>> = {
  permission: 'panels.market.failure.permission',
  'disk-full': 'panels.market.failure.diskFull',
  auth: 'panels.market.failure.auth',
  sandbox: 'panels.market.failure.sandbox',
  unknown: 'panels.market.failure.unknown',
};

const ASK_AGENT_KEY = 'panels.market.failure.askAgent';

export function updateStuckCardOf(
  t: Translate,
  input: {
    readonly command: string;
    readonly fact?: string | undefined;
    readonly from?: string | undefined;
    readonly latest?: string | undefined;
  },
): FailureCardModel {
  const unknown = t('panels.market.updateUnknownVersion');
  return {
    title: t('panels.market.updateStuck.title'),
    fact:
      input.fact ??
      t('panels.market.updateStuck.factNoChange', {
        from: input.from ?? unknown,
        latest: input.latest ?? unknown,
      }),
    fixLabel: t('panels.market.failure.copyFix'),
    fix: input.command,
    copiedHint: t('panels.market.updateStuck.copiedHint'),
    command: '',
    output: '',
    exitCode: null,
  };
}

export function shellPath(path: string): string {
  return /^[\w./@%+-]+$/.test(path) ? path : `'${path.replaceAll("'", "'\\''")}'`;
}

export function ownerLabel(uid: number): string {
  return uid === 0 ? 'root' : `uid ${uid}`;
}

function failureReasonOf(failure: InstallFailure, t: Translate): string {
  const summary = failure.summary?.trim() ?? '';
  if (summary !== '') return summary;
  const line = failure.output
    .split('\n')
    .map((one) => one.trim())
    .find((one) => one !== '');
  return line ?? t('panels.market.failure.noReason');
}

function agentCardOf(
  failure: InstallFailure,
  t: Translate,
  text: { readonly title: string; readonly fact: string; readonly fix: string },
): FailureCardModel {
  return {
    title: text.title,
    fact: text.fact,
    fixLabel: t(ASK_AGENT_KEY),
    fix: text.fix,
    command: failure.command,
    output: failure.output,
    exitCode: failure.exitCode,
  };
}

const RETRY_CODES: ReadonlySet<string> = new Set(['operation-error', 'not-bundle', 'invalid-spec']);

export function installCardOf(
  change: BundleChange | undefined,
  t: Translate,
  reason: string,
): FailureCardModel | undefined {
  const output = (change?.errorDetail ?? '').trim();
  if (output === '') return undefined;
  const fact = change !== undefined && RETRY_CODES.has(failureCode(change))
    ? `${reason} ${t('panels.market.failure.retryAdvice')}`
    : reason;
  return {
    fact,
    tone: 'alert',
    fixLabel: t('panels.market.failure.copyOutput'),
    fix: output,
    copiedHint: t('panels.market.failure.copyOutputHint'),
    command: change?.packageResult?.command ?? '',
    output,
    exitCode: change?.packageResult?.exitCode ?? null,
  };
}

export function failureCardOf(failure: InstallFailure, t: Translate): FailureCardModel {
  const path = failure.path ?? '';
  const fix = failure.fix;
  if (fix.kind === 'chown') {
    const ownerUid = failure.owner?.uid;
    return {
      title: t(TITLE_KEY[failure.kind]),
      fact:
        ownerUid === undefined
          ? t('panels.market.failure.factMode', { path, mode: failure.mode ?? '?' })
          : t('panels.market.failure.factOwner', {
              path,
              owner: ownerLabel(ownerUid),
              me: ownerLabel(failure.current.uid),
            }),
      fixLabel: t('panels.market.failure.copyFix'),
      fix: `sudo chown -R ${fix.uid}:${fix.gid} ${shellPath(fix.path)}`,
      copiedHint: t('panels.market.failure.copiedHint'),
      command: failure.command,
      output: failure.output,
      exitCode: failure.exitCode,
    };
  }
  if (fix.kind === 'chmod') {
    return {
      title: t(TITLE_KEY[failure.kind]),
      fact: t('panels.market.failure.factMode', { path, mode: failure.mode ?? '?' }),
      fixLabel: t('panels.market.failure.copyFix'),
      fix: `chmod -R u+w ${shellPath(fix.path)}`,
      copiedHint: t('panels.market.failure.copiedHint'),
      command: failure.command,
      output: failure.output,
      exitCode: failure.exitCode,
    };
  }
  if (fix.kind === 'space') {
    return {
      title: t(TITLE_KEY[failure.kind]),
      fact: t('panels.market.failure.factSpace', { path }),
      fixLabel: t('panels.market.failure.copyFix'),
      fix: `du -sh ${shellPath(fix.path)}`,
      copiedHint: t('panels.market.failure.copiedHint'),
      command: failure.command,
      output: failure.output,
      exitCode: failure.exitCode,
    };
  }
  const code = failure.exitCode === null ? '?' : String(failure.exitCode);
  if (failure.kind === 'auth') {
    const registry = failure.registry ?? t('panels.market.failure.thisSource');
    return agentCardOf(failure, t, {
      title: t(TITLE_KEY[failure.kind]),
      fact: t('panels.market.failure.factAuth', { registry }),
      fix: t('panels.market.failure.askAgentAuth', {
        command: failure.command,
        registry,
        code,
        reason: failureReasonOf(failure, t),
      }),
    });
  }
  if (failure.kind === 'unknown') {
    const reason = failureReasonOf(failure, t);
    const empty = reason === t('panels.market.failure.noReason');
    return agentCardOf(failure, t, {
      title: t(empty ? TITLE_KEY[failure.kind] : 'panels.market.failure.title'),
      fact: empty
        ? t('panels.market.failure.factUnknown', { code })
        : t('panels.market.failure.factSummary', { code, reason }),
      fix: t('panels.market.failure.askAgentUnknown', { command: failure.command, code, reason }),
    });
  }
  const where = path === '' ? t('panels.market.failure.nowhere') : path;
  return agentCardOf(failure, t, {
    title: t(TITLE_KEY[failure.kind]),
    fact: t('panels.market.failure.factStuck', { path: where }),
    fix: t('panels.market.failure.askAgentText', { command: failure.command, path: where, code }),
  });
}
