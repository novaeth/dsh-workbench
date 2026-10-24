import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { UnitManifest } from '@dsh-workbench/shared';
import { createWorkspaceStore } from '@dsh-workbench/shared/host';
import { PANELS_FILE, PANELS_MODULE_ID, createPanelsService } from '../model/service';
import { applyPanelsPref, parsePanelsPrefAction } from '../model/prefs';

function unit(id: string, order: number): UnitManifest {
  return {
    id,
    card: { titleKey: `${id}.title`, order },
    tools: [],
    host: { inject: [] },
  };
}

const UNITS = [unit('issues', 10), unit('ci', 20)];
const A = '/w/a';
const B = '/w/b';

let dir = '';
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-panels-prefs-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function mount() {
  return createPanelsService({ manifests: () => UNITS, store: createWorkspaceStore({ root: dir }) });
}

function configFile(workspace: string): string {
  return path.join(createWorkspaceStore({ root: dir }).for(PANELS_MODULE_ID, workspace).dir, PANELS_FILE);
}

describe('parsePanelsPrefAction', () => {
  it('只留配置字段（多出来的字段直接丢掉，业务实体进不来）', () => {
    const action = parsePanelsPrefAction({ action: 'show', id: 'issues', title: '改个缺陷', content: '评论' });

    expect(action).toEqual({ action: 'show', id: 'issues' });
  });

  it('★ 只认真的动作名：enable / disable 以前会被当成 move（"启用"变成"挪到第 1 位"），现在直接报错', () => {
    expect(() => parsePanelsPrefAction({ action: 'enable', id: 'issues' })).toThrow(/不认识的 action/);
    expect(() => parsePanelsPrefAction({ action: 'disable', id: 'issues' })).toThrow(/不认识的 action/);
  });

  it('★ scope 认 workspace / machine，别的值报错', () => {
    expect(parsePanelsPrefAction({ action: 'hide', id: 'issues', scope: 'machine' })).toMatchObject({
      action: 'hide',
      id: 'issues',
      scope: 'machine',
    });
    expect(() => parsePanelsPrefAction({ action: 'hide', id: 'issues', scope: 'everyone' })).toThrow(
      /不认识的 scope/,
    );
  });

  it('★ follow 不需要 id；machine 作用域没有"回到跟随"一说', () => {
    expect(parsePanelsPrefAction({ action: 'follow' })).toEqual({ action: 'follow' });
  });

  it('不认识的 action 报错', () => {
    expect(() => parsePanelsPrefAction({ action: 'comment' })).toThrow(/不认识的 action/);
  });

  it('不是对象 → 报错并说清形状', () => {
    expect(() => parsePanelsPrefAction('nope')).toThrow(/偏好写需要一个对象/);
  });
});

describe('applyPanelsPref', () => {
  it('界面点的与 agent 工具走同一个服务（行为不分叉），且**按工作区**落盘', () => {
    const panels = mount();

    applyPanelsPref(panels, { action: 'show', id: 'issues', path: A });

    expect(panels.list(A).find((entry) => entry.id === 'issues')?.shown).toBe(true);
    expect(panels.list(B).find((entry) => entry.id === 'issues')?.shown).toBe(false);
    expect(JSON.parse(fs.readFileSync(configFile(A), 'utf8'))).toEqual({
      shown: ['issues'],
      hidden: [],
      order: ['issues'],
    });
    expect(fs.existsSync(configFile(B))).toBe(false);
  });

  it('move 改顺序、reset 清空这个工作区', () => {
    const panels = mount();

    applyPanelsPref(panels, { action: 'move', id: 'ci', index: 0, path: A });
    expect(panels.list(A).filter((entry) => entry.shown).map((entry) => entry.id)).toEqual(['ci']);

    applyPanelsPref(panels, { action: 'show', id: 'issues', path: A });
    applyPanelsPref(panels, { action: 'reset', path: A });
    expect(panels.list(A).every((entry) => entry.shown === false)).toBe(true);
    expect(JSON.parse(fs.readFileSync(configFile(A), 'utf8'))).toEqual({ shown: [], hidden: [] });
  });

  it('★ scope= machine 写的是机器级默认板，不动这个工作区那份', () => {
    const panels = mount();

    applyPanelsPref(panels, { action: 'show', id: 'issues', scope: 'machine' });
    applyPanelsPref(panels, { action: 'hide', id: 'ci', scope: 'machine', path: A });

    expect(panels.boards(B).machine).toEqual({ shown: ['issues'], hidden: ['ci'] });
    expect(panels.boards(A).workspace).toBeNull();
    expect(panels.boards(A).machine).toEqual({ shown: ['issues'], hidden: ['ci'] });
  });

  it('★ follow 把本工作区那份板删掉 ⇒ 回到跟着机器级默认板走；machine 作用域明确报错', () => {
    const panels = mount();

    applyPanelsPref(panels, { action: 'show', id: 'issues', scope: 'machine' });
    applyPanelsPref(panels, { action: 'hide', id: 'issues', path: A });
    expect(panels.boards(A).workspace).not.toBeNull();
    expect(panels.list(A).find((entry) => entry.id === 'issues')?.shown).toBe(false);

    applyPanelsPref(panels, { action: 'follow', path: A });

    expect(fs.existsSync(configFile(A))).toBe(false);
    expect(panels.boards(A).workspace).toBeNull();
    expect(panels.list(A).find((entry) => entry.id === 'issues')?.shown).toBe(true);
    expect(() => applyPanelsPref(panels, { action: 'follow', scope: 'machine' })).toThrow(/机器级默认板/);
  });

  it('缺 id 报错并列出可用套件', () => {
    const panels = mount();

    expect(() => applyPanelsPref(panels, { action: 'show' })).toThrow(/issues, ci/);
  });
});

describe('这条口子只写配置', () => {
  it('prefs 模块的依赖闭包够不到业务服务（源码扫描，可判定）', () => {
    const prefs = fs
      .readFileSync(path.resolve(__dirname, '../model/prefs.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

    expect(prefs).not.toMatch(/IssuesService|modules\/issues|opencli|workbench-client/);
  });

  it('偏好写的路由与业务投影前缀不同（业务路径永远只有 GET）', () => {
    const constants = fs.readFileSync(path.resolve(__dirname, '../../../../../shared/src/config/constants.ts'), 'utf8');

    expect(constants).toMatch(/PREFS_PREFIX = `\$\{API_PREFIX\}\/prefs`/);
  });
});
