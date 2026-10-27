import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createDebugStore, createWorkspaceStore } from '@dsh-workbench/shared/host';
import { createPanelsService } from '../model/service';
import { registerDiyTools } from '../model/diy-tools';
import { createDiyRig, panelsUnit, demoUnit } from './diy-harness';
import { TWO_FACE_ALL } from '@/shared/api/host/diy-components';
import {
  DIY_COMPONENTS_TOOL,
  DIY_DEBUG_TOOLS,
  DIY_INSTALL_TOOL,
  DIY_RECORD_TOOLS,
  DIY_STATUS_TOOL,
  DIY_TOOLS,
} from '../unit';

const rig = createDiyRig();

describe('workbench_diy · status（入口：我手上有什么）', () => {
  it('报出这个工作区里每个模块源码，以及它装了没（装了的是 link 进 profile 的）', async () => {
    rig.scaffold('demo');
    const other = rig.scaffold('other');
    rig.markInstalled('@dsh-workbench/module-other', other);

    const { tool } = rig.harness();
    const result = (await tool(DIY_STATUS_TOOL)?.execute({}, rig.diyExec())) as {
      workspace: string;
      status: Array<{ unit: string; installed: boolean }>;
      text: string;
    };

    expect(result.workspace).toBe(rig.WORKSHOP());
    expect(result.status.map((one) => one.unit)).toEqual(['demo', 'other']);
    expect(result.status.find((one) => one.unit === 'demo')?.installed).toBe(false);
    expect(result.status.find((one) => one.unit === 'other')?.installed).toBe(true);
    expect(result.text).toContain('装：没有');
    expect(result.text).toContain('装：是');
  });

  it('什么都没有：回空态 + 一句能照做的下一步（不抛）', async () => {
    const { tool } = rig.harness();
    const result = (await tool(DIY_STATUS_TOOL)?.execute({}, rig.diyExec())) as { text: string };

    expect(result.text).toContain('这个工作区里没有模块源码');
    expect(result.text).toContain('dsh-wb-module init');
  });

  it('★ 发布出口不靠猜：有可写市场索引就在 text 里点名仓库与这一版会发的号', async () => {
    rig.scaffold('demo');
    const { tool } = rig.harness({
      preview: () => ({
        name: '@dsh-workbench/module-demo',
        version: '0.1.0',
        market: {
          url: 'https://git.example.com/wb/market.git',
          ref: 'main',
          indexPath: 'market.json',
          artifactPath: 'packages/demo',
          files: ['package.json'],
          nextVersion: '0.1.1',
        },
        changelog: { version: '0.1.1', missing: true },
      }),
    });

    const result = (await tool(DIY_STATUS_TOOL)?.execute({ unit: 'demo' }, rig.diyExec())) as {
      publish?: { market?: { url: string } };
      text: string;
    };

    expect(result.publish?.market?.url).toBe('https://git.example.com/wb/market.git');
    expect(result.text).toContain('发布出口：市场索引 https://git.example.com/wb/market.git');
    expect(result.text).toContain('这一版会发 0.1.1');
    expect(result.text).toContain('还差 0.1.1');
  });

  it('★ 没配索引源也没声明 registry：说安装包，不编造仓库', async () => {
    rig.scaffold('demo');
    const { tool } = rig.harness({
      preview: () => ({ name: '@dsh-workbench/module-demo', version: '0.2.0' }),
    });

    const result = (await tool(DIY_STATUS_TOOL)?.execute({ unit: 'demo' }, rig.diyExec())) as { text: string };

    expect(result.text).toContain('发布出口：安装包');
    expect(result.text).not.toContain('发布出口：市场索引');
  });
});

describe('workbench_diy · 落点是这条会话的登记工作区', () => {
  it('★★ cwd 不在任何登记工作区上 ⇒ 当场拒（不猜、不回落到工坊）', async () => {
    rig.scaffold('demo');
    const { tool } = rig.harness();

    await expect(tool(DIY_STATUS_TOOL)?.execute({}, rig.NORMAL_EXEC)).rejects.toThrow(/登记工作区/);
  });

  it('★★ 连会话都没有 ⇒ 同样拒（不替用户挑一个落点）', async () => {
    rig.scaffold('demo');
    const { tool } = rig.harness();

    await expect(tool(DIY_STATUS_TOOL)?.execute({}, {})).rejects.toThrow(/登记工作区/);
  });
});

