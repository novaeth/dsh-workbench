import type { ModuleUpdateBlock } from '@/kernel/contract/bundle-install';
import { requirementsText } from '@dsh-workbench/shared';
import type { MarketHint } from './market-row-types';

export function updateBlockHintOf(block: ModuleUpdateBlock): MarketHint {
  if (block.kind === 'needs-workbench') return { key: 'panels.market.updateNeedsWorkbench' };
  const dsh = requirementsText(block.requirements);
  if (dsh === undefined || block.runtimeVersion === undefined) {
    return { key: 'panels.market.updateIncompatible' };
  }
  return { key: 'panels.market.updateNeedsDsh', params: { dsh, runtime: block.runtimeVersion } };
}
