import type { BlockerActionShape, BlockerLabelState, BlockerLabelTranslate } from '@dsh-workbench/shared';

export function blockerPending(busy: boolean, running: string | null): boolean {
  return busy || running !== null;
}

export function blockerActionLabel(
  action: BlockerActionShape,
  state: BlockerLabelState,
  t: BlockerLabelTranslate,
): string {
  if (action.kind === 'retry' && state.retrying) return t('blocker.retry.running');
  if (state.running === action.label) return t('blocker.fix.running');
  if (action.kind === 'copy' && state.copied === action.text) return t('env.copied');
  return action.label;
}
