import { describe, expect, it } from 'vitest';
import { crashModeOn, mockModeOn } from '../mock-mode';

describe('mockModeOn', () => {
  it('wbMock=1 开着（唯一参数、跟别人一起、在中间都算）', () => {
    expect(mockModeOn('?wbMock=1')).toBe(true);
    expect(mockModeOn('?token=abc&wbMock=1')).toBe(true);
    expect(mockModeOn('?wbMock=1&x=2')).toBe(true);
  });

  it('老名字 wbMarketMock=1 也认（别让已经开着的页面失灵）', () => {
    expect(mockModeOn('?wbMarketMock=1')).toBe(true);
  });

  it('其它一律关着', () => {
    expect(mockModeOn('')).toBe(false);
    expect(mockModeOn('?token=abc')).toBe(false);
    expect(mockModeOn('?wbMock=0')).toBe(false);
    expect(mockModeOn('?notwbMock=1')).toBe(false);
  });
});

describe('crashModeOn', () => {
  it('wbCrash=1 才开着（与 wbMock 各自独立）', () => {
    expect(crashModeOn('?wbCrash=1')).toBe(true);
    expect(crashModeOn('?wbMock=1&wbCrash=1')).toBe(true);
    expect(crashModeOn('?wbMock=1')).toBe(false);
    expect(crashModeOn('')).toBe(false);
    expect(crashModeOn('?wbCrash=0')).toBe(false);
    expect(crashModeOn('?notwbCrash=1')).toBe(false);
  });
});
