import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { DshAgentPresetRow, DshHostContext } from '@dsh-workbench/shared';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import { createSeam, quoteShellArgFor } from '@dsh-workbench/shared/host';
import { WAKE_BROWSER_ROUTE } from '@dsh-workbench/shared/contract/protocol/preflight-wake';
import { localPnpmBin, localPnpmCommand, provisionWorkbenchPnpm, registerPreflight } from '../index.js';
import type { DesktopBrowser } from '../index.js';
import { ALL_OK } from './preflight-fixtures';

function seamFor(shell: Parameters<typeof createSeam>[0]['shell']) {
  return createSeam({ shell, runtimeRoot: '/tmp/wb-seam-test' });
}


const BROKEN: readonly DshAgentPresetRow[] = [
  { id: 'standard' },
  { id: 'workbench-diy', name: '工作台 DIY 模式', broken: 'tool-schedule (@deepseek-ai/dsh-tool-schedule): never started' },
];

type Answer = {
  ok: boolean;
  phase?: string;
  diyGap?: { rows: readonly string[]; command: string };
  canWakeBrowser?: boolean;
  status?: string;
};

function wire(
  presets: readonly DshAgentPresetRow[],
  profileDir?: string,
  desktopBrowser?: DesktopBrowser,
) {
  const fake = createFakeShell([
    { stdout: 'v24.21.0\n' },
    { stdout: '10.9.4\n' },
    { stdout: '10.32.1\n' },
    ...ALL_OK.map((step) => ({ ...step })),
  ]);
  const routes: Record<string, (search: URLSearchParams) => Answer> = {};
  const ctx = {
    get: (name: string) => {
      if (name === 'agentPresets') return { list: async () => presets };
      if (name === 'profileContext' && profileDir !== undefined) return { dir: profileDir };
      return undefined;
    },
  };
  registerPreflight({
    routes: routes as never,
    ctx: ctx as unknown as DshHostContext,
    seam: seamFor(fake.shell),
    runtimeCommands: { opencli: 'opencli' },
    warmReads: () => [],
    ...(desktopBrowser === undefined ? {} : { desktopBrowser }),
  });
  const handler = routes.preflight;
  if (handler === undefined) throw new Error('preflight 路由没接上');
  return { fake, handler, routes };
}

async function settled(handler: (search: URLSearchParams) => Answer): Promise<Answer> {
  const until = Date.now() + 1_000;
  for (;;) {
    const answer = handler(new URLSearchParams(''));
    if (answer.phase === 'ready' || answer.phase === 'failed') return answer;
    if (Date.now() > until) return answer;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('registerPreflight（把启动体检接上 preflight 路由）', () => {
  it('路由回 { ok: true, ...快照 }；体检那一拍带 ?hard=1 时重来一轮', async () => {
    const { fake, handler } = wire(BROKEN);

    await settled(handler);
    await handler(new URLSearchParams('hard=1'));

    expect(fake.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('★ DIY 模式挂不起来 → 路由那一拍带着 diyGap（客户端据此停在预检页）', async () => {
    const { handler } = wire(BROKEN);
    const answer = await settled(handler);

    expect(answer.ok).toBe(true);
    expect(answer.diyGap?.rows).toEqual(['tool-schedule']);
    expect(answer.diyGap?.command).toBe('npm i -g @deepseek-ai/dsh@latest');
  });

  it('挂得起来 → 不带 gap（门照常放行）', async () => {
    const { handler } = wire([{ id: 'workbench-diy', name: '工作台 DIY 模式' }]);
    const answer = await settled(handler);

    expect(answer.diyGap).toBeUndefined();
  });

  it('★ profile 是 desktop → 预检带上「可以打开浏览器」与唤醒路由', async () => {
    const observe = vi.fn(async () => undefined);
    const wake = vi.fn(async () => ({ status: 'browser-open' as const, browser: 'chrome' as const }));
    const { handler, routes } = wire(
      [{ id: 'workbench-diy', name: '工作台 DIY 模式' }],
      '/Users/who/.dsh/profiles/desktop',
      { observe, wake },
    );
    const answer = await settled(handler);

    expect(answer.canWakeBrowser).toBe(true);
    expect(observe).toHaveBeenCalledTimes(1);
    const wakeHandler = routes[WAKE_BROWSER_ROUTE];
    expect(wakeHandler).toBeDefined();
    expect(await wakeHandler!(new URLSearchParams(''))).toMatchObject({
      ok: true,
      status: 'browser-open',
      browser: 'chrome',
    });
    expect(wake).toHaveBeenCalledTimes(1);
  });

  it('★ 其它 profile（workbench / web）不碰浏览器：没有唤醒路由、也不发 pgrep', async () => {
    const { fake, handler, routes } = wire(
      [{ id: 'workbench-diy', name: '工作台 DIY 模式' }],
      '/Users/who/.dsh/profiles/workbench',
    );
    const answer = await settled(handler);

    expect(answer.canWakeBrowser).toBeUndefined();
    expect(fake.commands().some((line) => /^(pgrep|tasklist)/.test(line))).toBe(false);
    expect(routes[WAKE_BROWSER_ROUTE]).toBeUndefined();
  });
});

describe('provisionWorkbenchPnpm', () => {
  it('★ 装成本地 pnpm 后 DSH_WB_PNPM 整段带引号（工作台根带空格也不拆词）', async () => {
    const box = mkdtempSync(join(tmpdir(), 'wb-route-'));
    const root = join(box, 'work bench');
    const bin = localPnpmBin(root);
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'), '', 'utf8');
    vi.stubEnv('PATH', process.env.PATH ?? '');
    vi.stubEnv('DSH_WB_PNPM', '');

    try {
      const result = await provisionWorkbenchPnpm({
        root,
        seam: seamFor(createFakeShell([]).shell),
        run: async () => ({ ok: true, detail: '' }),
      });

      const command = quoteShellArgFor(localPnpmCommand(root), process.platform);
      expect(result.ok).toBe(true);
      expect(process.env.DSH_WB_PNPM).toBe(command);
      expect(command.startsWith("'")).toBe(true);
      expect(command).toContain(root);
    } finally {
      rmSync(box, { recursive: true, force: true });
      vi.unstubAllEnvs();
    }
  });
});
