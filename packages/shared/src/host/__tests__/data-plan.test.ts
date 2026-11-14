import { describe, expect, it } from 'vitest';
import { planProblemOf, planResultsOf, scriptOfPlan } from '../data-plan';
import type { RequestPlan } from '../../contract/data.js';

const plan = (steps: RequestPlan['steps'], origin = 'https://oa.example.com'): RequestPlan => ({
  origin,
  steps,
});

const twoStep = plan([
  {
    name: 'key',
    request: { method: 'POST', path: '/api/split', contentType: 'form', body: { a: '1' } },
    response: { kind: 'json', path: 'sessionkey' },
  },
  {
    name: 'rows',
    request: { method: 'POST', path: '/api/rows', contentType: 'form', body: { dataKey: '{{key}}', page: '1' } },
    response: { kind: 'json', path: 'datas' },
  },
]);

describe('请求计划', () => {
  it('合格的计划没有问题', () => {
    expect(planProblemOf(twoStep)).toEqual([]);
  });

  it('引用前面的步骤可以，引用后面的不行', () => {
    const good = scriptOfPlan(twoStep);
    expect(good).toContain('{{key}}');
    const backward = plan([
      { name: 'a', request: { method: 'GET', path: '/a', body: { x: '{{b}}' } } },
      { name: 'b', request: { method: 'GET', path: '/b' } },
    ]);
    expect(planProblemOf(backward).some((one) => one.problem.includes('还没出现'))).toBe(true);
  });

  it('步骤名重复、空 path、怪 kind 都会报', () => {
    const bad = plan([
      { name: 'a', request: { method: 'GET', path: '' } },
      { name: 'a', request: { method: 'GET', path: '/x' }, response: { kind: 'blob' as never } },
    ]);
    const problems = planProblemOf(bad).map((one) => one.problem);
    expect(problems.some((one) => one.includes('path 不能为空'))).toBe(true);
    expect(problems.some((one) => one.includes('重复'))).toBe(true);
    expect(problems.some((one) => one.includes('kind'))).toBe(true);
  });

  it('生成的脚本一次跑完所有步骤，带来源校验与 cookie', () => {
    const script = scriptOfPlan(twoStep);
    expect(script.startsWith('(async () => {')).toBe(true);
    expect(script).toContain('not-on-site');
    expect(script).toContain('credentials: "include"');
    expect(script.indexOf('"key"')).toBeLessThan(script.indexOf('"rows"'));
    expect(script).toContain('results[step.name] = { ok: true, value: value }');
  });

  it('form 的 body 里塞对象是构建期错误', () => {
    const bad = plan([
      { name: 'a', request: { method: 'POST', path: '/a', contentType: 'form', body: { nested: { x: 1 } } } },
    ]);
    expect(planProblemOf(bad).some((one) => one.problem.includes('字符串或数字'))).toBe(true);
  });

  it('二进制那一步交 base64 而不是字符串乱码', () => {
    const script = scriptOfPlan(
      plan([{ name: 'file', request: { method: 'GET', path: '/f' }, response: { kind: 'bytes', maxBytes: 10 } }]),
    );
    expect(script).toContain('btoa');
    expect(script).toContain('too-large');
  });

  it('失败的那一步之后不再跑', () => {
    const script = scriptOfPlan(twoStep);
    expect(script).toContain('break;');
  });

  it('结果摊回每个步骤名下，页面码翻成正式码', () => {
    const got = planResultsOf({
      steps: { key: { ok: true, value: 'abc' }, rows: { ok: false, code: 'not-logged-in', message: 'HTTP 401' } },
    });
    expect(got['key']).toEqual({ ok: true, data: 'abc' });
    expect(got['rows']).toMatchObject({ error: { code: 'auth', pageCode: 'not-logged-in' } });
  });

  it('失败之后没跑的步骤要显式标出来，不能悄悄少一格', () => {
    const got = planResultsOf({ steps: { key: { ok: false, code: 'shape', message: '不是 JSON' } } }, ['key', 'rows']);
    expect(got['rows']?.ok).toBe(false);
    expect(got['rows']).toMatchObject({ error: { code: 'command', pageCode: 'skipped' } });
  });
});
