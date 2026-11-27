import { useEffect, useMemo, useRef } from 'react';

const MIN_REVEAL_PX = 8;

const PX_PER_MS = 0.03;

/**
 * 把一段被容器裁掉的文字在指针停留时横向推出来：会话列表的标题、长任务行的标题都用它。
 */
export interface TextMarquee {
  /** 指针进来：先量溢出，够一截才开始推；减少动效偏好下直接推到末尾。 */
  enter(): void;
  /** 指针离开：立刻回到起点，清掉两个 data 标记。 */
  leave(): void;
}

function placeTitle(title: HTMLElement, left: number, range: number): void {
  title.scrollTo({ left, behavior: 'instant' });
  if (left > 0) title.dataset.scrolled = '';
  else delete title.dataset.scrolled;
  if (left < range) title.dataset.clipped = '';
  else delete title.dataset.clipped;
}

function restTitle(title: HTMLElement): void {
  title.scrollTo({ left: 0, behavior: 'instant' });
  delete title.dataset.scrolled;
  delete title.dataset.clipped;
}

/**
 * 悬停推进的横向跑马灯：按帧累加 scrollLeft，回到起点即复位。
 * @param target 现取滚动容器（元素归调用方所有，可能在子树里）。
 * @returns 一对 enter / leave 指针回调。
 */
export function useTextMarquee(target: () => HTMLElement | null): TextMarquee {
  const frame = useRef(0);
  const resolve = useRef(target);
  useEffect(() => {
    resolve.current = target;
  });
  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
    },
    [],
  );
  return useMemo(
    () => ({
      enter: () => {
        const element = resolve.current();
        if (element === null) return;
        const range = element.scrollWidth - element.clientWidth;
        if (range <= MIN_REVEAL_PX) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          placeTitle(element, range, range);
          return;
        }
        cancelAnimationFrame(frame.current);
        let previous: number | undefined;
        let position = 0;
        const step = (now: number): void => {
          position += previous === undefined ? 0 : (now - previous) * PX_PER_MS;
          previous = now;
          placeTitle(element, Math.min(position, range), range);
          if (position < range) frame.current = requestAnimationFrame(step);
        };
        frame.current = requestAnimationFrame(step);
      },
      leave: () => {
        cancelAnimationFrame(frame.current);
        const element = resolve.current();
        if (element === null) return;
        restTitle(element);
      },
    }),
    [],
  );
}
