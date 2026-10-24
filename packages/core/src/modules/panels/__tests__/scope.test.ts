import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { panelsHost } from '../index';
import { PANELS_FILE, PANELS_MODULE_ID } from '../model/service';
import { PANELS_HIDE_TOOL, PANELS_SHOW_TOOL } from '../unit';
import { A, B, BOARDED_UNIT, MACHINE_BOARD, MIXED_UNIT, PROJECT_UNIT, UNITS, WORKSPACE_BOARD, denied, gate, machineConfig, mount, readJson, store, toolHarness, workspaceConfig, writeBoard, writeBoardWith } from './scope-support';

describe('三步解析（端到端）：只有用户的板说话', () => {
it('① 本工作区提到的那一行按它说的来；没提过的跟着机器级板', () => {
    const panels = mount();
    writeBoard(null, [...MACHINE_BOARD, ...WORKSPACE_BOARD]);
    writeBoard(A, ['project-only']);

    expect(panels.isEnabled('project-only', A)).toBe(true);
    expect(panels.isEnabled('boarded', A)).toBe(true);
    expect(panels.isEnabled('machine-card', A)).toBe(true);
  });

  it('② 没配过的工作区：机器级板里有 → 在；没有 → 不在', () => {
    const panels = mount();
    writeBoard(null, [...MACHINE_BOARD, ...WORKSPACE_BOARD]);

    expect(panels.isEnabled('boarded', B)).toBe(true);
    expect(panels.isEnabled('machine-card', B)).toBe(true);
    expect(panels.isEnabled('project-only', B)).toBe(false);
  });

  it('③ 一个板都没有 → 不在（ADR-0009 的「默认全空」继续成立）', () => {
    const panels = mount([BOARDED_UNIT, PROJECT_UNIT, MIXED_UNIT]);

    expect(panels.isEnabled('project-only', A)).toBe(false);
    expect(panels.list(A).every((entry) => entry.shown === false)).toBe(true);
  });

  it('没有工作区的会话（null）也吃机器级那份', () => {
    const panels = mount();
    writeBoard(null, [...WORKSPACE_BOARD]);

    expect(panels.isEnabled('boarded', null)).toBe(true);
    expect(panels.isEnabled('project-only', null)).toBe(false);
  });
});

describe('「没配过」与「配成空」不是同一件事', () => {
it('★ 空板现在就是"全部跟随"：清掉覆盖之后机器级板重新说话', () => {
    const panels = mount();
    writeBoard(null, ['boarded']);
    writeBoard(A, []);

    expect(panels.isEnabled('boarded', A)).toBe(true);

    panels.hide('boarded', A);
    expect(panels.isEnabled('boarded', A)).toBe(false);

    panels.follow(A);
    expect(panels.isEnabled('boarded', A)).toBe(true);
  });

  it('★ 写空名单也落文件：show 之后 hide 掉最后一块，文件还在（不是删掉）', () => {
    const panels = mount();
    panels.show('boarded', A);
    panels.hide('boarded', A);

    expect(panels.isEnabled('boarded', A)).toBe(false);
    expect(fs.existsSync(path.join(store.for(PANELS_MODULE_ID, A).dir, PANELS_FILE))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(store.for(PANELS_MODULE_ID, A).dir, PANELS_FILE), 'utf8'))).toEqual({
      shown: [],
      hidden: ['boarded'],
    });
  });
});

describe('机器级可见性只从用户的机器级板来', () => {
  it('★ 两个工作区都没配过：板上的卡片与工具都在，没上板的都不在', () => {
    const panels = mount();
    writeBoard(null, [...MACHINE_BOARD]);
    const mounted = gate();

    for (const workspace of [A, B]) {
      expect(panels.isEnabled('machine-card', workspace)).toBe(true);
      expect(panels.isEnabled('project-only', workspace)).toBe(false);
      expect(denied(mounted, workspace)).not.toContain('machine_read');
      expect(denied(mounted, workspace)).toContain('project_read');
    }
  });

  it('★ 把机器级板撤空：两个工作区一起不在 —— 机器级可见性来自用户的板，不是模块声明', () => {
    const panels = mount();
    writeBoard(null, []);
    const mounted = gate();

    for (const workspace of [A, B]) {
      expect(panels.isEnabled('machine-card', workspace)).toBe(false);
      expect(denied(mounted, workspace)).toContain('machine_read');
    }
  });

it('★ 机器级板选的东西给所有"没提过这一行"的工作区：提过的按自己说的来', () => {
    const panels = mount();
    panels.show('boarded', null, 'machine');
    panels.hide('boarded', A);

    expect(panels.isEnabled('boarded', A)).toBe(false);
    expect(panels.isEnabled('boarded', B)).toBe(true);
  });
});

