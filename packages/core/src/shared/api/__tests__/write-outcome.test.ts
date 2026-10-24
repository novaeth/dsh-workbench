import { describe, expect, it } from 'vitest';
import { writeOutcomeOf, writeRoute } from '../write-outcome';

describe('writeRoute', () => {
  it('三条通道各自拼得出路由（面板上的写只有这三条）', () => {
    expect(writeRoute('prefs', 'inventory')).toBe('prefs/inventory');
    expect(writeRoute('actions', 'inventory-release')).toBe('actions/inventory-release');
    expect(writeRoute('provision', '')).toBe('provision');
  });

  it('provision 忽略资源名（它只发 {action, unit}，没有资源段）', () => {
    expect(writeRoute('provision', 'issues')).toBe('provision');
  });
});

describe('writeOutcomeOf', () => {
  it('成了 → 值原样交出', () => {
    const outcome = writeOutcomeOf<{ text: string }>({ ok: true, text: '发出去了' }, '网络不通');

    expect(outcome).toEqual({ ok: true, value: { ok: true, text: '发出去了' } });
  });

  it('★ 请求没到（null）→ 用调用方给的那句网络文案', () => {
    expect(writeOutcomeOf(null, '网络不通')).toEqual({ ok: false, message: '网络不通' });
  });

  it('★ 宿主说失败 → 原样用宿主的话 + detail（不再包一层"操作失败"）', () => {
    const outcome = writeOutcomeOf(
      { ok: false, error: { code: 'inventory/release-blocked', message: '生产环境要先审批', detail: 'job 1234' } },
      '网络不通',
    );

    expect(outcome).toEqual({ ok: false, message: '生产环境要先审批', detail: 'job 1234' });
  });

  it('★ 登录态失效那条错误带着 helpUrl → 一路带出去（卡片才能给「去登录 ↗」而不是"还没绑定"）', () => {
    const outcome = writeOutcomeOf(
      {
        ok: false,
        error: {
          code: 'inventory/login-required',
          message: 'Inventory 登录态失效了',
          helpUrl: 'https://inventory.example.test/login',
        },
      },
      '网络不通',
    );

    expect(outcome).toEqual({
      ok: false,
      message: 'Inventory 登录态失效了',
      helpUrl: 'https://inventory.example.test/login',
    });
  });

  it('没有 detail 就不给那个字段（别塞一个 undefined 进类型里）', () => {
    const outcome = writeOutcomeOf({ ok: false, error: { code: 'x', message: '不行' } }, '网络不通');

    expect(outcome).toEqual({ ok: false, message: '不行' });
    expect(Object.keys(outcome)).not.toContain('detail');
  });

  it('★ 领域结果那一档（`{ok:false, text}`，没有 `error`）→ 用生产者自己那句话，**不抛异常**', () => {
    const outcome = writeOutcomeOf(
      { ok: false, text: 'innettest 没有发布配置（configs 查不到）' } as never,
      '网络不通',
    );

    expect(outcome).toEqual({ ok: false, message: 'innettest 没有发布配置（configs 查不到）' });
  });

  it('★ 连话都没说（`{ok:false}`）→ 用调用方的兜底文案，还是不抛', () => {
    expect(writeOutcomeOf({ ok: false } as never, '网络不通')).toEqual({ ok: false, message: '网络不通' });
  });
});
