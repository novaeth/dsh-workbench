export function shouldToggleWorkspaceMenu(
  mode: 'toggle' | 'open',
  openFor: string | null,
  clicked: string,
): boolean {
  return mode === 'toggle' && openFor !== null && openFor === clicked;
}
