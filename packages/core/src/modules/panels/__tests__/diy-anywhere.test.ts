import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDiyRig } from './diy-harness';
import {
  DIY_DEBUG_START_TOOL,
  DIY_INSTALL_TOOL,
  DIY_PANEL_TOOL,
  DIY_RECORD_PREPARE_TOOL,
  DIY_SHOW_TOOL,
  DIY_STATUS_TOOL,
} from '../unit';

describe('工作区结构未知：看 / 调不需要模块源码', () => {
  const rig = createDiyRig();

  function bareWorkspace(): void {
    fs.rmSync(path.join(rig.WORKSHOP(), 'pnpm-workspace.yaml'), { force: true });
  }

  function installedElsewhere(unit = 'demo'): void {
    const dir = path.join(rig.root(), 'elsewhere', `module-${unit}`);
    rig.writeManifest(dir, {
      name: `@dsh-workbench/module-${unit}`,
      version: '0.0.0',
      dsh: { workbench: { unit } },
    });
    rig.markInstalled(`@dsh-workbench/module-${unit}`, dir);
  }

  const PAGE = (): string =>
    JSON.stringify({
      plugin: '@dsh-workbench/core',
      pid: 1,
      url: 'http://127.0.0.1:3081/',
      title: 't',
      board: rig.WORKSHOP(),
      open: true,
      shown: true,
    });

  it('★ 空工作区（没有 package.json / 没有 workspace 声明）：status 不抛，说清「看板不需要模块」', async () => {
    bareWorkspace();
    const { tool } = rig.harness();

    const out = (await tool(DIY_STATUS_TOOL)?.execute({}, rig.diyExec())) as { text: string };

    expect(out.text).toContain('这个工作区里没有模块源码');
    expect(out.text).toContain('不需要模块');
    expect(out.text).toContain('workbench_diy_panel');
  });

  it('★★ 模块装在 profile、源码不在这个工作区：status / show / panel 照样能用', async () => {
    bareWorkspace();
    installedElsewhere('demo');
    const { tool, panels } = rig.harness();

    const status = (await tool(DIY_STATUS_TOOL)?.execute({ unit: 'demo' }, rig.diyExec())) as { text: string };
    expect(status.text).toContain('demo');
    expect(status.text).toContain('装：是');

    const shown = (await tool(DIY_SHOW_TOOL)?.execute({ unit: 'demo' }, rig.diyExec())) as {
      panel: { ok: boolean };
    };
    expect(shown.panel.ok).toBe(true);
    expect(panels.isEnabled('demo', rig.WORKSHOP())).toBe(true);

    const panel = (await tool(DIY_PANEL_TOOL)?.execute({}, rig.diyExec())) as { text: string; panels: unknown[] };
    expect(panel.text).toContain(`工作区：${rig.WORKSHOP()}`);
    expect(panel.panels.length).toBeGreaterThan(0);
  });

  it('★★ 只有一个装过的：debug_start 不给 unit 也能开（不要求源码）', async () => {
    bareWorkspace();
    installedElsewhere('demo');
    const built = rig.harness({ pact: false, probe: [{ stdout: PAGE() }, { stdout: PAGE() }] });

    const started = (await built.tool(DIY_DEBUG_START_TOOL)?.execute({}, rig.diyExec())) as {
      unit: string;
      phase: string;
    };

    expect(started.unit).toBe('demo');
    expect(started.phase).toBe('debugging');
  });

  it('★ record 也只看「装过」：没有源码时它停在「要那一页的 url」，不是「没有这个模块」', async () => {
    bareWorkspace();
    installedElsewhere('demo');
    const { tool } = rig.harness();

    await expect(
      tool(DIY_RECORD_PREPARE_TOOL)?.execute({ unit: 'demo', doing: '发布' }, rig.diyExec()),
    ).rejects.toThrow(/要那一页的 url/);
  });

  it('★★ 只给一个链接：record 不再拦在 unit 上（unit 只是文件名标签，默认 page）', async () => {
    bareWorkspace();
    const { tool } = rig.harness();

    await expect(
      tool(DIY_RECORD_PREPARE_TOOL)?.execute({ url: 'https://example.com/x', doing: '提交' }, rig.diyExec()),
    ).rejects.not.toThrow(/要一个 unit/);
  });

  it('★ install 仍然只认本工作区的源码：没有就说清，且一次安装都没发出去', async () => {
    bareWorkspace();
    installedElsewhere('demo');
    const { tool, specs } = rig.harness();

    await expect(tool(DIY_INSTALL_TOOL)?.execute({ unit: 'demo' }, rig.diyExec())).rejects.toThrow(
      /没有单元 id 为「demo」/,
    );
    expect(specs).toEqual([]);
  });
});
