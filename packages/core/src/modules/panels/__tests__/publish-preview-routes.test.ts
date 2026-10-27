import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PublishPreview } from '@/kernel/contract/market-index';
import { MARKET_PUBLISH_PREVIEW_ROUTE } from '@/kernel/contract/market-index';
import { localGitIdentityOf } from '@/shared/api/host/diy-publish-preview';
import { publishPreviewRoutes } from '../model/publish-preview-routes';

function workshopOf(changelog?: string): string {
  const root = mkdtempSync(join(tmpdir(), 'wb-publish-preview-'));
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      name: '@demo/probe',
      version: '0.0.1',
      dsh: { workbench: { unit: 'probe' } },
    }),
  );
  if (changelog !== undefined) writeFileSync(join(root, 'CHANGELOG.md'), changelog);
  return root;
}

const CHANGELOG = '# 更新日志\n\n## v0.0.2\n\n`2026-10-26`\n\n### ✨ 新增\n\n- 这一版的新东西\n';

describe('发布预览的只读路由', () => {
  it('挂在 panels/market-publish-preview 上，按 unit 给出模块与版本；缺 unit 时给 null', async () => {
    const root = workshopOf();
    const home = mkdtempSync(join(tmpdir(), 'wb-publish-preview-home-'));
    const previous = process.env.DSH_WORKBENCH_HOME;
    process.env.DSH_WORKBENCH_HOME = home;
    try {
      const routes = publishPreviewRoutes(root);
      expect(Object.keys(routes)).toEqual([MARKET_PUBLISH_PREVIEW_ROUTE]);
      const handler = routes[MARKET_PUBLISH_PREVIEW_ROUTE];
      expect(handler).toBeDefined();
      expect(await handler?.(new URLSearchParams('unit=probe'))).toEqual({
        ok: true,
        preview: {
          name: '@demo/probe',
          version: '0.0.1',
          changelog: { version: '0.0.1', missing: true },
        },
      });
      expect(await handler?.(new URLSearchParams(''))).toEqual({ ok: true, preview: null });
      expect(await handler?.(new URLSearchParams('unit=nope'))).toEqual({ ok: true, preview: null });
    } finally {
      if (previous === undefined) delete process.env.DSH_WORKBENCH_HOME;
      else process.env.DSH_WORKBENCH_HOME = previous;
      rmSync(root, { recursive: true, force: true });
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('带了 author 就按这次的署名出预览（审批屏上的作者跟着变）', async () => {
    const root = workshopOf();
    const previous = process.env.DSH_WORKBENCH_HOME;
    process.env.DSH_WORKBENCH_HOME = mkdtempSync(join(tmpdir(), 'wb-publish-preview-home-'));
    try {
      const handler = publishPreviewRoutes(root)[MARKET_PUBLISH_PREVIEW_ROUTE];
      const read = async (query: string): Promise<{ readonly preview: PublishPreview | null }> =>
        (await handler?.(new URLSearchParams(query))) as { readonly preview: PublishPreview | null };
      expect((await read('unit=probe&author=Ada+%3Cada%40example.com%3E')).preview?.author).toBe(
        'Ada <ada@example.com>',
      );
      expect((await read('unit=probe')).preview?.author).toBeUndefined();
    } finally {
      if (previous === undefined) delete process.env.DSH_WORKBENCH_HOME;
      else process.env.DSH_WORKBENCH_HOME = previous;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('没写作者时把推断出的本机 git 身份补进来；显式 author 优先，推断不再跑', async () => {
    const root = workshopOf();
    const previous = process.env.DSH_WORKBENCH_HOME;
    process.env.DSH_WORKBENCH_HOME = mkdtempSync(join(tmpdir(), 'wb-publish-preview-home-'));
    let inferred = 0;
    try {
      const handler = publishPreviewRoutes(root, async () => {
        inferred += 1;
        return '陈康 <kang@example.com>';
      })[MARKET_PUBLISH_PREVIEW_ROUTE];
      const read = async (query: string): Promise<{ readonly preview: PublishPreview | null }> =>
        (await handler?.(new URLSearchParams(query))) as { readonly preview: PublishPreview | null };

      expect((await read('unit=probe')).preview?.author).toBe('陈康 <kang@example.com>');
      expect(inferred).toBe(1);
      expect((await read('unit=probe&author=Ada')).preview?.author).toBe('Ada');
      expect(inferred).toBe(1);
      expect((await read('unit=nope')).preview).toBeNull();
      expect(inferred).toBe(1);
    } finally {
      if (previous === undefined) delete process.env.DSH_WORKBENCH_HOME;
      else process.env.DSH_WORKBENCH_HOME = previous;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('本机 git 身份：读 git config 的 name / email，缺 email 就只给姓名', async () => {
    const shell = (outputs: readonly string[]): unknown => {
      let index = 0;
      return {
        resolve: (request: unknown) => request,
        async execute() {
          const text = outputs[index] ?? '';
          index += 1;
          return {
            result: async () => ({
              exitCode: 0,
              timedOut: false,
              aborted: false,
              stdout: { text, truncated: false },
              stderr: { text: '', truncated: false },
            }),
          };
        },
      };
    };

    expect(await localGitIdentityOf(shell(['陈康\n', 'kang@example.com\n']) as never, '/w/demo')).toBe(
      '陈康 <kang@example.com>',
    );
    expect(await localGitIdentityOf(shell(['陈康\n', '']) as never, '/w/demo')).toBe('陈康');
    expect(await localGitIdentityOf(shell(['', '']) as never, '/w/demo')).toBeUndefined();
    expect(await localGitIdentityOf(undefined, '/w/demo')).toBeUndefined();
  });

  it('给了版本就按那个版本找更新日志，缺这一版时标 missing', async () => {
    const root = workshopOf(CHANGELOG);
    const previous = process.env.DSH_WORKBENCH_HOME;
    process.env.DSH_WORKBENCH_HOME = mkdtempSync(join(tmpdir(), 'wb-publish-preview-home-'));
    try {
      const handler = publishPreviewRoutes(root)[MARKET_PUBLISH_PREVIEW_ROUTE];
      const read = async (query: string): Promise<{ readonly preview: PublishPreview | null }> =>
        (await handler?.(new URLSearchParams(query))) as { readonly preview: PublishPreview | null };
      const current = await read('unit=probe&version=0.0.2');
      expect(current.preview?.changelog).toEqual({
        version: '0.0.2',
        text: '`2026-10-26`\n\n### ✨ 新增\n\n- 这一版的新东西',
      });
      const bumped = await read('unit=probe&version=patch');
      expect(bumped.preview?.changelog).toEqual({
        version: '0.0.2',
        text: '`2026-10-26`\n\n### ✨ 新增\n\n- 这一版的新东西',
      });
      const absent = await read('unit=probe&version=0.0.3');
      expect(absent.preview?.changelog).toEqual({ version: '0.0.3', missing: true });
    } finally {
      if (previous === undefined) delete process.env.DSH_WORKBENCH_HOME;
      else process.env.DSH_WORKBENCH_HOME = previous;
      rmSync(root, { recursive: true, force: true });
    }
  });
});
