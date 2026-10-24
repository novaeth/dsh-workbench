import type { Translate } from '@dsh-workbench/shared';
import type { BundleChange } from '@/kernel/contract/bundle-install';
import type { MarketRowAction } from './market-row-types';

export interface UpdatedModule {
  readonly kind?: string;
  readonly pkg?: string;
  readonly version?: string;
}

export type UpdateVerdict =
  | { readonly kind: 'ok' }
  | { readonly kind: 'no-change' }
  | { readonly kind: 'gone'; readonly restored?: string }
  | { readonly kind: 'behind'; readonly installed: string };

export function updateVerdictOf(input: {
  readonly action: MarketRowAction;
  readonly change: BundleChange | undefined;
  readonly module: UpdatedModule | undefined;
  readonly restored?: string | undefined;
  readonly clicked?: string | undefined;
  readonly latest?: string | undefined;
}): UpdateVerdict {
  if (input.action !== 'update-bundle') return { kind: 'ok' };
  const gone =
    input.restored !== undefined ||
    input.change?.errorCode === 'module-gone' ||
    (input.module !== undefined && input.module.kind !== 'module');
  if (gone) {
    return { kind: 'gone', ...(input.restored === undefined ? {} : { restored: input.restored }) };
  }
  const installed = input.module?.version;
  if (input.change?.errorCode === 'no-change') return { kind: 'no-change' };
  if (installed === undefined) return { kind: 'ok' };
  if (input.clicked !== undefined && installed === input.clicked) return { kind: 'no-change' };
  if (input.latest !== undefined && installed !== input.latest) return { kind: 'behind', installed };
  return { kind: 'ok' };
}

export function updateVerdictText(
  verdict: UpdateVerdict,
  t: Translate,
  input: { readonly from?: string | undefined; readonly latest?: string | undefined },
): string | undefined {
  if (verdict.kind === 'no-change') {
    return t('panels.market.updateNoChange', {
      from: input.from ?? '?',
      latest: input.latest ?? t('panels.market.updateUnknownVersion'),
    });
  }
  if (verdict.kind === 'gone') {
    return verdict.restored === undefined
      ? t('panels.market.updateGone')
      : t('panels.market.updateRestored', { version: verdict.restored });
  }
  if (verdict.kind === 'behind') {
    return t('panels.market.updateBehind', {
      installed: verdict.installed,
      latest: input.latest ?? t('panels.market.updateUnknownVersion'),
    });
  }
  return undefined;
}
