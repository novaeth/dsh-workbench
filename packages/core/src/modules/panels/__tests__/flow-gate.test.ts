import { describe, expect, it } from 'vitest';
import { createFlowHost } from '@dsh-workbench/shared/host';
import { DIY_BOARD_FLOW } from '../model/flow/definitions';
import { deniedAtStep } from '../model/flow/gate';
import { createDiyFlowRuns } from '../model/flow/runs';

describe('这一步拒什么', () => {
  it('★★ 判去向拒写文件，建模块不拒任何工具；bash 不禁（查东西要用）', () => {
    const judge = DIY_BOARD_FLOW.steps[0];
    const build = DIY_BOARD_FLOW.steps.find((step) => step.id === 'build');
    if (judge === undefined || build === undefined) throw new Error('定义缺步骤');

    const judgeDenied = deniedAtStep(judge);
    const buildDenied = deniedAtStep(build);

    expect([...judgeDenied]).toEqual(['write', 'edit']);
    expect(judgeDenied.has('workbench_diy_recon')).toBe(false);
    expect([...buildDenied]).toEqual([]);
  });
});

describe('按会话跑的流程', () => {
  const runsOf = () =>
    createDiyFlowRuns({
      host: createFlowHost(),
      flow: DIY_BOARD_FLOW,
      onEnd: () => {},
    });

  it('★★ 没开始时没有流程，开始时停在查看数据来源', () => {
    const runs = runsOf();

    expect(runs.stepOf('s-1')).toBeNull();
    expect(runs.start('s-1', { destination: 'board', summary: '盯库存' }).id).toBe('probe');
    expect(runs.stepOf('s-1')?.id).toBe('probe');
    expect(runs.stepOf('s-2')).toBeNull();
  });

  it('★★ 每递一次结果就前进一步，闸跟着换', async () => {
    const runs = runsOf();
    runs.start('s-1', { destination: 'board', summary: '盯库存' });

    expect(runs.stepOf('s-1')?.id).toBe('probe');
    runs.provide('s-1', { sites: [] });
    await Promise.resolve();
    expect(runs.stepOf('s-1')?.id).toBe('plan');
  });

  it('★ start / advance / stop 会通知订阅者；退订之后不再通知', async () => {
    const runs = runsOf();
    let changes = 0;
    const off = runs.subscribe(() => {
      changes += 1;
    });

    runs.start('s-1', { destination: 'board', summary: '盯库存' });
    expect(changes).toBe(1);

    await runs.advance('s-1', { sites: [] });
    expect(changes).toBeGreaterThanOrEqual(2);

    runs.stop('s-1');
    expect(changes).toBeGreaterThanOrEqual(3);

    off();
    runs.start('s-2', { destination: 'board', summary: '盯库存' });
    expect(changes).toBe(3);
  });

  it('★ 停掉之后不再有流程，重复开始会重新起一条', async () => {
    const runs = runsOf();
    runs.start('s-1', { destination: 'board', summary: '盯库存' });

    runs.stop('s-1');
    await Promise.resolve();

    expect(runs.stepOf('s-1')).toBeNull();
    expect(runs.start('s-1', { destination: 'board', summary: '盯库存' }).id).toBe('probe');
  });
});
