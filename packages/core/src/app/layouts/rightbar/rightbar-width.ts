import type { DshLayoutPanels } from '@dsh-workbench/shared';
import { STORAGE_KEY_RIGHTBAR_WIDTH, readText, writeText } from '@dsh-workbench/shared';

export const RIGHTBAR_DEFAULT_WIDTH = 420;

export const RIGHTBAR_WIDTH_MAX = 4000;

export function parseRightbarWidth(raw: string | null): number | null {
  if (raw === null) return null;
  const px = Number(raw);
  if (!Number.isFinite(px) || px <= 0) return null;
  return Math.round(Math.min(px, RIGHTBAR_WIDTH_MAX));
}

export function readRightbarWidth(): number | null {
  return parseRightbarWidth(readText(STORAGE_KEY_RIGHTBAR_WIDTH));
}

export function writeRightbarWidth(px: number, write = writeText): void {
  if (!Number.isFinite(px) || px <= 0) return;
  write(STORAGE_KEY_RIGHTBAR_WIDTH, String(Math.round(Math.min(px, RIGHTBAR_WIDTH_MAX))));
}

export interface RightbarWidthMemory {
  seed(px: number): void;
  dispose(): void;
}

const noMemory: RightbarWidthMemory = {
  seed: () => {},
  dispose: () => {},
};

export function createRightbarWidthMemory(
  panels: DshLayoutPanels | undefined,
  write: (px: number) => void = writeRightbarWidth,
): RightbarWidthMemory {
  const original = panels?.setRightbar;
  if (panels === undefined || original === undefined) return noMemory;
  let seeding = false;
  panels.setRightbar = (px: number): void => {
    if (!Number.isFinite(px) || px <= 0) return;
    original.call(panels, px);
    if (!seeding) write(px);
  };
  return {
    seed(px) {
      seeding = true;
      try {
        panels.setRightbar?.(px);
      } finally {
        seeding = false;
      }
    },
    dispose() {
      panels.setRightbar = original;
    },
  };
}

const memories = new WeakMap<DshLayoutPanels, RightbarWidthMemory>();

export function ensureRightbarWidthMemory(
  panels: DshLayoutPanels | undefined,
  write: (px: number) => void = writeRightbarWidth,
): RightbarWidthMemory {
  if (panels === undefined) return noMemory;
  const known = memories.get(panels);
  if (known !== undefined) return known;
  const memory = createRightbarWidthMemory(panels, write);
  memories.set(panels, memory);
  return memory;
}

export function releaseRightbarWidthMemory(panels: DshLayoutPanels | undefined): void {
  if (panels === undefined) return;
  const memory = memories.get(panels);
  if (memory === undefined) return;
  memories.delete(panels);
  memory.dispose();
}

export function restoreRightbarWidth(
  panels: DshLayoutPanels | undefined,
  remembered: number | null = readRightbarWidth(),
): void {
  const memory = ensureRightbarWidthMemory(panels);
  if (remembered === null) return;
  memory.seed(remembered);
}

export function seedRightbarWidth(
  panels: DshLayoutPanels | undefined,
  remembered: number | null = readRightbarWidth(),
): void {
  ensureRightbarWidthMemory(panels).seed(remembered ?? RIGHTBAR_DEFAULT_WIDTH);
}