describe('workbench_diy · install（装 + 上板一次做完）', () => {
  it('★ 装的是工坊里那个目录的绝对路径，装完顺手在**这个会话的工作区**上板', async () => {
    const dir = rig.scaffold('demo');
    const { tool, specs, panels } = rig.harness();

    const result = (await tool(DIY_INSTALL_TOOL)?.execute({ unit: 'demo' }, rig.diyExec())) as {
      path: string;
      unit: string;
      install: { application: string };
      panel: { ok: boolean };
      text: string;
    };

    expect(specs).toEqual([dir]);
    expect(result.path).toBe(dir);
    expect(result.unit).toBe('demo');
    expect(result.install.application).toBe('applied');
    expect(result.panel.ok).toBe(true);
    expect(panels.isEnabled('demo', rig.WORKSHOP())).toBe(true);
    expect(panels.isEnabled('demo', '/w/b')).toBe(false);
    expect(result.text).toContain('面板上已经打开它了');
    expect(structuredClone(result)).toStrictEqual(result);
  });

  it('★★ 会话的 cwd 在模块包子目录里：落点仍是**登记工作区**，装完也上在那一板上', async () => {
    const dir = rig.scaffold('demo');
    const sub = path.join(dir, 'src');
    fs.mkdirSync(sub, { recursive: true });
    const { tool, specs, panels } = rig.harness();

    const result = (await tool(DIY_INSTALL_TOOL)?.execute(
      { unit: 'demo' },
      { agent: { session: { id: 's1', header: { cwd: sub } } } },
    )) as { path: string; panel: { ok: boolean } };

    expect(specs).toEqual([dir]);
    expect(result.path).toBe(dir);
    expect(result.panel.ok).toBe(true);
    expect(panels.isEnabled('demo', rig.WORKSHOP())).toBe(true);
  });

  it('要重启才生效的那一支：不假装上板了，说清下一步', async () => {
    rig.scaffold('demo');
    const { tool, panels } = rig.harness({ outcome: rig.outcomeOf('restart-required') });

    const result = (await tool(DIY_INSTALL_TOOL)?.execute({ unit: 'demo' }, rig.diyExec())) as {
      panel: { ok: boolean; reason?: string };
      text: string;
    };

    expect(result.panel.ok).toBe(false);
    expect(panels.isEnabled('demo', rig.WORKSHOP())).toBe(false);
    expect(result.text).toMatch(/要重启.+?才生效/);
    expect(result.text).toContain('workbench_diy_show');
  });

  it('没装成（failed）：把错误码与原始输出的尾巴说出来，不静默', async () => {
    rig.scaffold('demo');
    const failed = rig.outcomeOf('failed');
    const { tool } = rig.harness({
      outcome: {
        ...failed,
        change: {
          ...failed.change,
          errorCode: 'network',
          packageResult: { exitCode: 1, output: '一\n二\n三\n四', truncated: false, logPath: '/x' },
        },
      },
    });

    const result = (await tool(DIY_INSTALL_TOOL)?.execute({ unit: 'demo' }, rig.diyExec())) as { text: string };

    expect(result.text).toContain('network');
    expect(result.text).toContain('二 | 三 | 四');
  });

  it('★ 已经装过了就不再装（同名重装只会得到"要重启"），只保证上板', async () => {
    const dir = rig.scaffold('demo');
    rig.markInstalled('@dsh-workbench/module-demo', dir);
    const { tool, specs, panels } = rig.harness();

    const result = (await tool(DIY_INSTALL_TOOL)?.execute({ unit: 'demo' }, rig.diyExec())) as {
      alreadyInstalled?: boolean;
      panel: { ok: boolean };
      text: string;
    };

    expect(specs).toEqual([]);
    expect(result.alreadyInstalled).toBe(true);
    expect(result.panel.ok).toBe(true);
    expect(panels.isEnabled('demo', rig.WORKSHOP())).toBe(true);
    expect(result.text).toContain('已经装过了');
    expect(structuredClone(result)).toStrictEqual(result);
  });

  it('已经装过、但这个项目上没打开：上板那一步照做，没做成也把为什么说出来', async () => {
    const dir = rig.scaffold('demo');
    rig.markInstalled('@dsh-workbench/module-demo', dir);
    const { tool, specs } = rig.harness({ manifests: [panelsUnit] });

    const result = (await tool(DIY_INSTALL_TOOL)?.execute({ unit: 'demo' }, rig.diyExec())) as {
      alreadyInstalled?: boolean;
      panel: { ok: boolean; reason?: string };
      text: string;
    };

    expect(specs).toEqual([]);
    expect(result.alreadyInstalled).toBe(true);
    expect(result.panel.ok).toBe(false);
    expect(result.text).toContain('workbench_diy_show');
  });

  it('★ 上板失败也要把"装好了"这份结果交出来（面板那一半为什么没开，说清）', async () => {
    rig.scaffold('demo');
    const { tool, specs } = rig.harness({ manifests: [panelsUnit] });

    const result = (await tool(DIY_INSTALL_TOOL)?.execute({ unit: 'demo' }, rig.diyExec())) as {
      install: { application: string };
      panel: { ok: boolean; reason?: string };
      text: string;
    };

    expect(specs).toHaveLength(1);
    expect(result.install.application).toBe('applied');
    expect(result.panel.ok).toBe(false);
    expect(result.panel.reason).toContain('没有这个套件');
    expect(result.text).toContain('workbench_diy_show');
  });
});

