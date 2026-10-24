import { describe, expect, it } from 'vitest';
import { helpUrlOf, parseCliErrorEnvelope } from '@dsh-workbench/shared/host';

const AUTH_STDERR = `ok: false
error:
  code: AUTH_REQUIRED
  message: 未登录 Acme，请先在浏览器中完成登录
  help: Please open Chrome or Chromium and log in to https://example-team.demo.net/login
  exitCode: 4
`;

describe('parseCliErrorEnvelope', () => {
  it('解析出 code / message / help / exitCode', () => {
    const envelope = parseCliErrorEnvelope(AUTH_STDERR);

    expect(envelope?.code).toBe('AUTH_REQUIRED');
    expect(envelope?.message).toBe('未登录 Acme，请先在浏览器中完成登录');
    expect(envelope?.help).toContain('log in to https://example-team.demo.net/login');
    expect(envelope?.exitCode).toBe(4);
  });

  it('登录页地址从 help 里取（结构化字段，不是扫原始报错）', () => {
    const envelope = parseCliErrorEnvelope(AUTH_STDERR);

    expect(envelope === undefined ? undefined : helpUrlOf(envelope)).toBe('https://example-team.demo.net/login');
  });

  it('help 折行也能拼回来', () => {
    const folded = `ok: false
error:
  code: AUTH_REQUIRED
  message: 未登录
  help: Please open Chrome or Chromium and log in to
    https://example-team.demo.net/login
  exitCode: 4
`;

    const envelope = parseCliErrorEnvelope(folded);

    expect(helpUrlOf(envelope!)).toBe('https://example-team.demo.net/login');
  });

  it('没有信封 → undefined（回落，而不是猜）', () => {
    expect(parseCliErrorEnvelope('Error: something exploded')).toBeUndefined();
    expect(parseCliErrorEnvelope('')).toBeUndefined();
    expect(parseCliErrorEnvelope(undefined)).toBeUndefined();
  });

  it('信封里没有 code → 也算没信封（宁可说"读不懂"，不谎报具体原因）', () => {
    expect(parseCliErrorEnvelope('ok: false\nerror:\n  message: 出错了\n')).toBeUndefined();
  });

  it('不是登录类的信封也照样解析（通用失败要用 code 与 help）', () => {
    const envelope = parseCliErrorEnvelope(`ok: false
error:
  code: BROWSER_CONNECT
  message: could not connect to browser
  help: start Chrome first
  exitCode: 3
`);

    expect(envelope?.code).toBe('BROWSER_CONNECT');
    expect(helpUrlOf(envelope!)).toBeUndefined();
  });

  it('★ 折叠块（`>-`）不是正文的一部分：拼回来的是话本身', () => {
    const folded = `ok: false
error:
  code: COMMAND_EXEC
  message: >-
    站点回的是 HTML 页而不是 JSON（HTTP 403）：<!DOCTYPE html><html lang="zh-CN"><head><meta http-equiv="Content-Type"
    content="text/html; charset=utf-8"><meta content
  help: 刚才已重新打开过一次这个站点并重试；再试一次通常就好。
  exitCode: 1
`;

    const envelope = parseCliErrorEnvelope(folded);

    expect(envelope?.code).toBe('COMMAND_EXEC');
    expect(envelope?.message).toBe(
      '站点回的是 HTML 页而不是 JSON（HTTP 403）：<!DOCTYPE html><html lang="zh-CN"><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><meta content',
    );
    expect(envelope?.message).not.toContain('>-');
    expect(envelope?.help).toBe('刚才已重新打开过一次这个站点并重试；再试一次通常就好。');
  });

  it('字面块（`|`）保留换行，块后面那一行照常认识', () => {
    const literal = `ok: false
error:
  code: COMMAND_EXEC
  message: |
    第一行
    第二行
  exitCode: 1
`;

    const envelope = parseCliErrorEnvelope(literal);

    expect(envelope?.message).toBe('第一行\n第二行');
    expect(envelope?.exitCode).toBe(1);
  });

  it('取址不受引号影响（yaml 有时会加引号）', () => {
    const envelope = parseCliErrorEnvelope(`ok: false
error:
  code: AUTH_REQUIRED
  message: "未登录：请先登录"
  help: "log in to https://example.com/login"
`);

    expect(envelope?.message).toBe('未登录：请先登录');
    expect(helpUrlOf(envelope!)).toBe('https://example.com/login');
  });
});

describe('helpUrlOf', () => {
  it('help 里有地址就抽出来（登录、权限都走这一条）', () => {
    expect(
      helpUrlOf({ code: 'AUTH_REQUIRED', message: '未登录', help: 'Please log in to https://dsh.demo.net/login first' }),
    ).toBe(
      'https://dsh.demo.net/login',
    );
    expect(
      helpUrlOf({ code: 'FORBIDDEN', message: '没有权限', help: 'Ask the owner, or open https://dsh.demo.net/permissions' }),
    ).toBe(
      'https://dsh.demo.net/permissions',
    );
  });

  it('★ help 里没有地址 → undefined（界面就不给链接，只给重试）', () => {
    expect(helpUrlOf({ code: 'FORBIDDEN', message: '没有权限', help: '没有这个项目的权限，找项目管理员申请。' })).toBeUndefined();
    expect(helpUrlOf({ code: 'FORBIDDEN', message: '没有权限' })).toBeUndefined();
  });
});
