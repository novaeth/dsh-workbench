import type { BoardProbe } from '@dsh-workbench/shared';

export const BOARD_PROBE_UNKNOWN: BoardProbe = {
  workbench: true,
  where: '',
  bar: false,
  board: '',
  open: false,
  drawn: false,
};

let probe: BoardProbe = BOARD_PROBE_UNKNOWN;
const listeners = new Set<() => void>();

export function boardProbe(): BoardProbe {
  return probe;
}

function same(left: BoardProbe, right: BoardProbe): boolean {
  return (
    left.workbench === right.workbench &&
    left.where === right.where &&
    left.bar === right.bar &&
    left.board === right.board &&
    left.open === right.open &&
    left.drawn === right.drawn
  );
}

export function publishBoardProbe(next: BoardProbe): void {
  if (same(next, probe)) return;
  probe = next;
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
    }
  }
}

export function subscribeBoardProbe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