describe('workbench_diy · 那道更窄的门', () => {
  it('★ 工坊之外的目录不肯装（软链出去也不行），且**没碰过安装**', async () => {
    const outside = path.join(rig.root(), 'outside');
    rig.writeManifest(outside, {
      name: '@dsh-workbench/module-demo',
      version: '0.0.0',
      dsh: { workbench: { unit: 'demo' } },
    });
    fs.mkdirSync(rig.PACKAGES(), { recursive: true });
    fs.symlinkSync(outside, path.join(rig.PACKAGES(), 'module-demo'), 'dir');

    const { tool, specs } = rig.harness();

    await expect(tool(DIY_INSTALL_TOOL)?.execute({ unit: 'demo' }, rig.diyExec())).rejects.toThrow(/不在这个工作区里/);
    expect(specs).toEqual([]);
  });

  it('工坊里没有这个 unit：报错把可用的列出来', async () => {
    rig.scaffold('demo');

    const { tool } = rig.harness();

    await expect(tool(DIY_INSTALL_TOOL)?.execute({ unit: 'nope' }, rig.diyExec())).rejects.toThrow(/demo/);
  });

  it('没给 unit：报错把可用的列出来', async () => {
    rig.scaffold('demo');

    const { tool } = rig.harness();

    await expect(tool(DIY_INSTALL_TOOL)?.execute({}, rig.diyExec())).rejects.toThrow(/install 要一个 unit/);
  });

  it('★ 名字即动作：注册出来的每一把都是一个动词，没有带 action 的那种多路复用', () => {
    const { registered } = rig.harness();

    const every = [...DIY_TOOLS, ...DIY_DEBUG_TOOLS, ...DIY_RECORD_TOOLS];
    expect(registered.map((one) => one.name).sort()).toEqual([...every].sort());
    for (const one of registered) {
      const properties = (one.parameters as { properties?: Record<string, unknown> }).properties ?? {};
      expect(Object.keys(properties), one.name).not.toContain('action');
    }
    expect(registered).toHaveLength(every.length);
  });
});

describe('workbench_diy · components', () => {
  it('★ 工坊里还没装工具链：报错把「在工坊根跑一次 pnpm install」说出来（不静默、不假装有清单）', async () => {
    const { tool } = rig.harness();

    await expect(tool(DIY_COMPONENTS_TOOL)?.execute({}, rig.diyExec())).rejects.toThrow(/pnpm install/);
  });

  it('★ 不指名 scope 又要 all：当场回一句就完 —— 不查工具链、不发任何命令、不带目录数据', async () => {
    const { tool, commands } = rig.harness({ probe: [{}] });
    const out = (await tool(DIY_COMPONENTS_TOOL)?.execute({ all: true }, rig.diyExec())) as {
      text: string;
      kit: unknown;
      primitives: unknown;
    };

    expect(out.text).toBe(TWO_FACE_ALL);
    expect(out.kit).toBeNull();
    expect(out.primitives).toBeNull();
    expect(commands).toEqual([]);
  });

  it('★ 那一句只认那一格：指名 scope 的正当路径照旧（这里是照旧地报工具链没装）', async () => {
    const { tool } = rig.harness();

    await expect(tool(DIY_COMPONENTS_TOOL)?.execute({ scope: 'kit', all: true }, rig.diyExec())).rejects.toThrow(
      /pnpm install/,
    );
  });

  it('★★ 工具链只装在模块包里（modules-repo 那种布局）：也找得到，命令就用那一个', async () => {
    const moduleDir = rig.scaffold('demo');
    const bin = path.join(moduleDir, 'node_modules', '.bin', 'dsh-wb-module');
    fs.mkdirSync(path.dirname(bin), { recursive: true });
    fs.writeFileSync(bin, '#!/bin/sh\n');
    const { tool, commands } = rig.harness({ probe: [{ stdout: '{"kit":{}}' }] });

    const out = (await tool(DIY_COMPONENTS_TOOL)?.execute({ scope: 'kit' }, rig.diyExec())) as { workspace: string };

    expect(out.workspace).toBe(rig.WORKSHOP());
    expect(commands).toHaveLength(1);
    expect(commands[0]).toContain(bin);
  });
});

describe('workbench_diy · 降级', () => {
  it('没有 tools 服务 → 不注册、不抛错', () => {
    const { registered, disposers } = rig.harness({ withTools: false });

    expect(registered).toEqual([]);
    expect(disposers).toEqual([]);
  });

  it('★ 没有工作区登记表 ⇒ 当场拒（不扫"像工作区的目录"）', async () => {
    const dir = rig.scaffold('demo');
    const registered: Array<{ name: string; execute: (args: unknown, exec?: unknown) => Promise<unknown> }> = [];
    const ctx = {
      get: (key: string) =>
        key === 'tools' ? { register: (definition: never) => (registered.push(definition), () => {}) } : undefined,
      logger: { info: () => {}, warn: () => {} },
    };
    const panels = createPanelsService({ manifests: () => [panelsUnit, demoUnit], store: createWorkspaceStore({ root: rig.root() }) });
    registerDiyTools(
      ctx as never,
      { installBundle: async () => rig.outcomeOf('applied') } as never,
      panels,
      createDebugStore(),
    );

    expect(dir).toBe(rig.PACKAGES() + '/module-demo');
    await expect(registered[0]?.execute({}, rig.diyExec())).rejects.toThrow(/登记工作区/);
  });
});
