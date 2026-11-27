import { describe, expect, it } from 'vitest';
import { newCorrId } from '../client-diag';

describe('客户端失败的关联号', () => {
  it('★ 8 位十六进制，两次不同', () => {
    const first = newCorrId();
    const second = newCorrId();

    expect(first).toMatch(/^[0-9a-f]{8}$/);
    expect(second).toMatch(/^[0-9a-f]{8}$/);
    expect(first).not.toBe(second);
  });
});
