import { describe, expect, it } from 'vitest';
import type { BundleChange } from '@/kernel/contract/bundle-install';
import { verdictOf } from '../model/diy-context';

function change(over: Partial<BundleChange>): BundleChange {
  return { application: 'failed', stage: 'install', changed: false, target: '@a/b', ...over };
}

describe('DIY 交代里那句装机结论', () => {
  it('★ 结构化失败带 errorDetail：结论里带上原文（以前只剩一个码，原因没了）', () => {
    const said = verdictOf(change({ errorCode: 'operation-error', errorDetail: '没有写入权限（退出码 1）：\nERR_PNPM' }));

    expect(said).toContain('没装上');
    expect(said).toContain('没有写入权限');
    expect(said).toContain('ERR_PNPM');
  });

  it('packageResult 有输出时照旧优先用它（既有那条路一个字节不变）', () => {
    const said = verdictOf(
      change({
        errorCode: 'operation-error',
        errorDetail: '别的说法',
        packageResult: { exitCode: 1, output: '来自 packageResult', truncated: false, logPath: '' },
      }),
    );

    expect(said).toContain('来自 packageResult');
    expect(said).not.toContain('别的说法');
  });

  it('装好了照旧说装好了', () => {
    expect(verdictOf(change({ application: 'applied', changed: true }))).toBe('装好了，已生效');
  });
});
