import { describe, expect, it } from 'vitest';
import { createFlowHost } from '@dsh-workbench/shared/host';
import { DIY_BOARD_FLOW } from '../model/flow/definitions';
import { planStep } from '../model/flow/plan-step';
import { createDiyFlowRuns } from '../model/flow/runs';

const runsOf = () => {
  const ended: string[] = [];
  const runs = createDiyFlowRuns({
    host: createFlowHost(),
    flow: DIY_BOARD_FLOW,
    onEnd: (session) => ended.push(session),
  });
  return { runs, ended };
};

describe('计划工具推进流程', () => {
  it('★★ 判成看板：流程开在查看数据来源，方案先不收', async () => {
    const { runs } = runsOf();

    const result = await planStep(runs, 's-1', {
      destination: 'board',
      summary: '每天看一次报销审批卡在哪',
      see: ['一眼'],
      do: ['一点'],
      agent: ['一件'],
      data: ['一处'],
    });

    expect(result.ok).toBe(true);
    expect(result.step).toBe('probe');
    expect(result.index).toBe(1);
    expect(result.total).toBe(6);
    expect(runs.stepOf('s-1')?.id).toBe('probe');
  });

  it('★★ 去向锁定：从看板改成交付工具会被拒，流程不动', async () => {
    const { runs } = runsOf();
    await planStep(runs, 's-1', { destination: 'board', summary: '盯库存' });

    const result = await planStep(runs, 's-1', { destination: 'tweak', summary: '盯库存' });

    expect(result.ok).toBe(false);
    expect(result.text).toContain('去向已锁定');
    expect(result.text).toContain('cancel: true');
    expect(runs.stepOf('s-1')?.id).toBe('probe');
    expect(runs.inputOf('s-1')['destination']).toBe('board');
  });

  it('★ 先判去向停在站探；站探递完再调，才递方案', async () => {
    const { runs } = runsOf();
    const first = await planStep(runs, 's-1', {
      destination: 'board',
      summary: '盯库存低于 10 的',
      see: ['一眼'],
      do: ['一点'],
      agent: ['一件'],
      data: ['一处'],
    });

    expect(first.step).toBe('probe');
    expect(first.index).toBe(1);
    expect(first.text).toContain('workbench_diy_step');

    runs.provide('s-1', { sites: ['库存表'] });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const second = await planStep(runs, 's-1', {
      destination: 'board',
      summary: '盯库存低于 10 的',
      see: ['一眼'],
      do: ['一点'],
      agent: ['一件'],
      data: ['一处'],
    });

    expect(second.step).toBe('build');
    expect(runs.stepOf('s-1')?.id).toBe('build');
  });

  it('★ 已经在后面几步了，再调计划工具就说清该用哪把工具', async () => {
    const { runs } = runsOf();
    await planStep(runs, 's-1', { destination: 'board', summary: '盯库存', see: ['一眼'], do: ['一点'], agent: ['一件'], data: ['一处'] });
    runs.provide('s-1', { sites: [] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await planStep(runs, 's-1', { destination: 'board', summary: '盯库存', see: ['一眼'], do: ['一点'], agent: ['一件'], data: ['一处'] });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const again = await planStep(runs, 's-1', { destination: 'board', summary: '盯库存', see: ['一眼'], do: ['一点'], agent: ['一件'], data: ['一处'] });

    expect(again.ok).toBe(false);
    expect(again.text).toContain('workbench_diy_step');
    expect(runs.stepOf('s-1')?.id).toBe('build');
  });

  it('★★ 判成改已有模块：走那条四步流程，先补方案再动手', async () => {
    const { runs } = runsOf();
    const first = await planStep(runs, 's-1', { destination: 'tweak', summary: '库存阈值改成 20' });

    expect(first.step).toBe('plan');
    expect(first.index).toBe(1);
    expect(first.total).toBe(5);

    const second = await planStep(runs, 's-1', {
      destination: 'tweak',
      summary: '库存阈值改成 20',
      see: ['阈值变成 20'],
      do: ['改完立刻看到新阈值'],
      agent: ['不改数据源'],
      data: ['还用原来那张库存表'],
    });

    expect(second.step).toBe('build');
    expect(runs.stepOf('s-1')?.id).toBe('build');
  });

  it('★★ 改已有模块：第一次把方案交齐，一步到创建模块', async () => {
    const { runs } = runsOf();
    const first = await planStep(runs, 's-1', {
      destination: 'tweak',
      summary: '库存阈值改成 20',
      see: ['修改：阈值改成 20'],
      do: ['没变'],
      agent: ['没变'],
      data: ['没变'],
    });

    expect(first.step).toBe('build');
    expect(runs.stepOf('s-1')?.id).toBe('build');
  });

  it('★ 需求变化先拒绝；显式重启才清空进度从头来', async () => {
    const { runs } = runsOf();
    await planStep(runs, 's-1', { destination: 'board', summary: '第一版' });

    const refused = await planStep(runs, 's-1', { destination: 'board', summary: '改成另一件事' });
    expect(refused.ok).toBe(false);
    expect(refused.text).toContain('restart: true');
    expect(runs.stepOf('s-1')?.id).toBe('probe');

    const again = await planStep(runs, 's-1', {
      destination: 'board',
      summary: '改成另一件事',
      restart: true,
    });

    expect(again.step).toBe('probe');
    expect(again.restarted).toBe(true);
    expect(again.text).toContain('从头来');
    expect(runs.stepOf('s-1')?.id).toBe('probe');
    expect(runs.inputOf('s-1')['summary']).toBe('改成另一件事');
  });
});