describe('用户关掉一个模块', () => {
  it('★ 关掉 = 这个工作区明确不要它：卡片与它全部工具一起下', () => {
    const panels = mount();
    const mounted = gate();

    panels.show('mixed', A);
    expect(panels.isEnabled('mixed', A)).toBe(true);
    expect(denied(mounted, A)).not.toContain('mixed_project');
    expect(denied(mounted, A)).not.toContain('mixed_machine');

    panels.hide('mixed', A);

    expect(panels.isEnabled('mixed', A)).toBe(false);
    expect(denied(mounted, A)).toContain('mixed_project');
    expect(denied(mounted, A)).toContain('mixed_machine');
  });

it('★ 用户收起只写自己这一行：本工作区不要它，别的项目照旧', () => {
    const panels = mount();
    panels.show('boarded', null, 'machine');

    panels.hide('boarded', A);

    expect(readJson(workspaceConfig(A))).toEqual({ shown: [], hidden: ['boarded'] });
    expect(panels.isEnabled('boarded', A)).toBe(false);
    expect(panels.isEnabled('boarded', B)).toBe(true);
    expect(readJson(machineConfig())).toMatchObject({ shown: ['boarded'] });
  });
});

describe('工具面跟着单元走：不再有逐把的作用域', () => {
  it('★ 卡片上板 → 它的工具全部出现；没上板 → 全部收走', () => {
    writeBoard(null, [...WORKSPACE_BOARD, ...MACHINE_BOARD]);
    const mounted = gate();

    expect(denied(mounted, A)).not.toContain('boarded_read');
    expect(denied(mounted, A)).not.toContain('machine_read');
    expect(denied(mounted, A)).toContain('project_read');
    expect(denied(mounted, A)).toContain('mixed_project');
    expect(denied(mounted, A)).toContain('mixed_machine');
  });

  it('★ 卡片面与工具面同判：同一个工作区、同一个模块，结论一致', () => {
    const panels = mount();
    const mounted = gate();
    panels.reset(A);

    for (const one of UNITS) {
      const allDenied = one.tools.every((item) => denied(mounted, A).includes(item.name));
      expect(panels.isEnabled(one.id, A)).toBe(!allDenied);
    }
  });

  it('★ 外壳自己的三把工具不会被项目收走（否则"放回来"的入口会没）', () => {
    const mounted = gate([panelsHost.manifest], ['panels']);

    expect(denied(mounted, A)).toEqual([]);
    expect(denied(mounted, B)).toEqual([]);
  });

  it('★ 外壳自己的单元两个面都不归板管：板把它明确否掉也照样在（卡片面与工具面）', () => {
    for (const workspace of [A, B]) writeBoardWith(workspace, [], ['panels']);
    const panels = mount([panelsHost.manifest], ['panels']);
    const mounted = gate([panelsHost.manifest], ['panels']);

    for (const workspace of [A, B]) {
      expect(panels.isEnabled('panels', workspace)).toBe(true);
      expect(denied(mounted, workspace)).toEqual([]);
    }
  });

  it('★ 同样的清单没走 registerOwned：板里没有它就全部收走（豁免靠标记，不靠 id）', () => {
    const mounted = gate([panelsHost.manifest]);

    const own = panelsHost.manifest.tools.filter((tool) => !tool.name.startsWith('workbench_diy'));
    expect(denied(mounted, A)).toEqual(own.map((tool) => tool.name));
  });
});

