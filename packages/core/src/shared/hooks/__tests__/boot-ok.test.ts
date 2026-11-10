import { describe, expect, it } from 'vitest';
import { BOOT_OK_ROUTE } from '@/kernel/contract/boot-ok';
import { reportBootOk } from '../boot-ok';

describe('客户端这一次报"我起来了"', () => {
  it('★ 只报一次（重挂 / 重渲染不刷屏）', async () => {
    const sent: Array<{ route: string; body: Record<string, unknown> }> = [];
    const post = async (route: string, body: Record<string, unknown>) => {
      sent.push({ route, body });
      return { ok: true };
    };

    reportBootOk(post);
    reportBootOk(post);
    await Promise.resolve();

    expect(sent).toHaveLength(1);
    expect(sent[0]?.route).toBe(BOOT_OK_ROUTE);
  });
});
