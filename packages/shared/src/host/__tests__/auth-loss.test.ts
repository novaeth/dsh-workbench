import { describe, expect, it } from 'vitest';
import { authLossOf } from '../auth-loss.js';

describe('authLossOf', () => {
  it('只认 401（403 归没权限），并带登录地址', () => {
    expect(authLossOf({ status: 401, message: '会话过期', loginUrl: 'https://oa.example.com/login' })).toEqual({
      message: '会话过期',
      loginUrl: 'https://oa.example.com/login',
    });
    expect(authLossOf({ statusCode: '403' })).toBeUndefined();
  });

  it('认 status:false + 登录/超时文案', () => {
    expect(authLossOf({ status: false, errorCode: '002', msg: '登录信息超时' })).toEqual({
      message: '登录信息超时',
    });
  });

  it('status:false 但只是业务错：不算登录', () => {
    expect(authLossOf({ status: false, msg: '余额不足' })).toBeUndefined();
  });

  it('跳 /login 带登录地址', () => {
    expect(authLossOf({ status: false, msg: '请重新登录', redirect: '/login?next=/x' })).toMatchObject({
      loginUrl: '/login?next=/x',
    });
  });

  it('不是对象就不猜', () => {
    expect(authLossOf('登录超时')).toBeUndefined();
    expect(authLossOf(null)).toBeUndefined();
  });
});
