export function hasOpenModal(scope: ParentNode): boolean {
  return scope.querySelector('[aria-modal="true"]') !== null;
}

export function dismissPanelByPointer(
  next: boolean,
  scope: ParentNode,
  onOpenChange: (open: boolean) => void,
): void {
  if (!next && hasOpenModal(scope)) return;
  onOpenChange(next);
}
