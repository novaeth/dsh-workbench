import { describe, expect, it } from 'vitest';
import { evaluateUnit } from '../index.js';

const UNIT = {
  unit: 'inventory',
  plugins: [{ name: 'inventory', commands: ['envs'] }],
  libs: [{ name: 'opencli-workflow', version: '1.1.23', registryEnv: 'X', registryDefault: 'https://r.invalid/', purpose: '发布编排' }],
} as const;

const list = [{ name: 'inventory', commands: ['envs'] }];

describe('evaluateUnit：交叉依赖并进结论', () => {
  it('库缺了 → missing-plugin + 可一键装（命令来自库那份）', () => {
    const out = evaluateUnit(list, UNIT, undefined, 'opencli', new Map(), [
      { name: 'opencli-workflow', purpose: '发布编排', status: 'missing', command: 'npm i --prefix ... opencli-workflow@1.1.23' },
    ]);

    expect(out.status).toBe('missing-plugin');
    expect(out.fix).toBe('install');
    expect(out.install).toBe('ready');
    expect(out.command).toContain('opencli-workflow@1.1.23');
    expect(out.detail).toContain('opencli-workflow');
  });

  it('★ 库有新版（命令都齐）→ 结论仍是 **ok**（能不能用不受影响；升级归市场的共用依赖行）', () => {
    const out = evaluateUnit(list, UNIT, undefined, 'opencli', new Map(), [
      { name: 'opencli-workflow', purpose: '发布编排', status: 'outdated', installed: '1.1.22', latest: '1.1.23', command: 'npm i ... @1.1.23' },
    ]);

    expect(out.status).toBe('ok');
    expect(out.missing).toEqual([]);
    expect(out.libs?.[0]?.status).toBe('outdated');
    expect(out.fix).toBe('update');
  });

  it('★ 库在、但装的不是声明要的那一支 → **没装好**（与"没装"同一句话），排障区说清差在哪', () => {
    const out = evaluateUnit(list, UNIT, undefined, 'opencli', new Map(), [
      { name: 'opencli-workflow', purpose: '发布编排', status: 'unsatisfied', installed: '1.1.20', command: 'npm i ... opencli-workflow@1.1.23' },
    ]);

    expect(out.status).toBe('missing-plugin');
    expect(out.fix).toBe('install');
    expect(out.install).toBe('ready');
    expect(out.detail).toContain('1.1.20');
    expect(out.detail).toContain('1.1.23');
    expect(out.command).toContain('opencli-workflow@1.1.23');
  });

  it('库都在 → 不影响结论（ok）', () => {
    const out = evaluateUnit(list, UNIT, undefined, 'opencli', new Map(), [
      { name: 'opencli-workflow', purpose: '发布编排', status: 'ok', installed: '1.1.23' },
    ]);

    expect(out.status).toBe('ok');
    expect(out.libs).toHaveLength(1);
  });

  it('没声明库 → 结论里没有 `libs` 这个字段（界面按有无判读）', () => {
    const out = evaluateUnit(list, { unit: 'issues', plugins: [{ name: 'inventory', commands: ['envs'] }] }, undefined, 'opencli');

    expect(out.libs).toBeUndefined();
  });
});
