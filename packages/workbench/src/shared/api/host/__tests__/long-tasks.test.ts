import { describe, expect, it } from 'vitest';
import { createLongTaskRegistry, type LongTaskBase, type LongTaskRegistry } from '@dsh-workbench/shared/host';
import { LONG_TASKS_ROUTE } from '../../long-tasks';
import { liveLongTaskRows } from '../long-tasks';

const pending = (): Promise<never> => new Promise<never>(() => {});

function registry(seed: { readonly workspace: string; readonly target: string; readonly session?: string }): LongTaskRegistry<LongTaskBase> {
  const runs = createLongTaskRegistry<LongTaskBase>({
    run: pending,
    view: (snapshot) => ({ target: snapshot.target }),
  });
  runs.start(seed);
  return runs;
}

describe('liveLongTaskRows：左栏那颗 loading 点读的那份清单', () => {
  it('★★ 全进程挂着的那几把注册表一起收，每条带上是哪个单元起的', () => {
    const rows = liveLongTaskRows(
      new Map([
        ['inventory', registry({ workspace: '/w/a', target: 'env-prod', session: 's-1' })],
        ['board', registry({ workspace: '/w/b', target: 'board' })],
      ]),
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ unit: 'inventory', workspace: '/w/a', target: 'env-prod', session: 's-1', status: 'running' });
    expect(rows[1]).toMatchObject({ unit: 'board', workspace: '/w/b', target: 'board', status: 'running' });
    expect(rows[1]?.session).toBeUndefined();
  });

  it('★★ 上一版那份注册表（没有 `live()`）跳过它，别的单元照旧 —— 不抛、不整条读口一起瞎', () => {
    const stale = { current: () => [] } as unknown as LongTaskRegistry<LongTaskBase>;

    const rows = liveLongTaskRows(
      new Map<string, LongTaskRegistry<LongTaskBase>>([
        ['stale', stale],
        ['inventory', registry({ workspace: '/w/a', target: 'env-prod' })],
      ]),
    );

    expect(rows.map((row) => row.unit)).toEqual(['inventory']);
    expect(rows).toHaveLength(1);
  });

  it('★ 没有单元挂着长任务 ⇒ 空数组（左栏读到空就一个点都不画）', () => {
    expect(liveLongTaskRows(new Map())).toEqual([]);
  });

  it('★ 这条读口有自己的名字：外壳按它 bump 事实、浏览器按它取数', () => {
    expect(LONG_TASKS_ROUTE).toBe('long-tasks');
  });
});
