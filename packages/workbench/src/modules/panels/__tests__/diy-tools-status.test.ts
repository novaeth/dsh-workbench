import dayjs from 'dayjs';
import { afterAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createDiyRig } from './diy-harness';
import { DIY_RECON_TOOL, DIY_STATUS_TOOL, DIY_SHOW_TOOL } from '../unit';
import { OPENCLI_CATALOG_ENV } from '@dsh-workbench/shared/host';

const rig = createDiyRig();

describe('workbench_diy · status', () => {
  function builtAt(dir: string, at: Date): void {
    fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
    for (const file of [path.join(dir, 'dist', 'host.js'), path.join(dir, 'client.js')]) {
      fs.writeFileSync(file, '');
      fs.utimesSync(file, at, at);
    }
  }

  function sourceAt(dir: string, at: Date): void {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    const file = path.join(dir, 'src', 'host.ts');
    fs.writeFileSync(file, '');
    fs.utimesSync(file, at, at);
  }

  type StatusRow = {
    unit: string;
    installed: boolean;
    known: boolean;
    open: boolean;
    stale: boolean;
    artifacts: Array<{ path: string; at: string | null }>;
    next: string;
  };

  async function statusOf(unit?: string): Promise<{ status: StatusRow[]; text: string }> {
    const { tool } = rig.harness();
    return (await tool(DIY_STATUS_TOOL).execute(unit === undefined ? {} : { unit }, rig.diyExec())) as {
      status: StatusRow[];
      text: string;
    };
  }

  it('没装：下一步是 install', async () => {
    rig.scaffold('demo');
    const out = await statusOf('demo');
    expect(out.status[0]?.installed).toBe(false);
    expect(out.status[0]?.next).toContain('workbench_diy_install');
  });

  it('装了、但面板还不认得这个单元：下一步是重启一次（新装模块的必经一步，不是"再装"）', async () => {
    const dir = rig.scaffold('other');
    rig.markInstalled('@dsh-workbench/module-other', dir);
    const out = await statusOf('other');
    expect(out.status[0]?.installed).toBe(true);
    expect(out.status[0]?.known).toBe(false);
    expect(out.status[0]?.next).toContain('重启');
    expect(out.status[0]?.next).not.toContain('workbench_diy_install');
  });

  it('面板认得、但没上板：下一步是 workbench_diy_show（不是再装一遍）', async () => {
    const dir = rig.scaffold('demo');
    rig.markInstalled('@dsh-workbench/module-demo', dir);
    const out = await statusOf('demo');
    expect(out.status[0]?.known).toBe(true);
    expect(out.status[0]?.open).toBe(false);
    expect(out.status[0]?.next).toContain('workbench_diy_show');
    expect(out.status[0]?.next).not.toContain('install');
  });

  it('上板了、但源码比产物新：下一步是 build（宿主侧秒级热换）', async () => {
    const dir = rig.scaffold('demo');
    rig.markInstalled('@dsh-workbench/module-demo', dir);
    builtAt(dir, dayjs('2026-01-01T10:00:00Z').toDate());
    sourceAt(dir, dayjs('2026-01-01T12:00:00Z').toDate());
    const { tool, panels } = rig.harness();
    panels.show('demo', rig.WORKSHOP());
    const out = (await tool(DIY_STATUS_TOOL)?.execute({ unit: 'demo' }, rig.diyExec())) as {
      status: StatusRow[];
    };
    expect(out.status[0]?.open).toBe(true);
    expect(out.status[0]?.stale).toBe(true);
    expect(out.status[0]?.next).toContain('build');
  });

  it('产物比源码新：都在生效，并且明说不要再装', async () => {
    const dir = rig.scaffold('demo');
    rig.markInstalled('@dsh-workbench/module-demo', dir);
    builtAt(dir, dayjs('2026-01-01T12:00:00Z').toDate());
    sourceAt(dir, dayjs('2026-01-01T10:00:00Z').toDate());
    const { tool, panels } = rig.harness();
    panels.show('demo', rig.WORKSHOP());
    const out = (await tool(DIY_STATUS_TOOL)?.execute({ unit: 'demo' }, rig.diyExec())) as {
      status: StatusRow[];
    };
    expect(out.status[0]?.stale).toBe(false);
    expect(out.status[0]?.next).toContain('不要再装一遍');
  });

  it('上板了、但还没构建：下一步是 build（产物缺失）', async () => {
    const dir = rig.scaffold('demo');
    rig.markInstalled('@dsh-workbench/module-demo', dir);
    sourceAt(dir, dayjs('2026-01-01T12:00:00Z').toDate());
    const { tool, panels } = rig.harness();
    panels.show('demo', rig.WORKSHOP());
    const out = (await tool(DIY_STATUS_TOOL)?.execute({ unit: 'demo' }, rig.diyExec())) as {
      status: StatusRow[];
    };
    expect(out.status[0]?.artifacts.every((one) => one.at === null)).toBe(true);
    expect(out.status[0]?.next).toContain('还没构建');
  });

  it('不带 unit：把工坊里每个模块都过一遍', async () => {
    rig.scaffold('demo');
    const other = rig.scaffold('other');
    rig.markInstalled('@dsh-workbench/module-other', other);
    const out = await statusOf();
    expect(out.status.map((one) => one.unit)).toEqual(['demo', 'other']);
    expect(out.text).toContain('工作区：');
  });

  it('工坊里没有这个 unit：报清楚可用的有哪些', async () => {
    rig.scaffold('demo');
    await expect(statusOf('nope')).rejects.toThrow('没有单元 id 为「nope」');
  });
});

