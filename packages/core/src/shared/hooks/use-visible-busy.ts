import { useEffect, useRef, useState } from 'react';
import { holdBusy } from '@dsh-workbench/shared';

/**
 * 读数的相位：`idle` 还没开读 · `loading` 在飞 · `ready` 有值 · `error` 失败。
 */
export type HeldPhase = 'idle' | 'loading' | 'ready' | 'error';

/**
 * “在忙，还是只是收尾”的投影：`settling` 为真时读数已经回来、界面还挂着。
 */
export interface BusyView {
  readonly busy: boolean;
  readonly settling: boolean;
}

/**
 * 把“正在刷新”折进相位：`refreshing` 且已是 `ready` 记作 `loading`，让“旧值还显示、新的在路上”有名字。
 */
export function heldPhase(phase: HeldPhase, refreshing: boolean): HeldPhase {
  return refreshing && phase === 'ready' ? 'loading' : phase;
}

/**
 * 由 `active` 与 `useVisibleBusy` 挂出来的 `visible` 投影出 `{ busy, settling }`；纯函数，好测。
 */
export function busyView(active: boolean, visible: boolean): BusyView {
  return { busy: visible, settling: visible && !active };
}

/**
 * 需要“最少转一会儿”的忙态时调用：`active` 变真立刻 `busy`；变假时若这次没转满 `floorMs`，`busy` 先挂着，
 * 这期间 `settling` 为真表示读数在回来的路上。`floorMs` 传共享包的 `MIN_BUSY_MS`，别自己编 ——
 * 取数几毫秒就回来时不挂这一会儿，用户看到的是“闪一下”，比不转更难读。
 */
export function useVisibleBusy(active: boolean, floorMs: number): BusyView {
  const [visible, setVisible] = useState(active);
  const since = useRef<number | null>(null);

  useEffect(() => {
    if (active) {
      if (since.current === null) since.current = Date.now();
      setVisible(true);
      return undefined;
    }
    const held = holdBusy(since.current, Date.now(), floorMs);
    since.current = null;
    if (!held.visible) {
      setVisible(false);
      return undefined;
    }
    const timer = setTimeout(() => setVisible(false), held.releaseInMs);
    return () => clearTimeout(timer);
  }, [active, floorMs]);

  return busyView(active, visible);
}
