import { storeMismatchIn } from './store-mismatch.js';

export interface IsolatedInstallRun {
  readonly ok: boolean;
  readonly detail: string;
}

export interface IsolatedInstallDeps {
  readonly run: (command: string) => Promise<IsolatedInstallRun>;
  readonly resolves: () => boolean;
  readonly drop: () => void;
  readonly log?: ((message: string) => void) | undefined;
}

export interface IsolatedInstallResult {
  readonly ok: boolean;
  readonly detail: string;
  readonly reinstalled: boolean;
}

function isStoreMismatch(run: IsolatedInstallRun): boolean {
  return !run.ok && storeMismatchIn(run.detail);
}

function rawOf(detail: string): string {
  const text = detail.trim();
  return text === '' ? '（没有输出）' : text;
}

function rawPair(first: IsolatedInstallRun, second: IsolatedInstallRun): string {
  return `原始输出：第一遍 ${rawOf(first.detail)}；第二遍 ${rawOf(second.detail)}`;
}

export async function installIsolatedRuntime(
  deps: IsolatedInstallDeps,
  command: string,
): Promise<IsolatedInstallResult> {
  const first = await deps.run(command);
  const storeMismatch = isStoreMismatch(first);
  const unresolved = first.ok && !deps.resolves();
  if (!storeMismatch && !unresolved) {
    return { ok: first.ok, detail: first.detail, reinstalled: false };
  }

  const why = storeMismatch
    ? '第一遍没装上（下载缓存和已有的 node_modules 对不上）'
    : '第一遍装完还是读不到';
  deps.log?.(`[dsh-workbench] opencli 安装重来一遍：${why}`);
  deps.drop();

  const second = await deps.run(command);
  const settled = second.ok && deps.resolves();
  const outcome = settled ? '装好了' : second.ok ? '还是读不到' : '还是没装上';
  return {
    ok: settled,
    detail: `opencli 装了两遍：${why}，清掉 toolchain/node_modules 重装后${outcome}。${rawPair(first, second)}`,
    reinstalled: true,
  };
}
