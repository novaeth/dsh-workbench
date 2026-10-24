import { describe, expect, it } from 'vitest';
import { WorkbenchDataError } from '@dsh-workbench/shared/host';
import { loginUrlOfDomain, pluginLoginHint } from '../index.js';

const DASHBOARDS = 'dashboards.observability.team*-*.example.cn';
const DASHBOARDS_URL = 'https://dashboards.observability.team-test.example.cn';

function authError(helpUrl?: string): WorkbenchDataError {
  return new WorkbenchDataError(
    'auth-required',
    '未登录 Dashboards，请先在浏览器中完成登录',
    helpUrl === undefined ? {} : { helpUrl },
  );
}

describe('★ 登录提示里的地址：opencli 自己给的那份说了算', () => {
  it('错误里带着登录地址 ⇒ 照抄它（域名写着通配也照抄，那是插件按环境拼出来的真地址）', () => {
    const hint = pluginLoginHint(authError(DASHBOARDS_URL), DASHBOARDS);

    expect(hint).toContain(DASHBOARDS_URL);
    expect(hint).toContain('未登录 Dashboards');
    expect(hint).not.toContain('*');
  });

  it('没有地址、域名是具体的 ⇒ 拼 https://<域名>/login', () => {
    expect(pluginLoginHint(authError(), 'inventory.example.cn')).toContain('https://inventory.example.cn/login');
  });

  it('地址是个空串 ⇒ 当没有（不给一句"打开 登一次"的废话）', () => {
    expect(pluginLoginHint(authError('   '), 'inventory.example.cn')).toContain('https://inventory.example.cn/login');
  });

  it('★ 域名是通配的又没有地址 ⇒ 一个地址都不给（不编一个看着像的）', () => {
    const hint = pluginLoginHint(authError(), DASHBOARDS);

    expect(hint).not.toContain('http');
    expect(hint).toContain('在 opencli 那扇浏览器窗里登录这个站点');
  });

  it('不是登录问题 ⇒ 原话照旧，不加尾巴', () => {
    expect(pluginLoginHint(new Error('loki 查询超时'), 'inventory.example.cn')).toBe('loki 查询超时');
    expect(pluginLoginHint('连不上 daemon', undefined)).toBe('连不上 daemon');
  });

  it('★ 文案里没有"未登录"但错误码是 auth-required ⇒ 也按登录问题办', () => {
    const error = new WorkbenchDataError('auth-required', 'Not authenticated', {
      helpUrl: 'https://demo.example.cn/login',
    });

    expect(pluginLoginHint(error, undefined)).toContain('https://demo.example.cn/login');
  });
});

describe('域名 ⇒ 登录地址这一步：只认能拼出具体地址的那几种', () => {
  it('具体的域名拼 /login，去尾斜杠，已经带协议的照用', () => {
    expect(loginUrlOfDomain('inventory.example.cn')).toBe('https://inventory.example.cn/login');
    expect(loginUrlOfDomain(' inventory.example.cn/ ')).toBe('https://inventory.example.cn/login');
    expect(loginUrlOfDomain('https://inventory.example.cn/#/console/home')).toBe(
      'https://inventory.example.cn/#/console/home',
    );
  });

  it('通配 / 空 ⇒ 拼不出来', () => {
    expect(loginUrlOfDomain(DASHBOARDS)).toBeUndefined();
    expect(loginUrlOfDomain('')).toBeUndefined();
    expect(loginUrlOfDomain(undefined)).toBeUndefined();
  });
});
