import { describe, expect, it, vi } from 'vitest';
import type { DataRequest, DataResult } from '../../contract/data.js';
import { opencliRunnerOf } from '../opencli-runner.js';

type Read = (request: DataRequest) => Promise<DataResult<unknown>>;

function readerOf(result: DataResult<unknown>): {
  readonly read: Read;
  readonly spy: ReturnType<typeof vi.fn>;
} {
  const spy = vi.fn(async (_request: DataRequest) => result);
  return { read: spy as unknown as Read, spy };
}

describe('opencliRunnerOf', () => {
  it('把 argv 原样交给读缝，解析后的值序列化回 stdout', async () => {
    const { read, spy } = readerOf({ ok: true, data: [{ name: 'lsznh' }] });
    const runner = opencliRunnerOf(read);

    await expect(
      runner(['argocd', 'application-resource-tree', '--name', 'lsznh']),
    ).resolves.toEqual({ stdout: JSON.stringify([{ name: 'lsznh' }]) });
    expect(spy).toHaveBeenCalledWith({
      kind: 'command',
      adapter: 'opencli',
      argv: ['argocd', 'application-resource-tree', '--name', 'lsznh'],
    });
  });

  it('timeoutMs 透传给读缝；不传就不出现这一格', async () => {
    const withTimeout = readerOf({ ok: true, data: [] });
    await opencliRunnerOf(withTimeout.read, { timeoutMs: 1_800_000 })([
      'coding',
      'ci-status',
    ]);
    expect(withTimeout.spy).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutMs: 1_800_000 }),
    );

    const withoutTimeout = readerOf({ ok: true, data: [] });
    await opencliRunnerOf(withoutTimeout.read)(['coding', 'ci-status']);
    expect(withoutTimeout.spy).toHaveBeenCalledWith(
      expect.not.objectContaining({ timeoutMs: expect.anything() }),
    );
  });

  it('未登录还原成 opencli 的约定：退出码 77 + AUTH_REQUIRED + 登录地址', async () => {
    const { read } = readerOf({
      ok: false,
      error: {
        code: 'auth',
        pageCode: 'auth-required',
        message: 'Coding 未登录',
        helpUrl: 'https://baiguokeji.coding.net/login',
      },
    });

    const failure = await opencliRunnerOf(read)(['coding', 'ci-status']).then(
      () => null,
      (error: unknown) => error as Error & { code?: number },
    );

    expect(failure).toBeInstanceOf(Error);
    expect(failure?.code).toBe(77);
    expect(failure?.message).toBe(
      [
        'Command failed: opencli coding ci-status',
        'code: AUTH_REQUIRED',
        'message: Coding 未登录',
        'help: Please open Chrome or Chromium and log in to https://baiguokeji.coding.net/login',
      ].join('\n'),
    );
  });

  it('其它失败保留 Command failed 外壳与原因 / 细节 / 下一步', async () => {
    const { read } = readerOf({
      ok: false,
      error: {
        code: 'command',
        pageCode: 'cli-command-failed',
        message: 'UNKNOWN：插件里没有这条命令',
        detail: 'error: unknown command',
        hint: '升级插件后重试',
      },
    });

    const failure = await opencliRunnerOf(read)([
      'argocd',
      'application-resource-tree',
    ]).then(
      () => null,
      (error: unknown) => error as Error,
    );

    expect(failure?.message).toBe(
      [
        'Command failed: opencli argocd application-resource-tree',
        'UNKNOWN：插件里没有这条命令',
        'error: unknown command',
        '升级插件后重试',
      ].join('\n'),
    );
  });

  it('没有原因时也有一句能看懂的兜底', async () => {
    const { read } = readerOf({
      ok: false,
      error: { code: 'command', message: '' },
    });

    const failure = await opencliRunnerOf(read)(['cmdb', 'publish']).then(
      () => null,
      (error: unknown) => error as Error,
    );

    expect(failure?.message).toBe(
      'Command failed: opencli cmdb publish\nopencli 这条命令没跑通',
    );
  });
});
