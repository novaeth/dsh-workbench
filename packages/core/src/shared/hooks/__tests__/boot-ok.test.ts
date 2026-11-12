import { describe, expect, it } from 'vitest';
import { BOOT_OK_ROUTE } from '@/kernel/contract/boot-ok';
import { reportBootOk } from '../boot-ok';

describe('reportBootOk', () => {
  it('★ 打的是动作通道那条路（资源的注册前缀就是 actions/）', () => {
    const sent: Array<{ route: string; body: Record<string, unknown> }> = [];
    reportBootOk((route, body) => {
      sent.push({ route, body });
      return Promise.resolve({ ok: true });
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.route).toBe(BOOT_OK_ROUTE);
    expect(BOOT_OK_ROUTE).toBe('actions/workbenchBootOk');
  });
});
