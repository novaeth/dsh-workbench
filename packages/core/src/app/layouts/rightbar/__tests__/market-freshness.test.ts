import { describe, expect, it } from 'vitest';
import type { Translate } from '@dsh-workbench/shared';
import { VERSION_CHECK_TTL_MS } from '@dsh-workbench/shared';
import { zh } from '@dsh-workbench/shared';
import { MARKET_STALE_MS, checkedAgoText, marketSettled, shouldProbeOnEnter } from '../market-freshness';

const t: Translate = (key, params) => {
  const text = (zh as Record<string, string>)[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_match, name: string) => String(params?.[name] ?? ''));
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

describe('checkedAgoText', () => {
  it('一分钟以内 → 「刚刚」', () => {
    expect(checkedAgoText(0, 0, t)).toBe('刚刚');
    expect(checkedAgoText(0, 59_999, t)).toBe('刚刚');
  });

  it('分界：满 1 分钟才算「1 分钟前」（不然刚探完就说"1 分钟前"是谎报）', () => {
    expect(checkedAgoText(0, MINUTE, t)).toBe('1 分钟前');
    expect(checkedAgoText(0, 59 * MINUTE, t)).toBe('59 分钟前');
  });

  it('满 1 小时往上说小时', () => {
    expect(checkedAgoText(0, HOUR, t)).toBe('1 小时前');
    expect(checkedAgoText(0, 25 * HOUR, t)).toBe('25 小时前');
  });

  it('★ 时钟回拨（`at` 在未来）不说"-1 分钟前"：夹到「刚刚」', () => {
    expect(checkedAgoText(MINUTE, 0, t)).toBe('刚刚');
  });
});

describe('shouldProbeOnEnter：进页面要不要在后台补一次强探', () => {
  const NOW = 100 * MINUTE;

  const probeAt = (checkedAt: number | null, now = NOW): boolean =>
    shouldProbeOnEnter({ checkedAt, now, staleMs: MARKET_STALE_MS });

  it('★ 有结论且新鲜 → 不探（进页面直接用现有结论秒开）', () => {
    expect(probeAt(NOW - MINUTE)).toBe(false);
    expect(probeAt(NOW)).toBe(false);
  });

  it('★ 结论过旧（早于阈值）→ 探一次', () => {
    expect(probeAt(NOW - MARKET_STALE_MS - 1)).toBe(true);
    expect(probeAt(NOW - 3 * HOUR)).toBe(true);
  });

  it('★ 一条结论都没有（第一次打开、什么都没读过）→ 探一次', () => {
    expect(probeAt(null)).toBe(true);
  });

  it('分界：正好到阈值就算过旧（与宿主那层 TTL 同一口径：它那时也不认旧答案了）', () => {
    expect(probeAt(NOW - MARKET_STALE_MS)).toBe(true);
    expect(probeAt(NOW - MARKET_STALE_MS + 1)).toBe(false);
  });

  it('★ 时钟回拨（结论时刻在未来）→ 不探（宁可不探，也不在错乱的钟上反复探）', () => {
    expect(probeAt(NOW + HOUR)).toBe(false);
  });

  it('阈值是入参：改小就立刻判"过旧"（将来调阈值只动那一个常量）', () => {
    expect(shouldProbeOnEnter({ checkedAt: NOW - 2 * MINUTE, now: NOW, staleMs: MINUTE })).toBe(true);
    expect(shouldProbeOnEnter({ checkedAt: NOW - 2 * MINUTE, now: NOW, staleMs: 5 * MINUTE })).toBe(false);
  });

  it('★ 阈值与宿主那份"源上哪版"的 TTL 对齐（宿主的答案更年轻，我们抢先探也问不出新的）', () => {
    expect(MARKET_STALE_MS).toBe(VERSION_CHECK_TTL_MS);
  });
});

describe('marketSettled —— 面板是不是还在「检测中」', () => {
  const loaded = { loaded: true, checking: false, checkedAt: 1 };

  it('两半都读完才算读完：能力那份或装了什么那份任缺一半，身子就还在转', () => {
    expect(marketSettled(loaded, true)).toBe(true);
    expect(marketSettled({ loaded: false, checking: true, checkedAt: null }, true)).toBe(false);
    expect(marketSettled(loaded, false)).toBe(false);
  });

  it('★ 已经读完、只是又探了一次（checking）也算读完 —— 头里那两颗钮要盯的是 `|| checking` 那一半', () => {
    expect(marketSettled({ loaded: true, checking: true, checkedAt: 1 }, true)).toBe(true);
  });
});
