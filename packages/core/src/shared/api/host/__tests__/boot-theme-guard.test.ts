import { describe, expect, it } from 'vitest';
import type { DshHostContext, DshIndexRow } from '@dsh-workbench/shared';
import { registerBootThemeGuard } from '../boot-theme-guard';

type Listener = (table: DshIndexRow[]) => void;

function hostWithCapture(): { ctx: DshHostContext; rows: () => DshIndexRow[] } {
  const listeners: Listener[] = [];
  const ctx = {
    on: (_event: string, listener: Listener) => {
      listeners.push(listener);
      return () => undefined;
    },
  } as unknown as DshHostContext;
  return {
    ctx,
    rows: () => {
      const table: DshIndexRow[] = [];
      for (const listener of listeners) listener(table);
      return table;
    },
  };
}

describe('启动主题兜底', () => {
  it('★ 往 boot HTML 里追一段 body 脚本', () => {
    const { ctx, rows } = hostWithCapture();

    registerBootThemeGuard(ctx);

    const pushed = rows();
    expect(pushed).toHaveLength(1);
    expect(pushed[0]).toMatchObject({ kind: 'script', placement: 'body' });
  });

  it('★ 脚本按服务端写好的偏好把 body 的深色属性按回去', () => {
    const { ctx, rows } = hostWithCapture();

    registerBootThemeGuard(ctx);

    const row = rows()[0];
    const text = row !== undefined && row.kind === 'script' ? row.text : '';
    expect(text).toContain('data-ds-theme-source');
    expect(text).toContain('data-ds-dark-theme');
    expect(text).toContain("read() === 'system'");
  });
});
