import { useSyncExternalStore } from 'react';
import type { Translate } from '@dsh-workbench/shared';

export type PanelHintTone = 'warning' | 'danger';

export interface PanelHint {
  readonly labelKey: string;
  readonly tone: PanelHintTone;
  readonly moreKeys?: readonly string[];
}

const hints = new Map<string, PanelHint>();
const listeners = new Set<() => void>();

function sameHint(left: PanelHint | null, right: PanelHint | null): boolean {
  if (left === null || right === null) return left === right;
  if (left.labelKey !== right.labelKey || left.tone !== right.tone) return false;
  const leftMore = left.moreKeys ?? [];
  const rightMore = right.moreKeys ?? [];
  return (
    leftMore.length === rightMore.length && leftMore.every((key, index) => key === rightMore[index])
  );
}

export function publishPanelHint(id: string, hint: PanelHint | null): void {
  if (sameHint(hints.get(id) ?? null, hint)) return;

  if (hint === null) hints.delete(id);
  else hints.set(id, hint);
  for (const listener of [...listeners]) listener();
}

export function panelHintOf(id: string | null): PanelHint | null {
  return id === null ? null : (hints.get(id) ?? null);
}

export function subscribePanelHints(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePanelHint(id: string | null): PanelHint | null {
  return useSyncExternalStore(subscribePanelHints, () => panelHintOf(id));
}

export function panelRowName(label: string, hint: PanelHint | null, t: Translate): string {
  if (hint === null) return label;
  const parts = [hint.labelKey, ...(hint.moreKeys ?? [])].map((key) => t(key));
  return t('panels.labelWithHint', { label, hint: parts.join(t('panels.hintJoin')) });
}
