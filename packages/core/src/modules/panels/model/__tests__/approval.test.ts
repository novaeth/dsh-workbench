import { describe, expect, it } from 'vitest';
import { PANELS_SHOW_TOOL } from '../../unit';
import { approvalVerdict, publishVerdictFor, stopVerdictFor } from '../approval';

describe('每一族的判定（approval.ts）', () => {
  it('外壳写工具：问到点子上的那一句交给调用方，工具本身说了算', () => {
    const verdict = approvalVerdict({ name: PANELS_SHOW_TOOL, arguments: { id: 'demo' } });

    expect(verdict?.kind).toBe('ask');
  });

  it('不是自己家的工具就不表态', () => {
    expect(approvalVerdict({ name: 'workbench_inventory_build', arguments: {} })).toBeUndefined();
  });

  it('长任务停机：没给落点、也没有落点可查时直接 allow（不拦）', () => {
    expect(stopVerdictFor({ name: 'workbench_long_tasks_stop', arguments: {} }, undefined)).toEqual({
      kind: 'allow',
    });
  });

  it('发布：只刷市集元数据（verify）不问', () => {
    expect(
      publishVerdictFor({ name: 'workbench_diy_publish', arguments: { verify: true } }, undefined),
    ).toEqual({ kind: 'allow' });
  });
});
