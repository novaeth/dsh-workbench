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
    expect(script).toContain('results[step.name] = { ok: true, value: got.value, elapsedMs: clock() - started };');
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
    expect(got['rows']).toMatchObject({ error: { code: 'skipped', pageCode: 'skipped' } });
  });

  it('origin 归一化：带尾斜杠可以，带 path / query 不行', () => {
    expect(planProblemOf(plan([{ name: 'a', request: { method: 'GET', path: '/a' } }], 'https://oa.example.com/'))).toEqual([]);
    const withPath = planProblemOf(plan([{ name: 'a', request: { method: 'GET', path: '/a' } }], 'https://oa.example.com/oa'));
    expect(withPath.some((one) => one.problem.includes('站点根'))).toBe(true);
    const notUrl = planProblemOf(plan([{ name: 'a', request: { method: 'GET', path: '/a' } }], 'oa.example.com'));
    expect(notUrl.some((one) => one.problem.includes('合法 URL'))).toBe(true);
  });

  it('步数有上限，authLoss 的形状也要校验', () => {
    const tooMany = plan(
      Array.from({ length: 33 }, (_, index) => ({
        name: `s${String(index)}`,
        request: { method: 'GET' as const, path: `/s${String(index)}` },
      })),
    );
    expect(planProblemOf(tooMany).some((one) => one.problem.includes('最多 32 步'))).toBe(true);
    const badAuth = plan([{ name: 'a', request: { method: 'GET', path: '/a' } }]);
    expect(planProblemOf({ ...badAuth, authLoss: { path: '' } }).some((one) => one.problem.includes('不能为空'))).toBe(true);
    expect(planProblemOf({ ...badAuth, authLoss: { path: 'code' } }).some((one) => one.problem.includes('至少给一个'))).toBe(true);
  });

  it('页面脚本带 deadline、每跳耗时与 authLoss', () => {
    const script = scriptOfPlan({ ...twoStep, authLoss: { path: 'errorCode', equals: '002', messagePath: 'msg' } });
    expect(script).toContain('const deadline = clock()');
    expect(script).toContain('AbortSignal.timeout');
    expect(script).toContain('authLostOf');
    expect(script).toContain('elapsedMs');
    expect(script).toContain('ref-missing');
    expect(script).toContain('path-missing');
  });

  it('auth 失败带 loginUrl；耗时留在结果上', () => {
    const got = planResultsOf(
      { steps: { key: { ok: false, code: 'not-logged-in', message: '登录超时', elapsedMs: 12 } } },
      ['key'],
      { loginUrl: 'https://oa.example.com/' },
    );
    expect(got['key']).toMatchObject({
      ok: false,
      elapsedMs: 12,
      error: { code: 'auth', pageCode: 'not-logged-in', helpUrl: 'https://oa.example.com/' },
    });
  });

  it('计划级失败（aborted / too-many-steps）铺到每一步', () => {
    expect(planResultsOf({ ok: false, code: 'aborted', message: '已停止' }, ['a', 'b'])).toMatchObject({
      a: { ok: false, error: { code: 'aborted' } },
      b: { ok: false, error: { code: 'aborted' } },
    });
  });
});

