const PINLESS_PANELS = new Set(['plugins']);

export function isPanelShown(id: string, unpinned: readonly string[]): boolean {
  return PINLESS_PANELS.has(id) || !unpinned.includes(id);
}

export function withPanelPinned(
  unpinned: readonly string[],
  id: string,
  pinned: boolean,
): readonly string[] {
  if (PINLESS_PANELS.has(id) || unpinned.includes(id) !== pinned) return unpinned;
  return pinned ? unpinned.filter((entry) => entry !== id) : [...unpinned, id];
}
