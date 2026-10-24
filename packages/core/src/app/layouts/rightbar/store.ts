import type { PanelStep } from '@dsh-workbench/shared';
import { STORAGE_KEY_RIGHTBAR, STORAGE_KEY_RIGHTBAR_COLUMN } from '@dsh-workbench/shared';
import { readText, writeText } from '@dsh-workbench/shared';

export type { PanelStep } from '@dsh-workbench/shared';

export type RightbarColumn = 'workbench' | 'dsh';

export interface RightbarState {
  readonly expanded: boolean;
  readonly column: RightbarColumn;
  readonly trail: readonly PanelStep[];
}

export interface RightbarStore {
  getSnapshot(): RightbarState;
  subscribe(listener: () => void): () => void;
  setExpanded(expanded: boolean): void;
  toggleExpanded(): void;
  setColumn(column: RightbarColumn): void;
  open(step: PanelStep): void;
  goTo(index: number): void;
  back(): void;
}

export interface RightbarPersistence {
  readFlag(key: string, fallback: boolean): boolean;
  writeFlag(key: string, value: boolean): void;
  readText(key: string): string | null;
  writeText(key: string, value: string | null): void;
}

export function readFlag(key: string, fallback: boolean): boolean {
  const raw = readText(key);
  if (raw === null) return fallback;
  return raw === 'true';
}

export function writeFlag(key: string, value: boolean): void {
  writeText(key, value ? 'true' : 'false');
}

const browserPersistence: RightbarPersistence = { readFlag, writeFlag, readText, writeText };

export const RIGHTBAR_DEFAULT_EXPANDED = true;

export const RIGHTBAR_DEFAULT_COLUMN: RightbarColumn = 'workbench';

export interface RightbarColumnPressed {
  readonly workbench: boolean;
  readonly dsh: boolean;
}

export function pressedColumns(state: RightbarState, dshExpanded: boolean): RightbarColumnPressed {
  return {
    workbench: state.column === 'workbench' && state.expanded,
    dsh: state.column === 'dsh' && dshExpanded,
  };
}

const BOARD_STEP: PanelStep = { kind: 'board' };

function readColumn(persistence: RightbarPersistence): RightbarColumn {
  return persistence.readText(STORAGE_KEY_RIGHTBAR_COLUMN) === 'dsh' ? 'dsh' : RIGHTBAR_DEFAULT_COLUMN;
}

export function createRightbarStore(persistence: RightbarPersistence = browserPersistence): RightbarStore {
  let state: RightbarState = {
    expanded: persistence.readFlag(STORAGE_KEY_RIGHTBAR, RIGHTBAR_DEFAULT_EXPANDED),
    column: readColumn(persistence),
    trail: [BOARD_STEP],
  };

  const listeners = new Set<() => void>();

  function commit(next: RightbarState): void {
    if (
      next.expanded === state.expanded &&
      next.column === state.column &&
      next.trail === state.trail
    ) {
      return;
    }
    state = next;
    for (const listener of listeners) listener();
  }

  function setTrail(trail: readonly PanelStep[]): void {
    commit({
      expanded: state.expanded,
      column: state.column,
      trail: trail.length === 0 ? [BOARD_STEP] : trail,
    });
  }

  return {
    getSnapshot: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    setExpanded(expanded) {
      if (expanded === state.expanded) return;
      persistence.writeFlag(STORAGE_KEY_RIGHTBAR, expanded);
      commit({ expanded, column: state.column, trail: state.trail });
    },

    toggleExpanded() {
      this.setExpanded(!state.expanded);
    },

    setColumn(column) {
      if (column === state.column) return;
      persistence.writeText(STORAGE_KEY_RIGHTBAR_COLUMN, column);
      commit({ expanded: state.expanded, column, trail: state.trail });
    },

    open(step) {
      const top = state.trail[state.trail.length - 1];
      if (top !== undefined && sameStep(top, step)) return;
      setTrail([...state.trail, step]);
    },

    goTo(index) {
      if (index < 0 || index >= state.trail.length) return;
      setTrail(state.trail.slice(0, index + 1));
    },

    back() {
      if (state.trail.length <= 1) return;
      setTrail(state.trail.slice(0, -1));
    },
  };
}

function sameStep(a: PanelStep, b: PanelStep): boolean {
  return a.kind === b.kind;
}
