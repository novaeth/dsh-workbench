/**
 * 忙态按下限收尾的判据结果：还该不该显示（`visible`），以及还要按住多少毫秒（`releaseInMs`，0 = 立刻可收）。
 */
export interface BusyHold {
  readonly visible: boolean;
  readonly releaseInMs: number;
}

/**
 * 按「至少显示 floorMs」算这一轮忙此刻该不该收：没到下限就继续显示，并给出剩余时长供调用方起定时器。
 * @param since - 这一轮忙开始的时间戳；`null`（没开过这一轮）一律不显示。
 * @param now - 当前时间戳。
 * @param floorMs - 至少显示的时长（毫秒）。
 * @returns 还该不该显示 + 剩余毫秒；到点或已过下限给不显示，时钟倒退按「刚开头」算（剩余 = 下限，不给负数）。
 */
export function holdBusy(since: number | null, now: number, floorMs: number): BusyHold {
  if (since === null) return { visible: false, releaseInMs: 0 };
  const elapsed = Math.max(0, now - since);
  const left = floorMs - elapsed;
  return left <= 0 ? { visible: false, releaseInMs: 0 } : { visible: true, releaseInMs: left };
}
