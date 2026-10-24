import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

import {
  PANELS_FOLLOW_TOOL,
  PANELS_HIDE_TOOL,
  PANELS_LIST_TOOL,
  PANELS_SHOW_TOOL,
} from '../unit';
import { A, B, machineConfig, readJson, toolHarness, workspaceConfig } from './scope-support';
describe('B-6：机器级板的写者（workbench_panels 的 scope）', () => {
it('★ show / hide 带 scope: machine 只写机器级板、不碰当前工作区的板；本工作区只写自己那一行', async () => {
    const { panels, run } = toolHarness();

    await run(PANELS_SHOW_TOOL, { id: 'boarded', scope: 'machine' }, null);
    expect(readJson(machineConfig())).toEqual({ shown: ['boarded'], hidden: [] });
    expect(fs.existsSync(workspaceConfig(A))).toBe(false);
    expect(panels.isEnabled('boarded', B)).toBe(true);

    await run(PANELS_HIDE_TOOL, { id: 'boarded', scope: 'machine' }, null);
    expect(readJson(machineConfig())).toEqual({ shown: [], hidden: ['boarded'] });
    expect(fs.existsSync(workspaceConfig(A))).toBe(false);

    await run(PANELS_SHOW_TOOL, { id: 'project-only' });
    expect(readJson(workspaceConfig(A))).toEqual({
      shown: ['project-only'],
      hidden: [],
      order: ['project-only'],
    });
    expect(readJson(machineConfig())).toEqual({ shown: [], hidden: ['boarded'] });
    expect(panels.isEnabled('project-only', A)).toBe(true);
    expect(panels.isEnabled('boarded', A)).toBe(false);
    expect(panels.isEnabled('boarded', B)).toBe(false);
  });

  it('★ 没配过的工作区吃机器级板（②）；自己配过的工作区按自己的来（①压过②）', async () => {
    const { panels, run } = toolHarness();

    await run(PANELS_SHOW_TOOL, { id: 'boarded', scope: 'machine' }, null);

    expect(panels.isEnabled('boarded', B)).toBe(true);
    expect(panels.isEnabled('project-only', B)).toBe(false);

    await run(PANELS_SHOW_TOOL, { id: 'project-only' });

    expect(panels.isEnabled('project-only', A)).toBe(true);
    expect(panels.isEnabled('boarded', A)).toBe(true);
    expect(panels.isEnabled('boarded', B)).toBe(true);
    expect(panels.isEnabled('project-only', B)).toBe(false);
  });

  it('★ 第一次动开关是"从机器板起笔"，不是"配成空"：机器板上开着的别的套件不会顺手掉', async () => {
    const { panels, run } = toolHarness();

    await run(PANELS_SHOW_TOOL, { id: 'boarded', scope: 'machine' }, null);
    await run(PANELS_SHOW_TOOL, { id: 'project-only', scope: 'machine' }, null);

    await run(PANELS_HIDE_TOOL, { id: 'project-only' });

    expect(panels.isEnabled('boarded', A)).toBe(true);
    expect(panels.isEnabled('project-only', A)).toBe(false);
    expect(panels.boards(A).machine).toEqual({ shown: ['boarded', 'project-only'], hidden: [] });
  });

  it('★ follow：本工作区那份板消失 ⇒ 机器板以后改了它跟着变；机器板没有"回到跟随"一说', async () => {
    const { panels, run } = toolHarness();

    await run(PANELS_SHOW_TOOL, { id: 'boarded', scope: 'machine' }, null);
    await run(PANELS_HIDE_TOOL, { id: 'boarded' });
    expect(panels.isEnabled('boarded', A)).toBe(false);
    expect(fs.existsSync(workspaceConfig(A))).toBe(true);

    await run(PANELS_FOLLOW_TOOL, {});

    expect(fs.existsSync(workspaceConfig(A))).toBe(false);
    expect(panels.boards(A).workspace).toBeNull();
    expect(panels.isEnabled('boarded', A)).toBe(true);

    await expect(run(PANELS_FOLLOW_TOOL, { scope: 'machine' }, null)).rejects.toThrow(/机器级默认板/);
  });



  it('★ list 带 scope: machine 报的是机器级板；坏 scope 报错并点名 workspace / machine', async () => {
    const { run } = toolHarness();

    await run(PANELS_SHOW_TOOL, { id: 'boarded', scope: 'machine' }, null);
    const listed = await run(PANELS_LIST_TOOL, { scope: 'machine' }, null);
    const on = listed.units.filter((entry) => entry.shown).map((entry) => entry.id);

    expect(on).toContain('boarded');
    expect(on).not.toContain('project-only');
    expect(listed.text).toContain('机器级默认板');
    expect(listed.text).not.toContain('当前工作区');

    await expect(run(PANELS_LIST_TOOL, { scope: 'nope' }, null)).rejects.toThrow(/workspace \/ machine/);
  });
});
