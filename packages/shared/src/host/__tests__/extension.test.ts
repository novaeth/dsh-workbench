import { describe, expect, it } from 'vitest';
import type { DataReader } from '../../contract/data.js';
import type { ExtensionNeed } from '../../contract/needs.js';
import { extensionCallerOf } from '../extension.js';

const NEED: ExtensionNeed = {
  kind: 'extension',
  runtime: 'opencli',
  name: 'coding',
  purpose: '测试',
};

function failingData(): DataReader {
  return {
    read: async () => ({
      ok: false,
      error: {
        code: 'command',
        message: 'opencli 这条命令没跑通（退出码 1）',
        detail: "error: unknown command 'issue-statuses'",
        pageCode: 'cli-unclassified',
      },
    }),
  } as unknown as DataReader;
}

describe('extensionCallerOf', () => {
  it('cli-unclassified 补“升级插件”的 message 与 hint，id 用调用方给的 suiteId', async () => {
    const caller = extensionCallerOf(failingData(), NEED, {
      suiteId: 'coding-issues',
    });
    await expect(caller.json(['issue-statuses'])).rejects.toMatchObject({
      code: 'cli-unclassified',
      message: expect.stringContaining('workbench_modules_update（id=coding-issues）'),
      hint: expect.stringContaining('coding issue-statuses --help'),
      detail: "error: unknown command 'issue-statuses'",
    });
  });

  it('别的码不补“插件版本旧”', async () => {
    const caller = extensionCallerOf(failingData(), NEED, {
      suiteId: 'coding-issues',
    });
    const data = {
      read: async () => ({
        ok: false,
        error: { code: 'auth', message: '需要登录', pageCode: 'auth-required' },
      }),
    } as unknown as DataReader;
    await expect(
      extensionCallerOf(data, NEED, { suiteId: 'x' }).json(['issue-statuses']),
    ).rejects.toMatchObject({ code: 'auth-required', message: '需要登录' });
    expect(caller).toBeDefined();
  });
});
