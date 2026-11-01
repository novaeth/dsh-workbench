import { describe, expect, it } from 'vitest';
import {
  API_PREFIX,
  GIT_TIMEOUT_MS,
  INSTALL_TIMEOUT_MS,
  LOCALE_NS,
  LOCALES,
  OPENCLI_TIMEOUT_MS,
  PREFLIGHT_DOCTOR_TIMEOUT_MS,
  PREFLIGHT_INSTALL_TIMEOUT_MS,
  PLUGIN_ID,
  STORAGE_KEY_PROJECT,
  STORAGE_KEY_RIGHTBAR,
} from '../constants.js';

describe('constants', () => {
  it('API_PREFIX 是合法前缀：以 / 开头、不以 / 结尾、不带查询符', () => {
    expect(API_PREFIX.startsWith('/')).toBe(true);
    expect(API_PREFIX.endsWith('/')).toBe(false);
    expect(API_PREFIX).not.toContain('?');
  });

  it('本地命令的超时短于外部 CLI 的超时', () => {
    expect(GIT_TIMEOUT_MS).toBeLessThan(OPENCLI_TIMEOUT_MS);
    expect(GIT_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it('启动体检的兜底：doctor 30 秒、装 runtime 2 分钟，都短于模块装卸', () => {
    expect(PREFLIGHT_DOCTOR_TIMEOUT_MS).toBe(30_000);
    expect(PREFLIGHT_INSTALL_TIMEOUT_MS).toBe(120_000);
    expect(PREFLIGHT_DOCTOR_TIMEOUT_MS).toBeLessThan(PREFLIGHT_INSTALL_TIMEOUT_MS);
    expect(PREFLIGHT_INSTALL_TIMEOUT_MS).toBeLessThan(INSTALL_TIMEOUT_MS);
  });

  it('存储键互不相同且非空', () => {
    const keys = [STORAGE_KEY_PROJECT, STORAGE_KEY_RIGHTBAR];
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key.trim()).not.toBe('');
  });

  it('locale 命名空间与语言表非空且无重复', () => {
    expect(LOCALE_NS.trim()).not.toBe('');
    expect(LOCALES.length).toBeGreaterThan(0);
    expect(new Set(LOCALES).size).toBe(LOCALES.length);
  });

  it('插件 id 是包名格式（浏览器模块表按它注册）', () => {
    expect(PLUGIN_ID.startsWith('@')).toBe(true);
    expect(PLUGIN_ID).toContain('/');
  });
});
