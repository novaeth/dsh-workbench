import { describe, expect, it } from 'vitest';
import { BOARD_PROBE_UNKNOWN, boardProbe, publishBoardProbe, subscribeBoardProbe } from '../board-fact';

const probe = (over: Partial<ReturnType<typeof boardProbe>> = {}) => ({
  workbench: true,
  where: '/w/workbench/diy',
  bar: true,
  board: '/w/workbench/diy',
  open: true,
  drawn: true,
  ...over,
});

describe('板事实的客户端发布口：客户端只负责"量"，判据在 shared', () => {
  it('★★ 初值是"没画"：加载就让给别的面板时右栏不挂载，乐观初值会让那一格说谎', () => {
    expect(boardProbe()).toEqual(BOARD_PROBE_UNKNOWN);
    expect(boardProbe().bar).toBe(false);
  });

  it('★★ 发布会被订阅者读到；一模一样的探针不重复通知（免得整棵树白渲染）', () => {
    const seen: string[] = [];
    const stop = subscribeBoardProbe(() => seen.push('ping'));

    publishBoardProbe(probe());
    expect(boardProbe()).toEqual(probe());
    expect(seen).toHaveLength(1);

    publishBoardProbe(probe());
    expect(seen).toHaveLength(1);

    publishBoardProbe(probe({ board: '/w/other' }));
    expect(seen).toHaveLength(2);

    stop();
    publishBoardProbe(probe({ open: false }));
    expect(seen).toHaveLength(2);
    expect(boardProbe().open).toBe(false);
  });

  it('★ 一个订阅者抛错不带走别人', () => {
    const seen: string[] = [];
    const stopBad = subscribeBoardProbe(() => {
      throw new Error('boom');
    });
    const stopGood = subscribeBoardProbe(() => seen.push('ok'));

    expect(() => publishBoardProbe(probe({ board: '/w/x' }))).not.toThrow();
    expect(seen).toEqual(['ok']);

    stopBad();
    stopGood();
  });
});
