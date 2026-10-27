import type { BundleChange } from '@/kernel/contract/bundle-install';
import { hostSurface } from '@dsh-workbench/shared/host';

export function restartLogLine(change: BundleChange | null | undefined): string | undefined {
  if (change === null || change === undefined || change.application !== 'restart-required') {
    return undefined;
  }
  const why = change.restartReason ?? '没给';
  return (
    `[dsh-workbench] ${change.target} 装上了，但这一版要${hostSurface().restartHint} 才生效` +
    `（dsh 那边给的理由：${why}）`
  );
}
