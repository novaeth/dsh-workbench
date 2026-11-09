import { describe, expect, it, vi } from 'vitest';
import { installIsolatedRuntime } from '../isolated-install.js';
import type { IsolatedInstallDeps } from '../isolated-install.js';

const COMMAND = 'pnpm add --dir /tmp/toolchain @jackwener/opencli@1.2.1';
const STORE_ERROR = 'ERR_PNPM_UNEXPECTED_STORE  Expected store-dir /old/store, got /new/store';
const SECOND_FAILURE = 'ERR_PNPM_UNEXPECTED_STORE  still the wrong store';

const OK_RUN = { ok: true, detail: '+ @jackwener/opencli 1.2.1' };

function depsOf(input: {
  results: readonly { ok: boolean; detail: string }[];
  resolved: readonly boolean[];
}): { deps: IsolatedInstallDeps; run: ReturnType<typeof vi.fn>; resolves: ReturnType<typeof vi.fn>; drop: ReturnType<typeof vi.fn>; log: ReturnType<typeof vi.fn> } {
  let runIndex = 0;
  let resolveIndex = 0;
  const run = vi.fn(async () => input.results[Math.min(runIndex++, input.results.length - 1)] ?? OK_RUN);
  const resolves = vi.fn(
    () => input.resolved[Math.min(resolveIndex++, input.resolved.length - 1)] ?? true,
  );
  const drop = vi.fn();
  const log = vi.fn();
  return { deps: { run, resolves, drop, log }, run, resolves, drop, log };
}

describe('installIsolatedRuntime（装完自检 · 坏了清掉重装一遍）', () => {
  it('★ 第一遍 ERR_PNPM_UNEXPECTED_STORE → 清一次 → 第二遍装上且读得到 → ok，只清一次', async () => {
    const { deps, run, drop, resolves, log } = depsOf({
      results: [{ ok: false, detail: STORE_ERROR }, OK_RUN],
      resolved: [true],
    });

    const result = await installIsolatedRuntime(deps, COMMAND);

    expect(result.ok).toBe(true);
    expect(result.reinstalled).toBe(true);
    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenNthCalledWith(1, COMMAND);
    expect(run).toHaveBeenNthCalledWith(2, COMMAND);
    expect(drop).toHaveBeenCalledTimes(1);
    expect(resolves).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
    expect(result.detail).toContain('装了两遍');
    expect(result.detail).toContain('清掉 toolchain/node_modules 重装后装好了');
    expect(result.detail).toContain(STORE_ERROR);
  });

  it('★ 第一遍成功但那份 opencli 读不到（断链）→ 清掉重装一遍', async () => {
    const { deps, run, drop, resolves } = depsOf({
      results: [OK_RUN, OK_RUN],
      resolved: [false, true],
    });

    const result = await installIsolatedRuntime(deps, COMMAND);

    expect(result.ok).toBe(true);
    expect(result.reinstalled).toBe(true);
    expect(run).toHaveBeenCalledTimes(2);
    expect(drop).toHaveBeenCalledTimes(1);
    expect(resolves).toHaveBeenCalledTimes(2);
    expect(result.detail).toContain('第一遍装完还是读不到');
    expect(result.detail).toContain('清掉 toolchain/node_modules 重装后装好了');
  });

  it('★ 两遍都失败 → ok=false，只清一次，不跑第三遍', async () => {
    const { deps, run, drop } = depsOf({
      results: [{ ok: false, detail: STORE_ERROR }, { ok: false, detail: SECOND_FAILURE }],
      resolved: [true],
    });

    const result = await installIsolatedRuntime(deps, COMMAND);

    expect(result.ok).toBe(false);
    expect(result.reinstalled).toBe(true);
    expect(run).toHaveBeenCalledTimes(2);
    expect(drop).toHaveBeenCalledTimes(1);
    expect(result.detail).toContain('装了两遍');
    expect(result.detail).toContain('清掉 toolchain/node_modules 重装后还是没装上');
    expect(result.detail).toContain(STORE_ERROR);
    expect(result.detail).toContain(SECOND_FAILURE);
  });

  it('★ 第一遍就成功且读得到 → 不清、不重跑', async () => {
    const { deps, run, drop, resolves, log } = depsOf({
      results: [OK_RUN],
      resolved: [true],
    });

    const result = await installIsolatedRuntime(deps, COMMAND);

    expect(result).toEqual({ ok: true, detail: OK_RUN.detail, reinstalled: false });
    expect(run).toHaveBeenCalledTimes(1);
    expect(drop).not.toHaveBeenCalled();
    expect(resolves).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
  });

  it('第一遍失败但不是 store 对不上 → 原样返回，不重装', async () => {
    const { deps, run, drop } = depsOf({
      results: [{ ok: false, detail: 'ERR_PNPM_FETCH_404  GET https://registry.npmjs.org/@jackwener%2Fopencli' }],
      resolved: [true],
    });

    const result = await installIsolatedRuntime(deps, COMMAND);

    expect(result.ok).toBe(false);
    expect(result.reinstalled).toBe(false);
    expect(result.detail).toContain('ERR_PNPM_FETCH_404');
    expect(run).toHaveBeenCalledTimes(1);
    expect(drop).not.toHaveBeenCalled();
  });

  it.each([
    ['ERR_PNPM_UNEXPECTED_STORE', STORE_ERROR],
    ['ERR_PNPM_MODULES_BREAKING_CHANGE', 'ERR_PNPM_MODULES_BREAKING_CHANGE  node_modules path: /x'],
    ['ERR_PNPM_ABORTED_REMOVE_MODULES_DIR', 'ERR_PNPM_ABORTED_REMOVE_MODULES_DIR  Failed to remove existing node_modules'],
  ])('store 位置不合这一族（%s）→ 清一次重装', async (code, detail) => {
    const { deps, run, drop } = depsOf({
      results: [{ ok: false, detail }, OK_RUN],
      resolved: [true],
    });

    const result = await installIsolatedRuntime(deps, COMMAND);

    expect(result.ok).toBe(true);
    expect(result.reinstalled).toBe(true);
    expect(run).toHaveBeenCalledTimes(2);
    expect(drop).toHaveBeenCalledTimes(1);
    expect(result.detail).toContain(code);
  });

  it('第二遍装上但那份 opencli 还是读不到 → ok=false', async () => {
    const { deps, run, drop } = depsOf({
      results: [{ ok: false, detail: STORE_ERROR }, OK_RUN],
      resolved: [false],
    });

    const result = await installIsolatedRuntime(deps, COMMAND);

    expect(result.ok).toBe(false);
    expect(result.reinstalled).toBe(true);
    expect(run).toHaveBeenCalledTimes(2);
    expect(drop).toHaveBeenCalledTimes(1);
    expect(result.detail).toContain('清掉 toolchain/node_modules 重装后还是读不到');
  });
});
