import { describe, expect, it, vi } from 'vitest';
import type { DataReader, RequestPlan } from '../../contract/data.js';
import { scopedDataReader } from '../unit-data.js';

function readerOf(overrides: Partial<DataReader> = {}): DataReader {
  return {
    read: async <T = unknown>() => ({ ok: true, data: 'read' as T }),
    request: async <T = unknown>() => ({ ok: true, data: 'request' as T }),
    requestMany: async () => ({ one: { ok: true, data: 1 } }) as never,
    plan: async () => ({ one: { ok: true, data: 2 } }),
    submitPlan: async () => ({ one: { ok: true, data: 3 } }),
    submit: async <T = unknown>() => ({ ok: true, data: 'submit' as T }),
    ...overrides,
  };
}

const plan: RequestPlan = {
  origin: 'https://a.example.com',
  steps: [{ name: 'one', request: { method: 'GET', path: '/x' } }],
};

describe('scopedDataReader', () => {
  it('没声明 origins 时原样放行（兼容旧模块）', () => {
    const data = readerOf();
    expect(scopedDataReader(data, undefined)).toBe(data);
  });

  it('声明了就只放行声明的 origin，plan 整支失败', async () => {
    const inner = readerOf();
    const scoped = scopedDataReader(inner, ['https://a.example.com']);
    const ok = await scoped.plan(plan);
    expect(ok['one']).toMatchObject({ ok: true, data: 2 });
    const denied = await scoped.plan({ ...plan, origin: 'https://b.example.com' });
    expect(denied['one']).toMatchObject({ ok: false, error: { code: 'invalid-request', pageCode: 'origin-not-declared' } });
  });

  it('request / submit / read 也检查 origin', async () => {
    const scoped = scopedDataReader(readerOf(), ['https://a.example.com']);
    const recipe = { origin: 'https://b.example.com', request: { method: 'GET' as const, path: '/x' } };
    expect(await scoped.request(recipe)).toMatchObject({ ok: false, error: { code: 'invalid-request' } });
    expect(await scoped.submit(recipe)).toMatchObject({ ok: false, error: { code: 'invalid-request' } });
    expect(await scoped.read({ kind: 'http', url: 'https://b.example.com/x' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-request' },
    });
    expect(await scoped.read({ kind: 'http', url: 'https://a.example.com/x' })).toMatchObject({ ok: true, data: 'read' });
  });

  it('origin 解析不了就拒，不是放行', async () => {
    const scoped = scopedDataReader(readerOf(), ['https://a.example.com']);
    const recipe = { origin: 'not a url', request: { method: 'GET' as const, path: '/x' } };
    expect(await scoped.request(recipe)).toMatchObject({ ok: false, error: { code: 'invalid-request' } });
    expect(await scoped.plan({ origin: 'not a url', steps: [{ name: 'one', request: { method: 'GET', path: '/x' } }] })).toMatchObject({
      one: { ok: false },
    });
  });

  it('写路径的拒绝文案说写，不说读', async () => {
    const scoped = scopedDataReader(readerOf(), ['https://a.example.com']);
    const recipe = { origin: 'https://b.example.com', request: { method: 'POST' as const, path: '/x' } };
    const denied = await scoped.submit(recipe);
    expect(denied.ok ? '' : denied.error.message).toContain('没声明写');
  });

  it('requestMany 也按 origin 拒，形状与真实读口一致', async () => {
    const scoped = scopedDataReader(readerOf(), ['https://a.example.com']);
    const recipe = { origin: 'https://b.example.com', request: { method: 'GET' as const, path: '/x' } };
    const out = await scoped.requestMany(recipe, { one: {}, two: {} });
    expect(Object.keys(out).sort()).toEqual(['one', 'two']);
    expect(out['one']).toMatchObject({ ok: false, error: { code: 'invalid-request' } });
  });

  it('browser 的 url 是空串时按「没有 url」处理，不校验', async () => {
    const scoped = scopedDataReader(readerOf(), ['https://a.example.com']);
    expect(await scoped.read({ kind: 'browser', script: '1', url: '' })).toMatchObject({ ok: true, data: 'read' });
    expect(await scoped.read({ kind: 'browser', script: '1' })).toMatchObject({ ok: true, data: 'read' });
  });

  it('计划形状不对时只回 invalid-request，不抛', async () => {
    const scoped = scopedDataReader(readerOf(), ['https://a.example.com']);
    const out = await scoped.plan({ steps: [] } as never);
    expect(Object.values(out)).toEqual([]);
    const spy = await scoped.plan(null as never);
    expect(spy).toEqual({});
  });

  it('空 origins = 一个都不放行', async () => {
    const scoped = scopedDataReader(readerOf(), []);
    expect(await scoped.plan(plan)).toMatchObject({ one: { ok: false } });
  });

  it('submitPlan 也受 origin 约束', async () => {
    const submitPlan = vi.fn(async () => ({ one: { ok: true as const, data: 'written' } }));
    const scoped = scopedDataReader(readerOf({ submitPlan }), ['https://a.example.com']);
    const denied = await scoped.submitPlan(
      { ...plan, origin: 'https://b.example.com', steps: [{ ...plan.steps[0]!, request: { method: 'POST', path: '/x' } }] },
      { idempotencyKey: 'k', confirm: () => true },
    );
    expect(denied['one']).toMatchObject({ ok: false, error: { code: 'invalid-request' } });
    expect(submitPlan).not.toHaveBeenCalled();
  });
});
