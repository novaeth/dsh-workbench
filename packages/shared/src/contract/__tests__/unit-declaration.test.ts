import { describe, expect, it } from 'vitest';
import { unitTitleKey } from '../unit.js';
import { declarationProblemsOf, readDeclaration } from '../unit-declaration.js';

const declared = (tools: unknown) => ({
  apiVersion: 3,
  unit: 'demo',
  title: { zh: '演示', en: 'Demo' },
  card: null,
  tools,
  host: { inject: [] },
});

describe('清单里的工具声明', () => {
  it('key 是可选的：不给就只是没有生成物可对', () => {
    expect(declarationProblemsOf('@t/demo', declared([{ name: 'workbench_demo_sync', writes: true }]))).toEqual([]);
  });

  it('给了 key 就得是能当代码键名的 lowerCamelCase', () => {
    expect(
      declarationProblemsOf('@t/demo', declared([{ name: 'workbench_demo_sync', writes: true, key: 'sync' }])),
    ).toEqual([]);
    expect(
      declarationProblemsOf('@t/demo', declared([{ name: 'workbench_demo_sync', writes: true, key: 'podLogs' }])),
    ).toEqual([]);

    for (const bad of ['Sync', 'pod-logs', 'pod_logs', '1sync', '', 'pod logs', '__proto__']) {
      const problems = declarationProblemsOf(
        '@t/demo',
        declared([{ name: 'workbench_demo_sync', writes: true, key: bad }]),
      );
      expect(problems.join('\n'), `key=${JSON.stringify(bad)} 该红`).toMatch(/\.key 要是 lowerCamelCase/);
    }
  });

  it('★ key 撞了当场红（生成物里的键只能有一个，不然生成出来是静默覆盖）', () => {
    const problems = declarationProblemsOf(
      '@t/demo',
      declared([
        { name: 'workbench_demo_sync', writes: true, key: 'sync' },
        { name: 'workbench_demo_apply', writes: true, key: 'sync' },
      ]),
    );

    expect(problems.join('\n')).toMatch(/key「sync」与前面那条撞了/);
  });

  it('key 不进外壳那份清单（外壳不读它，它是给代码用的）', () => {
    const read = readDeclaration('@t/demo', declared([{ name: 'workbench_demo_sync', writes: true, key: 'sync' }]));

    expect(read.problems).toEqual([]);
    expect(read.manifest?.tools).toEqual([{ name: 'workbench_demo_sync', writes: true }]);
  });
});

describe('清单里的名字（v3 起名字在顶层，是字面量）', () => {
  it('中英各一份，都有就过', () => {
    expect(declarationProblemsOf('@t/demo', declared([]))).toEqual([]);
  });

  it('少一门 / 空串 → 红，点名那一门', () => {
    expect(declarationProblemsOf('@t/demo', { ...declared([]), title: { zh: '演示' } }).join('\n')).toMatch(
      /title\.en/,
    );
    expect(
      declarationProblemsOf('@t/demo', { ...declared([]), title: { zh: '演示', en: '  ' } }).join('\n'),
    ).toMatch(/title\.en 要是非空字符串/);
  });

  it('★ v2 的老写法（card.titleKey）被点名，并给出迁移提示', () => {
    const v2 = { ...declared([]), apiVersion: 2, card: { titleKey: 'demo.cardTitle', order: 7 } };
    expect(declarationProblemsOf('@t/demo', v2).join('\n')).toMatch(/v3 把卡片标题挪成了顶层/);
    const keyOnly = { ...declared([]), card: { titleKey: 'demo.cardTitle', order: 7 } };
    expect(declarationProblemsOf('@t/demo', keyOnly).join('\n')).toMatch(/不认的键/);
  });

  it('★ 清单里的名字键由外壳合成：模块不用写、也别想写', () => {
    const read = readDeclaration('@t/demo', { ...declared([]), card: { order: 7 } });

    expect(read.problems).toEqual([]);
    expect(read.manifest?.title).toEqual({ zh: '演示', en: 'Demo' });
    expect(read.manifest?.titleKey).toBe(unitTitleKey('demo'));
    expect(read.manifest?.card).toEqual({ order: 7 });
  });
});
