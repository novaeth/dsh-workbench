import type { Translate } from '@dsh-workbench/shared';
import type { BundleChange } from '@/kernel/contract/bundle-install';
import { failureCode, failureReason } from '../market/add-module-text';

const SHIPPED: readonly string[] = ['applied', 'restart-required', 'overridden'];

export function changeOf(value: unknown): BundleChange | undefined {
  const change = (value as { readonly change?: unknown } | null | undefined)?.change;
  if (typeof change !== 'object' || change === null) return undefined;
  return typeof (change as BundleChange).application === 'string' ? (change as BundleChange) : undefined;
}

export function changeFailure(change: BundleChange | undefined, t: Translate): string | undefined {
  if (change === undefined || SHIPPED.includes(change.application)) return undefined;
  return failureReason(failureCode(change), change.application, t);
}