describe('B-7：hidden —— 这个工作区明确不要它', () => {
  it('★ 机器级板带来的套件：B 里开着；A 里 hide 之后 A 关、B 照旧开着（关是工作区级的）', async () => {
    writeBoard(null, [...MACHINE_BOARD]);
    const { panels, run } = toolHarness();
    const mounted = gate();
    expect(panels.isEnabled('machine-card', A)).toBe(true);
    expect(panels.isEnabled('machine-card', B)).toBe(true);
    expect(denied(mounted, A)).not.toContain('machine_read');

    await run(PANELS_HIDE_TOOL, { id: 'machine-card' });

    expect(readJson(workspaceConfig(A))).toEqual({ shown: [], hidden: ['machine-card'] });
    expect(panels.isEnabled('machine-card', A)).toBe(false);
    expect(panels.isEnabled('machine-card', B)).toBe(true);
    expect(denied(mounted, A)).toContain('machine_read');
    expect(denied(mounted, B)).not.toContain('machine_read');
  });

  it('★ hidden 压过机器级板：机器级板开着它，A 说不要就是不要，B 照旧在', async () => {
    const { panels, run } = toolHarness();

    await run(PANELS_SHOW_TOOL, { id: 'boarded', scope: 'machine' }, null);
    expect(panels.isEnabled('boarded', A)).toBe(true);
    expect(panels.isEnabled('boarded', B)).toBe(true);

    await run(PANELS_HIDE_TOOL, { id: 'boarded' });

    expect(panels.isEnabled('boarded', A)).toBe(false);
    expect(panels.isEnabled('boarded', B)).toBe(true);
    expect(readJson(workspaceConfig(A))).toEqual({ shown: [], hidden: ['boarded'] });
    expect(readJson(machineConfig())).toEqual({ shown: ['boarded'], hidden: [] });
  });

  it('★ show 把 hidden 划掉：收起来之后又放回来（本工作区自己那份重新生效）', async () => {
    writeBoard(null, [...MACHINE_BOARD]);
    const { panels, run } = toolHarness();

    await run(PANELS_HIDE_TOOL, { id: 'machine-card' });
    expect(panels.isEnabled('machine-card', A)).toBe(false);

    await run(PANELS_SHOW_TOOL, { id: 'machine-card' });

    expect(readJson(workspaceConfig(A))).toEqual({
      shown: ['machine-card'],
      hidden: [],
      order: ['machine-card'],
    });
    expect(panels.isEnabled('machine-card', A)).toBe(true);
    expect(panels.isEnabled('machine-card', B)).toBe(true);
  });

  it('★ show 也把机器级板上被本工作区收起的那块放回来（① 又选它了）', async () => {
    const { panels, run } = toolHarness();
    writeBoardWith(A, [], ['boarded']);

    expect(panels.isEnabled('boarded', A)).toBe(false);

    await run(PANELS_SHOW_TOOL, { id: 'boarded' });

    expect(readJson(workspaceConfig(A))).toEqual({
      shown: ['boarded'],
      hidden: [],
      order: ['boarded'],
    });
    expect(panels.isEnabled('boarded', A)).toBe(true);
  });

it('★ reset 清掉本工作区那些覆盖：清完回到全部跟随（文件留着但是空的）', () => {
    const panels = mount();
    panels.show('boarded', null, 'machine');
    panels.show('project-only', A);
    panels.hide('boarded', A);

    panels.reset(A);

    expect(readJson(workspaceConfig(A))).toEqual({ shown: [], hidden: [] });
    expect(panels.isEnabled('project-only', A)).toBe(false);
    expect(panels.isEnabled('boarded', A)).toBe(true);
  });

it('★ 老格式文件（只有 shown）读成"提过的那几行是覆盖"：老数据不会突然全变', () => {
    const panels = mount();
    writeBoard(null, ['machine-card', 'boarded']);
    writeBoard(A, ['project-only']);

    expect(panels.isEnabled('project-only', A)).toBe(true);
    expect(panels.isEnabled('machine-card', A)).toBe(true);
    expect(panels.isEnabled('boarded', A)).toBe(true);
  });
});
