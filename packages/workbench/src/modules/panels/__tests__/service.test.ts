import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UnitManifest } from '@dsh-workbench/shared';
import {
  createWorkspaceStore,
  workspaceKey,
  type WorkspaceStore,
} from '@dsh-workbench/shared/host';
import { PANELS_FILE, PANELS_MODULE_ID, createPanelsService } from '../model/service';
import { panelsUnit } from '../unit';

const A = '/w/a';
const B = '/w/b';

function unit(id: string, order: number): UnitManifest {
  return { id, card: { titleKey: `${id}.title`, order }, tools: [], host: { inject: [] } };
}

const UNITS = [unit('issues', 10), unit('ci', 20)];
const UI: UnitManifest = { id: 'panels', card: null, tools: [], host: { inject: [] } };
const TOOLBOX: UnitManifest = { id: 'delivery', card: null, tools: [], host: { inject: [] } };

let root = '';
let store: WorkspaceStore;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-panels-'));
  store = createWorkspaceStore({ root });
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function mount(options: {
  manifests?: readonly UnitManifest[];
  store?: WorkspaceStore;
  owned?: readonly string[];
  logger?: { warn(message: string): void };
} = {}) {
  return createPanelsService({
    manifests: () => options.manifests ?? UNITS,
    store: options.store ?? createWorkspaceStore({ root }),
    owned: () => options.owned ?? [],
    ...(options.logger === undefined ? {} : { logger: options.logger }),
  });
}

function configFile(workspace: string): string {
  return path.join(store.for(PANELS_MODULE_ID, workspace).dir, PANELS_FILE);
}

function saved(workspace: string): unknown {
  return JSON.parse(fs.readFileSync(configFile(workspace), 'utf8'));
}

describe('createPanelsService：默认全空', () => {
  it('没配过的任何工作区 → 一个都不启用', () => {
    const service = mount();

    expect(service.list(A).every((entry) => entry.shown === false)).toBe(true);
    expect(service.isEnabled('issues', A)).toBe(false);
    expect(service.isEnabled('nope', A)).toBe(false);
    expect(service.isEnabled('issues', null)).toBe(false);
  });

  it('不知道工作区（null）也算全空，但清单照给', () => {
    const service = mount();

    expect(service.list(null).map((entry) => `${entry.id}:${entry.shown}`)).toEqual(['issues:false', 'ci:false']);
  });

  it('只是读一下不会往盘上写任何东西（读不是写）', () => {
    const service = mount();

    service.list(A);
    service.isEnabled('issues', A);

    expect(fs.existsSync(configFile(A))).toBe(false);
  });
});

describe('createPanelsService：按工作区隔离（这次改动的核心）', () => {
  it('★ A 启用不影响 B；B 启用不影响 A', () => {
    const service = mount();

    service.show('issues', A);

    expect(service.isEnabled('issues', A)).toBe(true);
    expect(service.isEnabled('issues', B)).toBe(false);

    service.show('ci', B);

    expect(service.list(A).filter((entry) => entry.shown).map((entry) => entry.id)).toEqual(['issues']);
    expect(service.list(B).filter((entry) => entry.shown).map((entry) => entry.id)).toEqual(['ci']);
  });

  it('★ 收起只影响那一个工作区，且**别的项目不受影响**', () => {
    const service = mount();
    service.show('issues', A);
    service.show('issues', B);

    service.hide('issues', A);

    expect(service.isEnabled('issues', A)).toBe(false);
    expect(service.isEnabled('issues', B)).toBe(true);
  });

  it('恢复默认只清那一个工作区', () => {
    const service = mount();
    service.show('issues', A);
    service.show('issues', B);

    service.reset(A);

    expect(service.list(A).every((entry) => entry.shown === false)).toBe(true);
    expect(service.isEnabled('issues', B)).toBe(true);
  });

  it('没有工作区时，显示类的写要**说清楚**地报错（不是静默丢掉）', () => {
    const service = mount();

    expect(() => service.show('issues', null)).toThrow(/不属于任何工作区/);
    expect(() => service.hide('issues', '')).toThrow(/不属于任何工作区/);
    expect(() => service.show('issues', '   ')).toThrow(/不属于任何工作区/);
    expect(() => service.move('issues', 0, null)).toThrow(/不属于任何工作区/);
    expect(() => service.reset(null)).toThrow(/不属于任何工作区/);
  });
});

