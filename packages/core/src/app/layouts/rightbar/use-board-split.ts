import { useLayoutEffect, useRef, useState } from 'react';

import {
  BOARD_SPLIT_DEADLINE_MS,
  BOARD_SPLIT_QUIET_MS,
  boardAssignment,
  boardImproves,
  boardLayout,
  roundRobinIndexes,
  type BoardSlot,
} from './board-columns';

export interface BoardSplit {
  readonly root: { current: HTMLDivElement | null };
  readonly slots: readonly BoardSlot[] | null;
}

interface Assignment {
  readonly key: string;
  readonly columns: readonly number[];
}

export function useBoardSplit(keys: readonly string[], columns: number): BoardSplit {
  const width = Math.max(1, Math.min(Math.floor(columns), Math.max(1, keys.length)));
  const structureKey = `${String(width)}\u0000${keys.join('\u0001')}`;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const sizesRef = useRef(new Map<string, number>());
  const widthRef = useRef(width);
  const latestRef = useRef(keys);
  const [sizes, setSizes] = useState<ReadonlyMap<string, number>>(() => new Map());
  const [planned, setPlanned] = useState<Assignment | null>(null);

  useLayoutEffect(() => {
    latestRef.current = keys;
  });

  useLayoutEffect(() => {
    if (widthRef.current !== width) {
      sizesRef.current.clear();
      widthRef.current = width;
    }
    let quiet: ReturnType<typeof setTimeout> | null = null;
    let deadline: ReturnType<typeof setTimeout> | null = null;
    const stop = (): void => {
      if (quiet !== null) clearTimeout(quiet);
      if (deadline !== null) clearTimeout(deadline);
      quiet = null;
      deadline = null;
    };
    const heightsNow = (): readonly number[] | null => {
      const keys2 = latestRef.current;
      if (keys2.length === 0) return null;
      if (!keys2.every((key) => sizesRef.current.has(key))) return null;
      return keys2.map((key) => sizesRef.current.get(key) ?? 0);
    };
    const assign = (): void => {
      const heights = heightsNow();
      if (heights === null) return;
      const columns2 = boardAssignment(heights, width);
      setPlanned((current) => {
        if (
          current !== null &&
          current.key === structureKey &&
          !boardImproves(current.columns, columns2, heights, width)
        ) {
          return current;
        }
        return { key: structureKey, columns: columns2 };
      });
    };
    const publish = (): void => {
      setSizes(new Map(sizesRef.current));
    };
    const settle = (): void => {
      stop();
      assign();
    };
    const schedule = (): void => {
      if (quiet !== null) clearTimeout(quiet);
      quiet = setTimeout(settle, BOARD_SPLIT_QUIET_MS);
    };
    const measure = (cell: Element): boolean => {
      const key = cell.getAttribute('data-wb-cell');
      if (key === null) return false;
      const height = cell.getBoundingClientRect().height;
      if (sizesRef.current.get(key) === height) return false;
      sizesRef.current.set(key, height);
      return true;
    };
    const element = rootRef.current;
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver((entries) => {
            let dirty = false;
            for (const entry of entries) {
              if (measure(entry.target)) dirty = true;
            }
            if (!dirty) return;
            publish();
            schedule();
          });
    if (element !== null) {
      let dirty = false;
      for (const cell of [...element.querySelectorAll('[data-wb-cell]')]) {
        if (measure(cell)) dirty = true;
        observer?.observe(cell);
      }
      if (dirty) publish();
      assign();
    }
    schedule();
    deadline = setTimeout(settle, BOARD_SPLIT_DEADLINE_MS);
    return () => {
      stop();
      observer?.disconnect();
    };
  }, [structureKey, width]);

  const assigned =
    planned !== null && planned.key === structureKey ? planned.columns : roundRobinIndexes(keys.length, width);
  const heights: number[] = [];
  let complete = keys.length > 0;
  for (const key of keys) {
    const height = sizes.get(key);
    if (height === undefined) complete = false;
    else heights.push(height);
  }
  return { root: rootRef, slots: complete ? boardLayout(assigned, width) : null };
}
