import { storeMismatchIn } from './store-mismatch.js';

export interface InstallAttempt {
  readonly ok: boolean;
  readonly detail: string;
}

export interface InstallRetryDeps {
  readonly run: (command: string) => Promise<InstallAttempt>;
  readonly resolves: () => boolean;
  readonly drop: () => void;
  readonly log?: ((message: string) => void) | undefined;
  readonly mismatch?: ((attempt: InstallAttempt) => boolean) | undefined;
  readonly describe?: (() => string) | undefined;
}

export interface InstallRetryResult {
  readonly ok: boolean;
  readonly detail: string;
  readonly reinstalled: boolean;
}

export interface InstallRetryWording {
  readonly what: string;
  readonly dropLabel: string;
  readonly mismatch: string;
  readonly unresolved: string;
  readonly settled: string;
  readonly unresolvedAgain: string;
  readonly failedAgain: string;
  readonly logPrefix?: string | undefined;
}

function rawOf(detail: string): string {
  const text = detail.trim();
  return text === '' ? '（没有输出）' : text;
}

function outcomeOf(wording: InstallRetryWording, attempt: InstallAttempt, resolved: boolean): string {
  if (!attempt.ok) return wording.failedAgain;
  return resolved ? wording.settled : wording.unresolvedAgain;
}

export async function installWithRetry(
  deps: InstallRetryDeps,
  command: string,
  wording: InstallRetryWording,
): Promise<InstallRetryResult> {
  const mismatchOf = deps.mismatch ?? ((attempt: InstallAttempt) => !attempt.ok && storeMismatchIn(attempt.detail));
  const first = await deps.run(command);
  const storeMismatch = mismatchOf(first);
  const unresolved = first.ok && !deps.resolves();
  if (!storeMismatch && !unresolved) return { ok: first.ok, detail: first.detail, reinstalled: false };

  const seen = deps.describe?.() ?? '';
  const why = storeMismatch
    ? wording.mismatch
    : seen === ''
      ? wording.unresolved
      : `${wording.unresolved}（现场：${seen}）`;
  deps.log?.(`${wording.logPrefix ?? '[dsh-workbench] '}${wording.what} 安装重来一遍：${why}`);
  deps.drop();

  const second = await deps.run(command);
  const settled = second.ok && deps.resolves();
  const outcome = outcomeOf(wording, second, settled);
  return {
    ok: settled,
    detail: `${wording.what} 装了两遍：${why}，清掉 ${wording.dropLabel} 重装后${outcome}。原始输出：第一遍 ${rawOf(first.detail)}；第二遍 ${rawOf(second.detail)}`,
    reinstalled: true,
  };
}
