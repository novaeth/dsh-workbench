import { describe, expect, it } from 'vitest';
import type { UnitManifest } from '@dsh-workbench/shared';
import { unitTitleKey } from '@dsh-workbench/shared';
import {
  EMPTY_BOARD,
  parseBoard,
  parseReleased,
  resolvePanels,
  resolveScope,
  withHidden,
  withMoved,
  withReleased,
  withShown,
  withoutPanel,
  withoutReleased,
  type PanelBoard,
  type ScopeBoards,
} from '../model/config';

function unit(id: string, order: number): UnitManifest {
  return { id, titleKey: `${id}.title`, card: { order }, tools: [], host: { inject: [] } };
}

const UNITS = [unit('issues', 10), unit('ci', 20), unit('commits', 30)];

function board(shown: readonly string[] = [], hidden: readonly string[] = []): PanelBoard {
  return { shown, hidden };
}

const NOTHING: ScopeBoards = { workspace: null, machine: null };

function rows(workspace: PanelBoard | null, machine: PanelBoard | null = null) {
  return resolvePanels(UNITS, { workspace, machine });
}

function visible(workspace: PanelBoard | null, machine: PanelBoard | null = null): string[] {
  return resolvePanels(UNITS, { workspace, machine })
    .filter((entry) => entry.shown && entry.hasCard)
    .map((entry) => entry.id);
}

describe('resolveScope：三步解析（只有用户的板说话）', () => {
  it('③ 一个板都没有 → 不在（ADR-0009 的「默认全空」继续成立）', () => {
    expect(resolveScope({ id: 'x', boards: NOTHING })).toBe(false);
  });

  it('② 机器级板里选了 → 在；没选 → 不在（这个工作区没配过）', () => {
    expect(resolveScope({ id: 'x', boards: { workspace: null, machine: board(['x']) } })).toBe(true);
    expect(resolveScope({ id: 'x', boards: { workspace: null, machine: board(['y']) } })).toBe(false);
    expect(resolveScope({ id: 'x', boards: { workspace: null, machine: EMPTY_BOARD } })).toBe(false);
  });

it('① 本工作区提到的那一行按它说的来；没提到的那一行跟着机器级板', () => {
    const boards = {
      workspace: { shown: ['mine'], hidden: [] },
      machine: { shown: ['theirs'], hidden: [] },
    };

    expect(resolveScope({ id: 'mine', boards })).toBe(true);
    expect(resolveScope({ id: 'theirs', boards })).toBe(true);
    expect(resolveScope({ id: 'nobody', boards })).toBe(false);
  });

it('① 只压过它自己提到的那一行：别的行仍听机器级板（逐行覆盖）', () => {
    const boards = {
      workspace: { shown: [], hidden: ['theirs'] },
      machine: { shown: ['theirs', 'other'], hidden: [] },
    };

    expect(resolveScope({ id: 'theirs', boards })).toBe(false);
    expect(resolveScope({ id: 'other', boards })).toBe(true);
  });
});

describe('resolveScope：hidden 在每一格里都是最强的那一格', () => {
  it('★ hidden 压过同一格的 shown', () => {
    expect(resolveScope({ id: 'x', boards: { workspace: board(['x'], ['x']), machine: null } })).toBe(false);
  });

  it('★ 本工作区的 hidden 压过机器级板的 shown', () => {
    expect(resolveScope({ id: 'x', boards: { workspace: board([], ['x']), machine: board(['x']) } })).toBe(false);
  });

  it('机器级板自己的 hidden 也算数（两格同判）', () => {
    expect(resolveScope({ id: 'x', boards: { workspace: null, machine: board(['x'], ['x']) } })).toBe(false);
  });

  it('hidden 只在本工作区生效：没配过的工作区不受别的工作区的 hidden 影响', () => {
    expect(resolveScope({ id: 'x', boards: { workspace: null, machine: board(['x']) } })).toBe(true);
  });
});

