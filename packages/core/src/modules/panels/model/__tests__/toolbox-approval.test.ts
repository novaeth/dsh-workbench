import { describe, expect, it } from 'vitest';
import type { UnitManifest } from '@dsh-workbench/shared';
import { TOOLBOX_OPEN_TOOL, panelsUnit } from '../../unit';
import { createToolbox } from '../toolbox';
import { toolboxVerdictFor } from '../toolbox-approval';

const unit: UnitManifest = {
  id: 'inventory',
  title: { zh: '库存', en: 'Inventory' },
  titleKey: 'dsh-workbench.unit.inventory.title',
  card: null,
  tools: [
    { name: 'workbench_inventory_list', writes: false },
    { name: 'workbench_inventory_build', writes: true },
  ],
  host: { inject: [] },
};

const toolbox = createToolbox({
  manifests: () => [panelsUnit, unit],
  visibleUnits: () => new Set(['panels', 'inventory']),
});

describe('开工具包的审批判定', () => {
  it('不是开包工具就不表态（交给别的族或外壳兜底）', () => {
    expect(toolboxVerdictFor({ name: 'workbench_panels_show', arguments: {} }, toolbox)).toBeUndefined();
  });

  it('★ 合法的包：ask，标题点名第一个包与数量', () => {
    const verdict = toolboxVerdictFor(
      { name: TOOLBOX_OPEN_TOOL, arguments: { targets: ['unit:inventory', 'manage'] } },
      toolbox,
    );

    expect(verdict?.kind).toBe('ask');
    expect(verdict?.kind === 'ask' ? verdict.question.zh : '').toBe('要开启库存等 2 个工具包吗？');
  });

  it('没给 targets / 不认识 / 没在板子上：审批前就拒，并给候选', () => {
    const empty = toolboxVerdictFor({ name: TOOLBOX_OPEN_TOOL, arguments: {} }, toolbox);
    const unknown = toolboxVerdictFor({ name: TOOLBOX_OPEN_TOOL, arguments: { targets: ['unit:nope'] } }, toolbox);
    const hidden = toolboxVerdictFor(
      { name: TOOLBOX_OPEN_TOOL, arguments: { targets: ['unit:inventory'] }, workspace: '/other' },
      createToolbox({
        manifests: () => [panelsUnit, unit],
        visibleUnits: () => new Set(['panels']),
      }),
    );

    expect(empty?.kind).toBe('deny');
    expect(unknown?.kind === 'deny' ? unknown.reason : '').toContain('unit:inventory');
    expect(hidden?.kind === 'deny' ? hidden.reason : '').toContain('没在板子上');
  });
});
