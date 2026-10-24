export const BOARD_COLUMN_MIN_WIDTH = 332;
export const BOARD_COLUMN_GAP = 12;
export const BOARD_PANEL_PADDING = 12;
export const BOARD_COLUMNS_AT =
  BOARD_COLUMN_MIN_WIDTH * 2 + BOARD_COLUMN_GAP + BOARD_PANEL_PADDING * 2;
export const BOARD_SPLIT_SEARCH_LIMIT = 100000;
export const BOARD_SPLIT_MIN_GAIN = 32;
export const BOARD_SPLIT_QUIET_MS = 600;
export const BOARD_SPLIT_DEADLINE_MS = 3000;

export function boardColumnCount(panelWidth: number, itemCount: number): number {
  if (itemCount < 1) return 1;
  if (!Number.isFinite(panelWidth) || panelWidth <= 0) return 1;
  const room = panelWidth - BOARD_PANEL_PADDING * 2 + BOARD_COLUMN_GAP;
  const slot = BOARD_COLUMN_MIN_WIDTH + BOARD_COLUMN_GAP;
  const fits = Math.floor(room / slot);
  return Math.max(1, Math.min(fits, itemCount));
}

function boardHeightsKnown(heights: readonly number[]): boolean {
  return heights.length > 0 && heights.every((height) => Number.isFinite(height) && height >= 0);
}

export function roundRobinIndexes(count: number, columns: number): readonly number[] {
  const width = Math.max(1, Math.floor(columns));
  return Array.from({ length: count }, (_unused, index) => index % width);
}

export function roundRobinColumns<T>(items: readonly T[], columns: number): readonly (readonly T[])[] {
  const width = Math.max(1, Math.floor(columns));
  const buckets: T[][] = Array.from({ length: width }, () => []);
  items.forEach((item, index) => {
    buckets[index % width].push(item);
  });
  return buckets;
}

function boardTops(heights: readonly number[], indexes: readonly number[], columns: number): readonly number[] {
  const tops = Array.from({ length: columns }, () => 0);
  const cards = Array.from({ length: columns }, () => 0);
  heights.forEach((height, index) => {
    const column = indexes[index];
    tops[column] += (cards[column] === 0 ? 0 : BOARD_COLUMN_GAP) + height;
    cards[column] += 1;
  });
  return tops;
}

export function boardImproves(
  current: readonly number[],
  candidate: readonly number[],
  heights: readonly number[],
  columns: number,
): boolean {
  if (current.length !== heights.length || candidate.length !== heights.length) return true;
  if (current.every((column, index) => column === candidate[index])) return false;
  const now = Math.max(...boardTops(heights, current, columns));
  const next = Math.max(...boardTops(heights, candidate, columns));
  return now - next >= BOARD_SPLIT_MIN_GAIN;
}

function greedyColumnIndexes(heights: readonly number[], columns: number): readonly number[] {
  const tops = Array.from({ length: columns }, () => 0);
  const cards = Array.from({ length: columns }, () => 0);
  return heights.map((height) => {
    let pick = 0;
    for (let at = 1; at < columns; at += 1) {
      if (tops[at] < tops[pick]) pick = at;
    }
    tops[pick] += (cards[pick] === 0 ? 0 : BOARD_COLUMN_GAP) + height;
    cards[pick] += 1;
    return pick;
  });
}

function decodeMask(mask: number, columns: number, count: number): readonly number[] {
  const indexes: number[] = [];
  let rest = mask;
  for (let at = 0; at < count; at += 1) {
    indexes.push(rest % columns);
    rest = Math.floor(rest / columns);
  }
  return indexes;
}

function compareTops(one: readonly number[], two: readonly number[]): number {
  const width = Math.max(one.length, two.length);
  for (let at = 0; at < width; at += 1) {
    const left = one[at] ?? 0;
    const right = two[at] ?? 0;
    if (left !== right) return left - right;
  }
  return 0;
}

export function boardColumnIndexes(heights: readonly number[], columns: number): readonly number[] {
  const count = heights.length;
  const width = Math.max(1, Math.floor(columns));
  if (count === 0) return [];
  if (width === 1) return heights.map(() => 0);
  if (width ** count > BOARD_SPLIT_SEARCH_LIMIT) return greedyColumnIndexes(heights, width);
  const states = width ** count;
  let best: readonly number[] | null = null;
  let bestTops: readonly number[] = [];
  let bestFlips = Number.POSITIVE_INFINITY;
  for (let mask = 0; mask < states; mask += 1) {
    if (mask % width !== 0) continue;
    const indexes = decodeMask(mask, width, count);
    if (new Set(indexes).size < Math.min(width, count)) continue;
    const tops = [...boardTops(heights, indexes, width)].sort((one, two) => two - one);
    const order = best === null ? -1 : compareTops(tops, bestTops);
    if (order > 0) continue;
    const flips = indexes.filter((one, index) => one !== index % width).length;
    if (order === 0 && flips >= bestFlips) continue;
    best = indexes;
    bestTops = tops;
    bestFlips = flips;
  }
  return best ?? greedyColumnIndexes(heights, width);
}

export function boardAssignment(heights: readonly number[], columns: number): readonly number[] {
  const width = Math.max(1, Math.floor(columns));
  if (width === 1) return heights.map(() => 0);
  const even = roundRobinIndexes(heights.length, width);
  if (!boardHeightsKnown(heights)) return even;
  const best = boardColumnIndexes(heights, width);
  if (new Set(best).size < Math.min(width, heights.length)) return even;
  const evenTop = Math.max(...boardTops(heights, even, width));
  const bestTop = Math.max(...boardTops(heights, best, width));
  return evenTop - bestTop < BOARD_SPLIT_MIN_GAIN ? even : best;
}

export function boardColumnsByHeight<T>(
  items: readonly T[],
  heights: readonly number[],
  columns: number,
): readonly (readonly T[])[] {
  const width = Math.max(1, Math.min(Math.floor(columns), Math.max(1, items.length)));
  if (width === 1 || items.length < 2) return [items];
  if (heights.length !== items.length) return roundRobinColumns(items, width);
  const buckets: T[][] = Array.from({ length: width }, () => []);
  boardAssignment(heights, width).forEach((column, index) => {
    buckets[column].push(items[index]);
  });
  if (buckets.some((bucket) => bucket.length === 0)) return roundRobinColumns(items, width);
  return buckets;
}

export interface BoardSlot {
  readonly index: number;
  readonly breakBefore: boolean;
  readonly trailing: boolean;
}

export function boardLayout(assignment: readonly number[], columns: number): readonly BoardSlot[] {
  const width = Math.max(1, Math.floor(columns));
  const buckets: number[][] = Array.from({ length: width }, () => []);
  assignment.forEach((column, index) => {
    const at = Number.isInteger(column) ? Math.max(0, Math.min(width - 1, column)) : 0;
    buckets[at].push(index);
  });
  const slots: BoardSlot[] = [];
  buckets.forEach((bucket) => {
    bucket.forEach((index, position) => {
      slots.push({
        index,
        breakBefore: width > 1 && slots.length > 0 && position === 0,
        trailing: position === bucket.length - 1,
      });
    });
  });
  return slots;
}
