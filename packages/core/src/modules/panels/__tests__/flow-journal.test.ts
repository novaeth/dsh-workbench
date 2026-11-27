import { describe, expect, it } from 'vitest';
import { createFlowHost, type DiyFlowJournal, type DiyFlowSnapshot } from '@dsh-workbench/shared/host';
import { DIY_BOARD_FLOW } from '../model/flow/definitions';
import { createDiyFlowRuns } from '../model/flow/runs';

function journalOf(): { journal: DiyFlowJournal; snapshots: DiyFlowSnapshot[] } {
  const snapshots: DiyFlowSnapshot[] = [];
  return {
    snapshots,
    journal: {
      read: () => snapshots.at(-1) ?? null,
      write: (_session, snapshot) => {
        snapshots.push(snapshot);
      },
    },
  };
}

const runsOf = (journal: DiyFlowJournal) => {
  const ended: string[] = [];
  const runs = createDiyFlowRuns({
    host: createFlowHost(),
    flow: DIY_BOARD_FLOW,
    onEnd: (session) => ended.push(session),
    journal,
  });
  return { runs, ended };
};

const plan = {
  see: ['一眼'],
  do: ['一点'],
  agent: ['一件'],
  data: ['一处'],
};

describe('流程状态 journal', () => {
  it('★ 开始与推进都写快照；新实例从快照回到同一步与同组值', async () => {
    const { journal, snapshots } = journalOf();
    const first = runsOf(journal);

    const step = first.runs.start('s-1', { destination: 'tweak', summary: '改阈值' });
    expect(step.id).toBe('plan');
    expect(snapshots.at(-1)).toMatchObject({ flow: 'diy-tweak', step: 'plan', status: 'running' });

    await first.runs.advance('s-1', plan);
    expect(snapshots.at(-1)).toMatchObject({ step: 'build', status: 'running' });

    const next = runsOf(journal);
    expect(next.runs.stepOf('s-1')?.id).toBe('build');
    expect(next.runs.valuesOf('s-1')).toMatchObject({ plan });
    expect(next.runs.start('s-1', { destination: 'tweak', summary: '改阈值' }).id).toBe('build');
    expect(snapshots).toHaveLength(2);
  });

  it('★ 第一次水合发一次通知；监听者再读不重复', async () => {
    const { journal } = journalOf();
    const first = runsOf(journal);
    first.runs.start('s-1', { destination: 'tweak', summary: '改阈值' });
    await first.runs.advance('s-1', plan);

    const next = runsOf(journal);
    let changes = 0;
    next.runs.subscribe(() => {
      changes += 1;
    });
    expect(next.runs.stepOf('s-1')?.id).toBe('build');
    expect(next.runs.stepOf('s-1')?.id).toBe('build');
    expect(changes).toBe(1);
  });

  it('★ 停止写 stopped，后续实例不再恢复', () => {
    const { journal, snapshots } = journalOf();
    const first = runsOf(journal);
    first.runs.start('s-1', { destination: 'tweak', summary: '改阈值' });
    first.runs.stop('s-1');

    expect(snapshots.at(-1)).toMatchObject({ status: 'stopped', step: null });
    const next = runsOf(journal);
    expect(next.runs.stepOf('s-1')).toBeNull();
  });

  it('★ done 与损坏快照都不会被当成运行中流程', () => {
    const { journal } = journalOf();
    const first = runsOf(journal);
    first.runs.start('s-1', { destination: 'tweak', summary: '改阈值' });

    const done = runsOf({
      read: () => ({
        version: 1,
        flow: 'diy-tweak',
        input: { destination: 'tweak' },
        step: null,
        values: {},
        status: 'done',
      }),
      write: () => {},
    });
    expect(done.runs.stepOf('s-1')).toBeNull();

    const broken = runsOf({ read: () => ({ version: 9 }) as unknown as DiyFlowSnapshot, write: () => {} });
    expect(broken.runs.stepOf('s-1')).toBeNull();
  });
});
