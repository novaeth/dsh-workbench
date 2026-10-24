import { describe, expect, it } from 'vitest';
import { blockerActionLabel, blockerPending } from './blocker-action';

const t = (key: string): string => `«${key}»`;

const RETRY = { kind: 'retry', label: '重试' } as const;
const LOGIN = { kind: 'open-url', label: '去登录', url: 'https://inventory.example/login', inline: true } as const;
const COPY = { kind: 'copy', label: '复制命令', text: 'opencli inventory envs' } as const;
const FIX = { kind: 'run-fix', label: '帮我安装', unit: 'inventory', fix: 'install' } as const;

const idle = { retrying: false, running: null, copied: null } as const;

describe('阻断态那颗按钮说什么', () => {
  it('★ 忙的时候「重试」自己说「重试中…」（用户点的就是它）', () => {
    expect(blockerActionLabel(RETRY, { ...idle, retrying: true }, t)).toBe('«blocker.retry.running»');
  });

  it('不忙就是原文（不假装忙）', () => {
    expect(blockerActionLabel(RETRY, idle, t)).toBe('重试');
  });

  it('★ 忙的不是重试本身（安装在路上）→ 「重试」不许跟着说「重试中…」', () => {
    expect(blockerActionLabel(RETRY, { ...idle, running: '帮我安装' }, t)).toBe('重试');
    expect(blockerActionLabel(LOGIN, { ...idle, retrying: true }, t)).toBe('去登录');
  });

  it('安装在路上 → 那颗说「正在执行…」', () => {
    expect(blockerActionLabel(FIX, { ...idle, running: '帮我安装' }, t)).toBe('«blocker.fix.running»');
  });

  it('复制成功那一下说「已复制」', () => {
    expect(blockerActionLabel(COPY, { ...idle, copied: 'opencli inventory envs' }, t)).toBe('«env.copied»');
  });

  it('★ 忙 = 卡片在刷 || 本地动作在跑（少算一半，按钮就又哑了）', () => {
    expect(blockerPending(true, null)).toBe(true);
    expect(blockerPending(false, '帮我安装')).toBe(true);
    expect(blockerPending(false, null)).toBe(false);
  });
});
