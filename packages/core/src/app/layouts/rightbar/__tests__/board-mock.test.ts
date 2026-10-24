import { describe, expect, it } from 'vitest';
import type { UnitManifest } from '@dsh-workbench/shared';
import type { BoardModule } from '@dsh-workbench/shared';
import { buildBoardMocks } from '../board-mock';
import { planBoard } from '../board-plan';

const ROSTER: readonly UnitManifest[] = [
  {
    id: 'issues',
    card: { titleKey: 'issues.mine', order: 10 },
    tools: [],
    host: { inject: [] },
  },
];

const SEED: BoardModule = {
  id: 'issues',
  titleKey: 'issues.mine',
  order: 10,
  View: () => null,
};

const ALL: readonly BoardModule[] = [SEED];
const MOCKS = buildBoardMocks(ROSTER);

const REAL = { modules: [SEED], configRead: true };

describe('BOARD_MOCKS', () => {
  it('★ 每个场景都演示了它说的形状（漂移就红）', () => {
    for (const mock of MOCKS) {
      const plan = planBoard(mock.shape, REAL, ALL);

      if (mock.expect === undefined) {
        expect(mock.id, '没声称形状的场景只该是 real').toBe('real');
        expect(plan.modules).toHaveLength(1);
        continue;
      }
      expect(plan.modules, mock.id).toHaveLength(mock.expect.cards);
      expect(plan.empty, mock.id).toBe(mock.expect.empty);
    }
  });

  it('id、按钮字、那句人话都不重复且不为空', () => {
    const ids = MOCKS.map((mock) => mock.id);
    const labels = MOCKS.map((mock) => mock.label);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);
    for (const mock of MOCKS) expect(mock.note.trim(), mock.id).not.toBe('');
  });

  it('★ 覆盖了真机上造不出来的那几种：配置没读到、空看板、很多张（要滚）', () => {
    const byId = new Map(MOCKS.map((mock) => [mock.id, mock]));

    expect(byId.get('unread')?.shape).toEqual({ kind: 'unread' });
    expect(planBoard({ kind: 'unread' }, REAL, ALL).reading).toBe(true);
    expect(byId.get('empty')?.shape).toEqual({ kind: 'empty' });
    expect(byId.get('many')?.shape).toEqual({ kind: 'copies', count: 8 });
  });

  it('★ 第一条是"真实"：夹具开着也不是一上来就接管', () => {
    expect(MOCKS[0]?.id).toBe('real');
    expect(MOCKS[0]?.shape).toEqual({ kind: 'real' });
  });

  it('花名册里没有带卡片的模块时，只剩不依赖模块的那几条（不编形状）', () => {
    const bare = buildBoardMocks([]);

    expect(bare.map((mock) => mock.id)).toEqual(['real', 'kit', 'empty', 'unread']);
  });

  it('★ 组件预览那一条谁在都能摆（它不依赖任何模块，也不读数据）', () => {
    const kit = MOCKS.find((mock) => mock.id === 'kit');

    expect(kit?.shape).toEqual({ kind: 'kit' });
    const plan = planBoard({ kind: 'kit' }, REAL, ALL);
    expect(plan.modules.map((entry) => entry.module.id)).toEqual(['wb-kit-preview']);
    expect(plan.empty).toBe(false);
    expect(plan.reading).toBe(false);
  });
});