describe('阶段二 · 分页 / HTML', () => {
  const base = { name: 'rows', request: { method: 'GET' as const, path: '/api/rows' } };

  it('repeat / while 互斥，边界都校验', () => {
    const both = plan([{ ...base, repeat: { over: '1..3' }, while: { path: 'hasNext', equals: true } }]);
    expect(planProblemOf(both).some((one) => one.problem.includes('只能给一个'))).toBe(true);
    const badRepeat = plan([{ ...base, repeat: { over: '', as: '1bad', max: 0 } }]);
    const repeatProblems = planProblemOf(badRepeat).map((one) => one.problem);
    expect(repeatProblems.some((one) => one.includes('repeat.over 不能为空'))).toBe(true);
    expect(repeatProblems.some((one) => one.includes('repeat.as'))).toBe(true);
    expect(repeatProblems.some((one) => one.includes('repeat.max'))).toBe(true);
    const badWhile = plan([{ ...base, response: { kind: 'text' }, while: { path: '', equals: undefined, max: 51 } }]);
    const whileProblems = planProblemOf(badWhile).map((one) => one.problem);
    expect(whileProblems.some((one) => one.includes('while.path 不能为空'))).toBe(true);
    expect(whileProblems.some((one) => one.includes('while.equals 不能为空'))).toBe(true);
    expect(whileProblems.some((one) => one.includes('while.max'))).toBe(true);
    expect(whileProblems.some((one) => one.includes('while 只支持 json'))).toBe(true);
  });

  it('steps 里有 null 元素时只回问题，不抛', () => {
    const broken = { origin: 'https://oa.example.com', steps: [null] } as never;
    expect(planProblemOf(broken)).toEqual([{ path: 'steps[0]', problem: '每一步要是一个对象' }]);
  });

  it('repeat.over 不能引用本步的 as', () => {
    const self = plan([{ ...base, repeat: { over: '{{item}}' } }]);
    expect(planProblemOf(self).some((one) => one.problem.includes('循环还没开始'))).toBe(true);
  });

  it('loginUrl 要是完整 URL；repeat.as 不能用内置变量名', () => {
    const badUrl = plan([base]);
    expect(
      planProblemOf({ ...badUrl, loginUrl: 'oa.example.com/login' }).some((one) => one.path === 'loginUrl'),
    ).toBe(true);
    expect(planProblemOf({ ...badUrl, loginUrl: 'HTTPS://oa.example.com/login' })).toEqual([]);
    expect(planProblemOf({ ...badUrl, loginUrl: 'https://' }).some((one) => one.path === 'loginUrl')).toBe(true);
    const reserved = plan([{ ...base, name: 'page' }]);
    expect(planProblemOf(reserved).some((one) => one.problem.includes('内置的序号变量'))).toBe(true);
    const collisions = plan([{ ...base, repeat: { over: '1..2', as: 'page' } }]);
    expect(planProblemOf(collisions).some((one) => one.problem.includes('内置的序号变量'))).toBe(true);
  });

  it('形状不对的计划不抛错，只回问题', () => {
    expect(planProblemOf({ origin: 'https://oa.example.com' } as never)).toEqual([
      { path: 'steps', problem: 'steps 要是数组' },
    ]);
    const broken = { origin: 'https://oa.example.com', steps: [{ name: 'a' }] } as never;
    expect(planProblemOf(broken).some((one) => one.path === 'steps[0].request')).toBe(true);
  });

  it('步内绝对 URL 会被拒（否则绕过 origin 收口）', () => {
    const absolute = plan([
      { name: 'a', request: { method: 'GET', path: 'https://other.example.com/x' } },
    ]);
    expect(planProblemOf(absolute).some((one) => one.problem.includes('站内路径'))).toBe(true);
  });

  it('saveAs 与分页互斥', () => {
    const both = plan([
      {
        name: 'a',
        request: { method: 'GET', path: '/x' },
        response: { kind: 'bytes', saveAs: 'attachment' },
        repeat: { over: '1..2' },
      },
    ]);
    expect(planProblemOf(both).some((one) => one.problem.includes('只能给一个'))).toBe(true);
  });

  it('repeat 的 over 可以引用前面的步骤', () => {
    const withTotal = plan([
      { name: 'total', request: { method: 'GET', path: '/api/total' } },
      { ...base, repeat: { over: '1..{{total}}' } },
    ]);
    expect(planProblemOf(withTotal).some((one) => one.problem.includes('还没出现'))).toBe(false);
    const backward = plan([{ ...base, repeat: { over: '1..{{total}}' } }]);
    expect(planProblemOf(backward).some((one) => one.problem.includes('还没出现'))).toBe(true);
  });

  it('HTML 只要 selector；fields 的键是列名', () => {
    const ok = plan([
      { ...base, response: { kind: 'html', selector: 'table tr', fields: { title: 'td:nth-child(2)' } } },
    ]);
    expect(planProblemOf(ok)).toEqual([]);
    const bad = plan([
      { ...base, response: { kind: 'html', selector: '', path: 'rows', maxBytes: 10, fields: { title: '' } } },
    ]);
    const problems = planProblemOf(bad).map((one) => one.problem);
    expect(problems.some((one) => one.includes('selector'))).toBe(true);
    expect(problems.some((one) => one.includes('不要再写 path'))).toBe(true);
    expect(problems.some((one) => one.includes('不支持 maxBytes'))).toBe(true);
    const stray = plan([{ ...base, response: { kind: 'json', selector: 'table tr' } }]);
    expect(planProblemOf(stray).some((one) => one.problem.includes('只用于 html'))).toBe(true);
    const badSave = plan([{ ...base, response: { kind: 'json', saveAs: 'attachment' } }]);
    expect(planProblemOf(badSave).some((one) => one.problem.includes('只用于 bytes'))).toBe(true);
  });

  it('生成的脚本能解析，并带循环 / HTML 分支', () => {
    const looping = plan([
      { name: 'total', request: { method: 'GET', path: '/api/total' } },
      { ...base, repeat: { over: '1..{{total}}' } },
      { name: 'next', request: { method: 'GET', path: '/api/page', query: { page: '{{page}}' } }, while: { path: 'hasNext', equals: false } },
      { name: 'dom', request: { method: 'GET', path: '/api/dom' }, response: { kind: 'html', selector: 'table tr' } },
    ]);
    const script = scriptOfPlan(looping);
    expect(() => new Function(script)).not.toThrow();
    expect(script).toContain('itemsOf');
    expect(script).toContain('step.while');
    expect(script).toContain('querySelectorAll');
  });
});
