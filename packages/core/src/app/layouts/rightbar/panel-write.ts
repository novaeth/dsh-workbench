import { useEffect, useState } from 'react';

export const PANEL_SETTLE_MS = 4000;

export interface BoardSignRow {
  readonly id: string;
  readonly shown: boolean;
  readonly source: string;
}

function rowKey(row: BoardSignRow): string {
  return `${row.id}:${row.shown ? '1' : '0'}:${row.source}`;
}

function rowKeys(rows: readonly BoardSignRow[]): string {
  return rows.map(rowKey).join(',');
}

export function panelBoardSignature(
  units: readonly BoardSignRow[],
  plugins: readonly BoardSignRow[],
  own: boolean,
): string {
  return `${rowKeys(units)}|${rowKeys(plugins)}|${own ? '1' : '0'}`;
}

export function machineBoardSignature(
  defaults: readonly string[],
  changed: Readonly<Record<string, number>>,
): string {
  const counts = Object.entries(changed)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([id, count]) => `${id}:${String(count)}`);
  return `${[...defaults].sort().join(',')}|${counts.join(',')}`;
}

export function nextPending(pending: string | null, signature: string): string | null {
  return pending !== null && pending !== signature ? null : pending;
}

export interface BoardSettle {
  readonly pending: boolean;
  begin(): void;
  clear(): void;
}

export function useBoardSettle(signature: string): BoardSettle {
  const [held, setHeld] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 这是一次性复位，不是派生：held 记的是"按下那一刻的签名"，签名一变就作废（改走再改回同一个字符串也算新的一次，推导式分不出来）
    setHeld((current) => nextPending(current, signature));
  }, [signature]);

  useEffect(() => {
    if (held === null) return undefined;
    const timer = setTimeout(() => setHeld(null), PANEL_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [held]);

  return {
    pending: held !== null,
    begin: () => setHeld(signature),
    clear: () => setHeld(null),
  };
}
