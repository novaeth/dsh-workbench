import { describe, expect, it } from 'vitest';
import { writeResultForClient } from '@dsh-workbench/shared/host';

describe('writeResultForClient', () => {
  it('★ 领域拒绝（`{ok:false, text}`，没有 `error`）→ 包成客户端认的形状，理由不丢', () => {
    expect(writeResultForClient({ ok: false, text: 'innettest 没有发布配置（configs 查不到）' }, 'action-refused')).toEqual({
      ok: false,
      error: { code: 'action-refused', message: 'innettest 没有发布配置（configs 查不到）' },
    });
  });

  it('带 detail 就一起带上（排障那一段）', () => {
    expect(writeResultForClient({ ok: false, text: '没计划出来', detail: '原始输出…' }, 'action-refused')).toEqual({
      ok: false,
      error: { code: 'action-refused', message: '没计划出来', detail: '原始输出…' },
    });
  });

  it('★ 已经是那个形状的（`{ok:false, error}`）→ 原样放行，不再包一层', () => {
    const value = { ok: false, error: { code: 'inventory/release-blocked', message: '生产环境要先审批' } };

    expect(writeResultForClient(value, 'action-refused')).toBe(value);
  });

  it('★ `ok:true` 的那一份一个字都不许动（`plan` / `facts` 那些格子还要用）', () => {
    const value = { ok: true, text: '计划好了', plan: { env: 'test' }, facts: ['inventory/runs'] };

    expect(writeResultForClient(value, 'action-refused')).toBe(value);
  });

  it('连话都没说（`{ok:false}`）→ 给一句兜底的，别让 message 是空的', () => {
    expect(writeResultForClient({ ok: false }, 'action-refused')).toEqual({
      ok: false,
      error: { code: 'action-refused', message: '这一步没有成功，也没说为什么' },
    });
  });

  it('不是对象（`undefined` / 字符串）→ 原样放行（这里不是它该管的事）', () => {
    expect(writeResultForClient(undefined, 'action-refused')).toBeUndefined();
    expect(writeResultForClient('文本', 'action-refused')).toBe('文本');
  });
});