describe('createPanelsService：落点与落盘', () => {
  it('★ 落点 = 这个工作区里、这个套件自己的文件夹（可读名 + 短哈希）', () => {
    mount().show('issues', A);

    expect(workspaceKey(A)).toMatch(/^a-[0-9a-f]{8}$/);
    expect(configFile(A)).toBe(path.join(root, workspaceKey(A), PANELS_MODULE_ID, PANELS_FILE));
    expect(saved(A)).toEqual({ shown: ['issues'], hidden: [], order: ['issues'] });
    expect(PANELS_MODULE_ID).toBe(panelsUnit.id);
    expect(fs.existsSync(configFile(B))).toBe(false);
  });

  it('★ 启用之后**真的落盘**：新实例（新 store）读到的是它', () => {
    mount().show('issues', A);

    const reopened = mount();

    expect(reopened.isEnabled('issues', A)).toBe(true);
    expect(reopened.list(A).find((entry) => entry.id === 'issues')?.source).toBe('user');
  });

  it('顺序也落盘（那份 order 就是用户看到的顺序，不是"改过哪几行"）', () => {
    const service = mount();
    service.show('issues', A);
    service.show('ci', A);
    service.move('ci', 0, A);

    expect(saved(A)).toEqual({ shown: ['issues', 'ci'], hidden: [], order: ['ci', 'issues'] });
    expect(mount().list(A).slice(0, 2).map((entry) => entry.id)).toEqual(['ci', 'issues']);
  });

  it('★ 恢复默认落一个**空名单文件**（"配成空"从此不是"没配过"）', () => {
    const service = mount();
    service.show('issues', A);
    service.reset(A);

    expect(fs.existsSync(configFile(A))).toBe(true);
    expect(saved(A)).toEqual({ shown: [], hidden: [] });
  });

it('★ 机器级那份给所有"没提过这一行"的工作区兜底：提过的那一行才按自己的来', () => {
    const panels = mount();
    panels.show('issues', null, 'machine');

    expect(panels.isEnabled('issues', A)).toBe(true);

    panels.hide('issues', A);
    expect(panels.isEnabled('issues', A)).toBe(false);
    expect(panels.isEnabled('issues', B)).toBe(true);

    panels.follow(A, 'issues');
    expect(panels.isEnabled('issues', A)).toBe(true);
  });

  it('配置文件坏掉 → 当默认，不拦住使用', () => {
    fs.mkdirSync(path.dirname(configFile(A)), { recursive: true });
    fs.writeFileSync(configFile(A), '{ 这不是 json', 'utf8');

    expect(mount().list(A)).toHaveLength(2);
  });

  it('没有可写根 → 只在本进程生效（store 退化成内存），不抛', () => {
    const warn = vi.fn();
    const memory = createWorkspaceStore({ root: null, logger: { warn } });
    const service = mount({ store: memory });

    service.show('issues', A);

    expect(service.isEnabled('issues', A)).toBe(true);
    expect(service.list(A).find((entry) => entry.id === 'issues')?.shown).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('只在本进程内生效'));
  });

  it('订阅者每次写入都被通知（面板靠它重画）', () => {
    const service = mount();
    const listener = vi.fn();
    service.subscribe(listener);

    service.show('issues', A);
    service.hide('issues', A);

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('订阅者报错只 warn，不影响别的订阅者，也不让写失败', () => {
    const warn = vi.fn();
    const service = mount({ logger: { warn } });
    const good = vi.fn();
    service.subscribe(() => {
      throw new Error('订阅者炸了');
    });
    service.subscribe(good);

    expect(() => service.show('issues', A)).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('订阅者报错'));
  });

  it('取消订阅之后就不再被通知（`subscribe` 返回的那个函数真的有用）', () => {
    const service = mount();
    const listener = vi.fn();
    const unsubscribe = service.subscribe(listener);

    unsubscribe();
    service.show('issues', A);

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('createPanelsService：外壳自己的单元（registerOwned 那条路）', () => {
  const shell = (owned: readonly string[]) => mount({ manifests: [...UNITS, UI], owned });

  it('不能收起（它是把别的套件放回来的入口）', () => {
    const service = shell(['panels']);

    expect(() => service.show('panels', A)).toThrow(/没有卡片，不能收起/);
    expect(() => service.hide('panels', A)).toThrow(/没有卡片，不能收起/);
  });

  it('★ 用户装的模块没有卡片也照常能开关（它有工具，只是不上板）', () => {
    const service = mount({ manifests: [...UNITS, TOOLBOX, UI], owned: ['panels'] });
    const at = (entries: readonly { readonly id: string; readonly shown: boolean }[]): boolean =>
      entries.some((entry) => entry.id === TOOLBOX.id && entry.shown);

    expect(at(service.show(TOOLBOX.id, A))).toBe(true);
    expect(at(service.hide(TOOLBOX.id, A))).toBe(false);
    expect(service.list(A).some((entry) => entry.id === TOOLBOX.id && !entry.hasCard)).toBe(true);
    expect(() => service.show(UI.id, A)).toThrow(/没有卡片，不能收起/);
  });

  it('★ 它不归用户的板管：一个板都没有 / 不知道工作区，都算在', () => {
    const service = shell(['panels']);

    expect(service.isEnabled('panels', A)).toBe(true);
    expect(service.isEnabled('panels', null)).toBe(true);
  });

  it('别人硬把它写进名单也无效：仍算启用，且它不进面板清单', () => {
    fs.mkdirSync(path.dirname(configFile(A)), { recursive: true });
    fs.writeFileSync(configFile(A), JSON.stringify({ shown: ['panels', 'issues'] }), 'utf8');
    const service = shell(['panels']);

    expect(service.isEnabled('panels', A)).toBe(true);
    expect(service.list(A).some((entry) => entry.id === 'panels')).toBe(false);
    expect(service.isEnabled('issues', A)).toBe(true);
  });

  it('★ 工作区把它写进 hidden（明确不要它）也一样在 —— 它是面板本身，不是用户选的模块', () => {
    fs.mkdirSync(path.dirname(configFile(A)), { recursive: true });
    fs.writeFileSync(configFile(A), JSON.stringify({ shown: [], hidden: ['panels'] }), 'utf8');
    const service = shell(['panels']);

    expect(service.isEnabled('panels', A)).toBe(true);
    expect(service.isEnabled('panels', B)).toBe(true);
  });

  it('★ 没被标成"外壳自己的"就不吃这个特例：板里没有它 → 不在（能力只在用户的板上）', () => {
    const service = mount({ manifests: [...UNITS, UI] });

    expect(service.isEnabled('panels', A)).toBe(false);
  });
});

describe('createPanelsService：未知 id', () => {
  it('报错并列出可用项（不静默忽略）', () => {
    const service = mount();

    expect(() => service.show('nope', A)).toThrow(/没有这个套件：nope/);
    expect(() => service.show('nope', A)).toThrow(/issues/);
  });
});

describe('B-7：hidden = 这个工作区明确不要它', () => {
  const MACHINE: UnitManifest = unit('fx', 5);
  const WITH_MACHINE = [MACHINE, ...UNITS];

  function machineSaved(): unknown {
    return JSON.parse(fs.readFileSync(path.join(store.machine(PANELS_MODULE_ID).dir, PANELS_FILE), 'utf8'));
  }

  function machineBoard(shown: readonly string[], hidden: readonly string[] = []): void {
    store.machine(PANELS_MODULE_ID).write(PANELS_FILE, { shown, hidden });
  }

  it('★ hide = 从 shown 划掉 + 记进 hidden；show = 从 hidden 划掉 + 记进 shown', () => {
    const service = mount();

    service.show('issues', A);
    expect(saved(A)).toEqual({ shown: ['issues'], hidden: [], order: ['issues'] });

    service.hide('issues', A);
    expect(saved(A)).toEqual({ shown: [], hidden: ['issues'] });
    expect(service.isEnabled('issues', A)).toBe(false);

    service.show('issues', A);
    expect(saved(A)).toEqual({ shown: ['issues'], hidden: [], order: ['issues'] });
    expect(service.isEnabled('issues', A)).toBe(true);
  });

  it('★ hide / show 带 scope: machine 按同一形状落机器级那份（machine 那份也有 hidden）', () => {
    const service = mount();

    service.show('issues', null, 'machine');
    expect(machineSaved()).toEqual({ shown: ['issues'], hidden: [] });

    service.hide('issues', null, 'machine');
    expect(machineSaved()).toEqual({ shown: [], hidden: ['issues'] });

    service.show('issues', null, 'machine');
    expect(machineSaved()).toEqual({ shown: ['issues'], hidden: [] });
  });

  it('★ 机器级板自己的 hidden 被读：那份板列着它又标成不要 → 没配过的工作区看不到；show 划掉这笔就回来', () => {
    const service = mount({ manifests: WITH_MACHINE });
    machineBoard(['fx'], ['fx']);

    expect(service.boards(B).machine).toEqual({ shown: ['fx'], hidden: ['fx'] });
    expect(service.isEnabled('fx', B)).toBe(false);

    service.show('fx', null, 'machine');

    expect(machineSaved()).toEqual({ shown: ['fx'], hidden: [] });
    expect(service.isEnabled('fx', B)).toBe(true);

    service.hide('fx', null, 'machine');

    expect(machineSaved()).toEqual({ shown: [], hidden: ['fx'] });
    expect(service.isEnabled('fx', B)).toBe(false);
    expect(mount({ manifests: WITH_MACHINE }).isEnabled('fx', B)).toBe(false);
  });

  it('★ 老格式的机器级文件（只有 shown）含义与以前一模一样：列着的在、没列的不在', () => {
    store.machine(PANELS_MODULE_ID).write(PANELS_FILE, { shown: ['fx'] });
    const service = mount({ manifests: WITH_MACHINE });

    expect(service.boards(B).machine).toEqual({ shown: ['fx'], hidden: [] });
    expect(service.isEnabled('fx', B)).toBe(true);
    expect(service.isEnabled('issues', B)).toBe(false);
    expect(service.list(B).filter((entry) => entry.shown).map((entry) => entry.id)).toEqual(['fx']);
  });

  it('★ 机器级板带进来的套件：这个工作区 hide 了就真关掉，别的工作区照旧在', () => {
    machineBoard(['fx']);
    const service = mount({ manifests: WITH_MACHINE });

    expect(service.isEnabled('fx', A)).toBe(true);
    expect(service.isEnabled('fx', B)).toBe(true);

    service.hide('fx', A);

    expect(service.isEnabled('fx', A)).toBe(false);
    expect(service.isEnabled('fx', B)).toBe(true);
    expect(saved(A)).toEqual({ shown: [], hidden: ['fx'] });
    expect(fs.existsSync(configFile(B))).toBe(false);
  });

  it('★ hidden 压过机器级板：机器级板开着它，本工作区说不要就是不要', () => {
    machineBoard(['issues']);
    const service = mount();

    expect(service.isEnabled('issues', A)).toBe(true);
    expect(service.isEnabled('issues', B)).toBe(true);

    service.hide('issues', A);

    expect(service.isEnabled('issues', A)).toBe(false);
    expect(service.isEnabled('issues', B)).toBe(true);
    expect(saved(A)).toEqual({ shown: [], hidden: ['issues'] });
  });

it('★ reset 清掉本工作区那些覆盖：清完回到全部跟随（文件留着但是空的）', () => {
    const panels = mount();
    panels.show('issues', null, 'machine');
    panels.hide('issues', A);

    panels.reset(A);

    expect(JSON.parse(fs.readFileSync(configFile(A), 'utf8'))).toEqual({ shown: [], hidden: [] });
    expect(panels.isEnabled('issues', A)).toBe(true);
  });

it('★ 老格式文件（只有 shown）读成"提过的那几行是覆盖"：老数据不会突然全变', () => {
    const panels = mount();
    panels.show('issues', null, 'machine');
    panels.show('issues', A);

    expect(panels.isEnabled('issues', A)).toBe(true);

    panels.hide('issues', A);
    expect(panels.isEnabled('issues', A)).toBe(false);
  });

  it('★ release（放手）两边一起划掉：hidden 里那笔不会留到重装之后', () => {
    const service = mount();
    service.hide('issues', A);

    service.release('issues');

    expect(saved(A)).toEqual({ shown: [], hidden: [] });
    expect(mount().isReleased('issues')).toBe(true);
  });
});
