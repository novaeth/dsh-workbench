import { describe, expect, it, vi } from 'vitest';
import type { LibNeed } from '../../contract/needs.js';
import type { LibReader } from '../../contract/lib.js';
import type { LibRunner } from '../../contract/runner.js';
import { withLibRunners } from '../lib-runners.js';

const runner: LibRunner = async () => ({ stdout: '[]' });

function needOf(runs?: readonly string[]): LibNeed {
  return {
    kind: 'lib',
    name: 'opencli-workflow',
    purpose: '发布编排',
    ...(runs === undefined ? {} : { runs }),
  };
}

function libsOf(module: unknown): LibReader {
  return {
    async load<T = unknown>(): Promise<T> {
      return module as T;
    },
  };
}

function logger(): { readonly warn: ReturnType<typeof vi.fn<(message: string) => void>> } {
  return { warn: vi.fn<(message: string) => void>() };
}

describe('withLibRunners', () => {
  it('★ 换一个运行时名字（mcp）照样注入：外壳不认具体名字，只看清单的 runs', async () => {
    const module = { setMcpRunner: vi.fn() };
    const libs = withLibRunners(libsOf(module), { mcp: runner }, logger());

    await libs.load(needOf(['mcp']), 'src/run.js');

    expect(module.setMcpRunner).toHaveBeenCalledWith(runner);
  });

  it('没声明 runs → 原样返回，不注入、不记 warn', async () => {
    const module = { setOpencliRunner: vi.fn() };
    const warn = logger();
    const libs = withLibRunners(libsOf(module), { opencli: runner }, warn);

    await expect(libs.load(needOf(), 'src/utils.js')).resolves.toBe(module);
    expect(module.setOpencliRunner).not.toHaveBeenCalled();
    expect(warn.warn).not.toHaveBeenCalled();
  });

  it('声明了 opencli 且库有 setOpencliRunner → 把执行器交进去', async () => {
    const module = { setOpencliRunner: vi.fn() };
    const warn = logger();
    const libs = withLibRunners(libsOf(module), { opencli: runner }, warn);

    await expect(libs.load(needOf(['opencli']), 'src/utils.js')).resolves.toBe(module);
    expect(module.setOpencliRunner).toHaveBeenCalledWith(runner);
    expect(warn.warn).not.toHaveBeenCalled();
  });

  it('库版本旧、没有 setter → 不注入，只 warn 一次', async () => {
    const module = {};
    const warn = logger();
    const libs = withLibRunners(libsOf(module), { opencli: runner }, warn);

    await libs.load(needOf(['opencli']), 'src/utils.js');
    await libs.load(needOf(['opencli']), 'src/utils.js');

    expect(warn.warn).toHaveBeenCalledTimes(1);
    expect(String(warn.warn.mock.calls[0]?.[0])).toContain('没有 setOpencliRunner');
  });

  it('声明了外壳没有的运行时 → 不注入，只 warn 一次', async () => {
    const module = { setGitRunner: vi.fn() };
    const warn = logger();
    const libs = withLibRunners(libsOf(module), { opencli: runner }, warn);

    await libs.load(needOf(['git']), 'src/utils.js');

    expect(module.setGitRunner).not.toHaveBeenCalled();
    expect(warn.warn).toHaveBeenCalledTimes(1);
    expect(String(warn.warn.mock.calls[0]?.[0])).toContain('没有这个执行器');
  });

  it('模块导出不是对象（函数 / 原始值）也不炸', async () => {
    const warn = logger();
    const libs = withLibRunners(libsOf(() => undefined), { opencli: runner }, warn);

    await expect(libs.load(needOf(['opencli']), 'src/utils.js')).resolves.toBeTypeOf('function');
    expect(warn.warn).toHaveBeenCalledTimes(1);
  });
});
