import { describe, expect, it } from 'vitest';
import { positionOf, visibleSteps, visibleStepsOf } from '../model/flow/position';
import { flowFor } from '../model/flow/definitions';
import { PROGRESS_OUTPUT } from '../model/flow/progress-output';

describe('第几步与还剩几步', () => {
  it('★★ 两条路都是六步，顺序就是跑的顺序', () => {
    const ids = ['probe', 'plan', 'build', 'install', 'verify', 'ledger'];

    expect(visibleSteps('board').map((one) => one.id)).toEqual(ids);
    expect(visibleSteps('headless').map((one) => one.id)).toEqual(ids);
  });

  it('★ 停在站探是第 1 步，后面还有 5 步', () => {
    expect(positionOf('probe', 'board')).toEqual({ index: 1, total: 6, remaining: 5 });
    expect(positionOf('ledger', 'board')).toEqual({ index: 6, total: 6, remaining: 0 });
  });

  it('★ 没有流程时不说第几步，也不假装还剩几步', () => {
    expect(positionOf(null, 'board')).toEqual({ index: 0, total: 6, remaining: 0 });
  });

  it('★★ 录一次写是另一条流程：四步；没有缺口时补录那步不出现', () => {
    const flow = flowFor('write-record');

    expect(flow.id).toBe('diy-write-record');
    expect(visibleStepsOf(flow, 'write-record', { scan: { needsSupplement: false } }).map((one) => one.id)).toEqual([
      'record',
      'scan',
      'finish',
    ]);
    expect(visibleStepsOf(flow, 'write-record', { scan: { needsSupplement: true } }).map((one) => one.id)).toEqual([
      'record',
      'scan',
      'supplement',
      'finish',
    ]);
    expect(positionOf('supplement', 'write-record', { scan: { needsSupplement: true } })).toEqual({
      index: 3,
      total: 4,
      remaining: 1,
    });
  });

  it('★ 两把流程工具回话是同一份形状', () => {
    const properties = (PROGRESS_OUTPUT.schema as { properties: Record<string, unknown> }).properties;

    expect(Object.keys(properties)).toEqual([
      'text',
      'step',
      'index',
      'total',
      'remaining',
      'done',
      'restarted',
      'baseline',
    ]);
  });
});