describe('workbench_diy · open', () => {
  it('装了、认得：只上板，绝不触发安装', async () => {
    const dir = rig.scaffold('demo');
    rig.markInstalled('@dsh-workbench/module-demo', dir);
    const { tool, panels, specs } = rig.harness();
    const out = (await tool(DIY_SHOW_TOOL)?.execute({ unit: 'demo' }, rig.diyExec())) as { text: string };
    expect(specs).toEqual([]);
    expect(panels.isEnabled('demo', rig.WORKSHOP())).toBe(true);
    expect(out.text).toContain('已经打开');
  });

  it('没装：报清楚 open 只负责上板', async () => {
    rig.scaffold('demo');
    const { tool } = rig.harness();
    await expect(tool(DIY_SHOW_TOOL)?.execute({ unit: 'demo' }, rig.diyExec())).rejects.toThrow('还没装');
  });
});

describe('workbench_diy · recon（先看有没有现成的）', () => {
  const catalogDir = fs.mkdtempSync(path.join(process.env['TMPDIR'] ?? '/tmp', 'diy-catalog-'));
  const catalog = path.join(catalogDir, 'cli-manifest.json');
  fs.writeFileSync(
    catalog,
    JSON.stringify([
      {
        command: 'bilibili/search',
        site: 'bilibili',
        name: 'search',
        domain: 'bilibili.com',
        description: 'Search videos',
        access: 'read',
        strategy: 'cookie',
        browser: true,
        example: 'opencli bilibili search -f yaml',
      },
    ]),
  );
  afterAll(() => fs.rmSync(catalogDir, { recursive: true, force: true }));

  it('给关键词：回现成的 adapter + 命令 + 要不要 Chrome，并说清不用装', async () => {
    vi.stubEnv(OPENCLI_CATALOG_ENV, catalog);
    const { tool } = rig.harness({});
    const out = (await tool(DIY_RECON_TOOL)?.execute({ keyword: 'bilibili' },
      rig.diyExec(),
    )) as { ok: boolean; sites: readonly { site: string; browser: boolean }[]; text: string; next: string };

    expect(out.ok).toBe(true);
    expect(out.sites[0]?.site).toBe('bilibili');
    expect(out.sites[0]?.browser).toBe(true);
    expect(out.text).toContain('要用你的 Chrome');
    expect(out.next).toContain('opencli bilibili search -f yaml');
    vi.unstubAllEnvs();
  });

  it('用网址也能找（取域名），没有现成的就老实给两条路', async () => {
    vi.stubEnv(OPENCLI_CATALOG_ENV, catalog);
    const { tool } = rig.harness({});
    const hit = (await tool(DIY_RECON_TOOL)?.execute({ url: 'https://www.bilibili.com/video/BV1' },
      rig.diyExec(),
    )) as { sites: readonly { site: string }[] };
    expect(hit.sites[0]?.site).toBe('bilibili');

    const miss = (await tool(DIY_RECON_TOOL)?.execute({ keyword: '某内部系统' },
      rig.diyExec(),
    )) as { sites: unknown[]; next: string };
    expect(miss.sites).toEqual([]);
    expect(miss.next).toContain('opencli-adapter-author');
    vi.unstubAllEnvs();
  });

  it('没给关键词：说清这是 agent 自己的活，并点明别问用户', async () => {
    const { tool } = rig.harness({});
    await expect(
      tool(DIY_RECON_TOOL)?.execute({}, rig.diyExec()),
    ).rejects.toThrow('别问用户');
  });

  it('目录读不到（隔离运行时没装好）：给出那条能照做的安装命令', async () => {
    vi.stubEnv(OPENCLI_CATALOG_ENV, path.join(catalogDir, 'nope.json'));
    const { tool } = rig.harness({});
    await expect(
      tool(DIY_RECON_TOOL)?.execute({ keyword: 'bilibili' }, rig.diyExec()),
    ).rejects.toThrow('isolatedInstallCommand'.replace('isolatedInstallCommand', 'npm i --prefix'));
    vi.unstubAllEnvs();
  });
});
