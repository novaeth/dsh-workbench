import { describe, expect, it } from 'vitest';
import type { UnitManifest } from '@dsh-workbench/shared';
import { panelBadgeKey, selectPanelUnits } from '../board-selection';
import { buildPanelMocks } from '../panel-mock';

const ROSTER: readonly UnitManifest[] = [
  {
    id: 'issues',
    titleKey: 'issues.mine', card: { order: 10 },
    tools: [],
    host: { inject: [] },
  },
];
const MOCKS = buildPanelMocks(ROSTER);

describe('PANEL_MOCKS', () => {
  it('★ 每个场景都演示了它说的行数与徽标（漂移就红）', () => {
    for (const mock of MOCKS) {
      const rows = selectPanelUnits(mock.units, mock.capabilities);

      expect(rows, mock.id).toHaveLength(mock.expect.rows);
      if (mock.expect.badge !== undefined) {
        expect(panelBadgeKey(mock.capabilities?.[rows[0]?.id ?? '']) ?? null, mock.id).toBe(mock.expect.badge);
      }
      if (mock.expect.on !== undefined) {
        expect(rows[0]?.shown, mock.id).toBe(mock.expect.on);
      }
    }
  });

  it('id 与按钮字都不重复', () => {
    const ids = MOCKS.map((mock) => mock.id);
    const labels = MOCKS.map((mock) => mock.label);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('★ 覆盖了那些真机上难造的状态：筛选掉的、正在写、写失败、拖动中', () => {
    const ids = MOCKS.map((mock) => mock.id);

    expect(ids).toContain('hidden');
    expect(ids).toContain('busy');
    expect(ids).toContain('failed');
    expect(ids).toContain('drag');
    expect(ids).toContain('drag-off');
    expect(ids).toContain('long');
  });

  it('★ 拖到未开启的那一行上那个场景就是"没有落点"（from 有、over 空）', () => {
    const mock = MOCKS.find((item) => item.id === 'drag-off');

    expect(mock?.drag?.over).toBeNull();
    expect(mock?.drag?.from).not.toBeUndefined();
    expect(MOCKS.find((item) => item.id === 'drag')?.drag?.over).toBe(0);
  });

  it('★ 「无看板」那一行照样进名单，但 hasCard=false（界面据此不画拖柄与开关）', () => {
    const mock = MOCKS.find((item) => item.id === 'no-card');
    const rows = mock === undefined ? [] : selectPanelUnits(mock.units, mock.capabilities);

    expect(rows[0]?.hasCard).toBe(true);
    expect(rows.at(-1)?.hasCard).toBe(false);
  });

  it('每一行的名字都不为空', () => {
    for (const mock of MOCKS) {
      for (const unit of mock.units) expect(unit.titleKey.trim(), mock.id).not.toBe('');
    }
  });
});