describe('resolvePanels：默认全空', () => {
  it('没配过的工作区 → 一个都不显示（但清单顺序还在）', () => {
    const entries = resolvePanels(UNITS, NOTHING);

    expect(entries.map((entry) => entry.id)).toEqual(['issues', 'ci', 'commits']);
    expect(entries.every((entry) => entry.shown === false)).toBe(true);
    expect(entries.every((entry) => entry.source === 'default')).toBe(true);
    expect(entries.map((entry) => entry.order)).toEqual([10, 20, 30]);
  });

  it('空名单与"没有名单"在只有工作区这一份时都全空（差别见 scope.test）', () => {
    expect(rows(EMPTY_BOARD).every((entry) => entry.shown === false)).toBe(true);
  });

  it('★ 机器级默认板只回答"默认开哪几行"：顺序按各模块自己声明的（那份名单的次序不参与排名）', () => {
    const entries = resolvePanels(UNITS, { workspace: null, machine: board(['commits', 'issues']) });

    expect(entries.filter((entry) => entry.shown).map((entry) => entry.id)).toEqual(['issues', 'commits']);
    expect(entries.map((entry) => entry.order)).toEqual([0, 1, 22]);
  });

it('★ 顺序只看本工作区那份：它排过的按它排，没排过的按模块声明顺序跟在后面', () => {
    const units = [
      { id: 'a', titleKey: 'a', card: { order: 10 }, tools: [], host: { inject: [] } },
      { id: 'b', titleKey: 'b', card: { order: 20 }, tools: [], host: { inject: [] } },
    ] as never;
    const placed = resolvePanels(units, {
      workspace: { shown: ['b'], hidden: [], order: ['b'] },
      machine: { shown: ['a'], hidden: [] },
    });
    const declared = resolvePanels(units, {
      workspace: { shown: ['b'], hidden: [] },
      machine: { shown: ['a'], hidden: [] },
    });

    expect(placed.map((entry) => entry.id)).toEqual(['b', 'a']);
    expect(declared.map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(placed.every((entry) => entry.shown)).toBe(true);
    expect(declared.every((entry) => entry.shown)).toBe(true);
  });
});

describe('无看板的模块：也进名单，但不参与排序', () => {
  const NO_CARD: UnitManifest = { id: 'delivery', titleKey: unitTitleKey('delivery'), card: null, tools: [], host: { inject: [] } };

  it('★ 列出来、排在带卡片的后面（按 id 定序），hasCard=false', () => {
    const entries = resolvePanels([...UNITS, NO_CARD], NOTHING);

    expect(entries.map((entry) => entry.id)).toEqual(['issues', 'ci', 'commits', 'delivery']);
    expect(entries.map((entry) => entry.hasCard)).toEqual([true, true, true, false]);
  });

  it('★ 没有卡片也有名字：标题键是清单合成的那个，不是单元 id', () => {
    const entries = resolvePanels([...UNITS, NO_CARD], NOTHING);

    expect(entries[3]?.titleKey).toBe('dsh-workbench.unit.delivery.title');
  });

  it('★ 它在板上被列过也不搅乱带卡片那几行的排名（那份名单的次序压根不参与）', () => {
    const entries = resolvePanels([...UNITS, NO_CARD], {
      workspace: null,
      machine: board(['commits', 'issues', 'delivery']),
    });

    expect(entries.map((entry) => entry.id)).toEqual(['issues', 'commits', 'ci', 'delivery']);
  });

  it('★ 外壳自己的那几件不列（它无看板，又是把别的套件放回来的入口）', () => {
    const entries = resolvePanels(
      [...UNITS, { ...NO_CARD, id: 'panels' }],
      NOTHING,
      new Set(['panels']),
    );

    expect(entries.map((entry) => entry.id)).toEqual(['issues', 'ci', 'commits']);
  });
});

describe('显示名单：显示 / 收起', () => {
  it('显示一个（之前一行都没开）→ 它就在第一位，并把这份顺序记下来', () => {
    const next = withShown(EMPTY_BOARD, 'commits', visible(null));
    const entries = rows(next);

    expect(entries[0]?.id).toBe('commits');
    expect(entries[0]?.shown).toBe(true);
    expect(entries[0]?.source).toBe('user');
    expect(entries.slice(1).map((entry) => entry.id)).toEqual(['issues', 'ci']);
    expect(next.order).toEqual(['commits']);
  });

  it('★ 显示第二个 → 追在"已开启的最后一位"，不是插到最前面', () => {
    const first = withShown(EMPTY_BOARD, 'commits', visible(null));
    const second = withShown(first, 'issues', visible(first));

    expect(second.order).toEqual(['commits', 'issues']);
    expect(rows(second).filter((entry) => entry.shown).map((entry) => entry.id)).toEqual([
      'commits',
      'issues',
    ]);
  });

  it('★ 机器板默认开着 issues、ci，本工作区新开 commits → 它追加到最后', () => {
    const machine = board(['issues', 'ci']);
    const next = withShown(EMPTY_BOARD, 'commits', visible(null, machine));
    const entries = rows(next, machine);

    expect(next.order).toEqual(['issues', 'ci', 'commits']);
    expect(entries.filter((entry) => entry.shown).map((entry) => entry.id)).toEqual([
      'issues',
      'ci',
      'commits',
    ]);
  });

  it('再显示一次已在名单里的**不挪位**（顺序是用户排出来的）', () => {
    const before: PanelBoard = { shown: ['commits', 'issues'], hidden: [], order: ['commits', 'issues'] };

    expect(withShown(before, 'commits', visible(before)).order).toEqual(['commits', 'issues']);
  });

  it('★ 收起一个 → 从 shown 划掉、同时记进 hidden，且**不改入参**', () => {
    const before = board(['issues', 'commits']);

    expect(withHidden(before, 'issues')).toEqual({ shown: ['commits'], hidden: ['issues'] });
    expect(before).toEqual({ shown: ['issues', 'commits'], hidden: [] });
  });

  it('★ 收起一个不在名单里的 → 照样记进 hidden（幂等）', () => {
    expect(withHidden(board(['issues']), 'ci')).toEqual({ shown: ['issues'], hidden: ['ci'] });
    expect(withHidden(board([], ['ci']), 'ci')).toEqual({ shown: [], hidden: ['ci'] });
    expect(withShown(EMPTY_BOARD, 'issues')).toEqual({ shown: ['issues'], hidden: [] });
  });

  it('★ 显示一个之前收起的 → 从 hidden 划掉（否则永远放不回来）', () => {
    expect(withShown(board([], ['issues']), 'issues')).toEqual({ shown: ['issues'], hidden: [] });
  });

  it('★ withoutPanel：两边一起划掉（放手时用）', () => {
    expect(withoutPanel(board(['issues', 'ci'], ['commits']), 'issues')).toEqual({
      shown: ['ci'],
      hidden: ['commits'],
    });
  });
});

describe('withMoved：按"可见顺序"落位（下标数的是开着的那几行）', () => {
  it('已在可见顺序里的：按目标位置重排', () => {
    const moved = withMoved(board(['issues', 'commits']), 'commits', 0, ['issues', 'commits']);

    expect(moved.order).toEqual(['commits', 'issues']);
    expect(rows(moved).filter((entry) => entry.shown).map((entry) => entry.id)).toEqual([
      'commits',
      'issues',
    ]);
  });

  it('目标位置就是当前位置 → 顺序不变', () => {
    const moved = withMoved(board(['issues', 'ci']), 'ci', 1, ['issues', 'ci']);

    expect(moved.order).toEqual(['issues', 'ci']);
    expect(moved.shown).toEqual(['issues', 'ci']);
  });

  it('不在可见顺序里的（没开的那一行）：移动 = **启用并放到那位**（拖着往板上放就是这个意思）', () => {
    const moved = withMoved(board(['issues']), 'commits', 0, ['issues']);

    expect(moved.shown).toEqual(['issues', 'commits']);
    expect(rows(moved).filter((entry) => entry.shown).map((entry) => entry.id)).toEqual([
      'commits',
      'issues',
    ]);
  });

  it('★ 移动一个被收起的 → 也把它从 hidden 划掉（拖上板就是又要它）', () => {
    const moved = withMoved(board(['issues'], ['commits']), 'commits', 0, ['issues']);

    expect(moved.hidden).toEqual([]);
    expect(moved.order).toEqual(['commits', 'issues']);
  });

  it('★ 拖到底部是真的到底（旧实现把下标当稀疏数组下标，数组只剩 1 个时会被夹成 0）', () => {
    const moved = withMoved(board(['issues', 'ci', 'commits']), 'issues', 2, [
      'issues',
      'ci',
      'commits',
    ]);

    expect(moved.order).toEqual(['ci', 'commits', 'issues']);
  });

  it('越界夹到两端，不丢项', () => {
    expect(withMoved(board(['issues']), 'issues', 99, ['issues']).order).toEqual(['issues']);
    expect(withMoved(board(['issues', 'ci']), 'ci', -5, ['issues', 'ci']).order).toEqual([
      'ci',
      'issues',
    ]);
  });

  it('连续移动两次仍然对（那份顺序就是用户看到的那个顺序）', () => {
    let placed: PanelBoard = board(['issues', 'ci', 'commits']);
    placed = withMoved(placed, 'commits', 0, ['issues', 'ci', 'commits']);
    placed = withMoved(placed, 'ci', 0, placed.order ?? []);

    expect(placed.order).toEqual(['ci', 'commits', 'issues']);
  });
});

describe('放手（机器级）', () => {
  it('加一笔 / 划掉一笔，且不会加重复的', () => {
    expect(withReleased([], 'issues')).toEqual(['issues']);
    expect(withReleased(['issues'], 'issues')).toEqual(['issues']);
    expect(withReleased(['issues'], 'ci')).toEqual(['issues', 'ci']);
    expect(withoutReleased(['issues', 'ci'], 'issues')).toEqual(['ci']);
  });

  it('没放手过时划掉 → 原样（幂等）', () => {
    expect(withoutReleased(['ci'], 'issues')).toEqual(['ci']);
  });
});

describe('读盘形状', () => {
  it('parseBoard：坏元素挑掉，好数据留下', () => {
    expect(parseBoard({ shown: ['issues', 7, null], hidden: [4, 'ci'] })).toEqual({
      shown: ['issues'],
      hidden: ['ci'],
    });
  });

  it('★ 老格式（只有 shown）读出来 hidden 为空 —— 意思与以前一模一样', () => {
    expect(parseBoard({ shown: ['issues'] })).toEqual({ shown: ['issues'], hidden: [] });
    expect(parseBoard({})).toEqual(EMPTY_BOARD);
  });

  it('★ order（本工作区那份顺序）也读回来；空 / 没有这个字段都当"没排过"', () => {
    expect(parseBoard({ shown: ['commits'], hidden: [], order: ['commits', 'issues'] })).toEqual({
      shown: ['commits'],
      hidden: [],
      order: ['commits', 'issues'],
    });
    expect(parseBoard({ shown: ['commits'], order: [] })).toEqual({ shown: ['commits'], hidden: [] });
  });

  it('parseBoard：不是对象 / 没有 shown → 全空（不让坏文件拦住启动）', () => {
    expect(parseBoard(null)).toEqual(EMPTY_BOARD);
    expect(parseBoard('nope')).toEqual(EMPTY_BOARD);
    expect(parseBoard({ shown: 'issues' })).toEqual(EMPTY_BOARD);
  });

  it('parseReleased：坏元素挑掉；坏形状 → 空（= 没有放手过）', () => {
    expect(parseReleased({ ids: ['ci', 42] })).toEqual(['ci']);
    expect(parseReleased(null)).toEqual([]);
    expect(parseReleased({})).toEqual([]);
  });
});
