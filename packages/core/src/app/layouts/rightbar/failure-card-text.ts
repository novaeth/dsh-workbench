import type { InstallFailure, Translate } from '@dsh-workbench/shared';

export interface FailureCardModel {
  readonly title: string;
  readonly fact: string;
  readonly fixLabel: string;
  readonly fix: string;
  readonly copiedHint: string;
  readonly command: string;
  readonly output: string;
  readonly exitCode: number | null;
}

const TITLE_KEY: Readonly<Record<InstallFailure['kind'], string>> = {
  permission: 'panels.market.failure.permission',
  'disk-full': 'panels.market.failure.diskFull',
  sandbox: 'panels.market.failure.sandbox',
  unknown: 'panels.market.failure.unknown',
};

const ASK_AGENT_KEY = 'panels.market.failure.askAgent';

export function shellPath(path: string): string {
  return /^[\w./@%+-]+$/.test(path) ? path : `'${path.replaceAll("'", "'\\''")}'`;
}

export function ownerLabel(uid: number): string {
  return uid === 0 ? 'root' : `uid ${uid}`;
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
  return {
    title: t(TITLE_KEY[failure.kind]),
    fact: t('panels.market.failure.factStuck', { path: path === '' ? t('panels.market.failure.nowhere') : path }),
    fixLabel: t(ASK_AGENT_KEY),
    fix: t('panels.market.failure.askAgentText', {
      command: failure.command,
      path: path === '' ? t('panels.market.failure.nowhere') : path,
      code: failure.exitCode === null ? '?' : String(failure.exitCode),
    }),
    copiedHint: t('panels.market.failure.askAgentHint'),
    command: failure.command,
    output: failure.output,
    exitCode: failure.exitCode,
  };
}
