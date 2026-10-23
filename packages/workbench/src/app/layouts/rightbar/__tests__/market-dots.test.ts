import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { MarketState } from '../market-row-types';
import { MARKET_DOT, MARKET_STATE_KEY } from '../market-rows';

const ALL_STATES: Readonly<Record<MarketState, true>> = {
  checking: true,
  installed: true,
  inactive: true,
  unusable: true,
  broken: true,
  outdated: true,
  'pending-restart': true,
  missing: true,
  unchecked: true,
  unknown: true,
};

describe('marketRows：状态点', () => {
  it('★ 黄点只给「有更新」——未装不许是黄的', () => {
    expect(MARKET_DOT.outdated).toBe('warning');
    expect(MARKET_DOT.missing).not.toBe('warning');
  });

  it('已装是绿点、检测中会动、不知道是灰的', () => {
    expect(MARKET_DOT.installed).toBe('done');
    expect(MARKET_DOT.checking).toBe('ongoing');
    expect(MARKET_DOT.unchecked).toBe('idle');
    expect(MARKET_DOT.unknown).toBe('idle');
  });

  it('★ 装了但还没生效 → 红点（不是绿点：它现在真的一点都用不上）', () => {
    expect(MARKET_DOT.inactive).toBe('error');
    expect(MARKET_STATE_KEY.inactive).toBe('panels.market.notActive');
  });

  it('★ 一切"装上了但用不上"的情形都给红点，且都有自己那句文案（不许拿「已安装」糊过去）', () => {
    expect(MARKET_DOT.unusable).toBe('error');
    expect(MARKET_STATE_KEY.unusable).toBe('panels.market.notUsable');
    expect(MARKET_DOT.broken).toBe('error');
    expect(MARKET_STATE_KEY.broken).toBe('panels.market.broken');
    expect(MARKET_STATE_KEY.unusable).not.toBe(MARKET_STATE_KEY.installed);
    expect(MARKET_STATE_KEY.broken).not.toBe(MARKET_STATE_KEY.installed);
  });

  it('★ 盘上换了、进程里还没换（重启后生效）→ 红点 + 自己那句文案，不许糊成「已安装」', () => {
    expect(MARKET_DOT['pending-restart']).toBe('error');
    expect(MARKET_STATE_KEY['pending-restart']).toBe('panels.market.pendingRestart');
    expect(MARKET_STATE_KEY['pending-restart']).not.toBe(MARKET_STATE_KEY.installed);
  });

  it('★ 状态那一行只为"绿的已安装"让位：别的状态（含「重启后生效」）都得把点和话摆出来', () => {
    const section = readFileSync(new URL('../market-section.tsx', import.meta.url), 'utf8');

    expect(section).toContain("row.state === 'installed'");
    expect(section).toContain('{quiet ? null : (');
    expect(MARKET_STATE_KEY['pending-restart']).not.toBe(MARKET_STATE_KEY.installed);
  });

  it('每个状态都有点、也都有文案（文案既显示在行里，又进 title/aria —— 颜色不是唯一通道）', () => {
    for (const state of Object.keys(ALL_STATES) as MarketState[]) {
      expect(MARKET_DOT[state]).toBeTruthy();
      expect(MARKET_STATE_KEY[state]).toMatch(/^panels\.market\./);
    }
  });
});
