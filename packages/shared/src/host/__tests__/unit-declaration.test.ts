import { describe, expect, it } from 'vitest';
import { declarationProblemsOf, readDeclaration } from '../unit-declaration.js';

const declared = (tools: unknown) => ({
  apiVersion: 1,
  unit: 'demo',
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
