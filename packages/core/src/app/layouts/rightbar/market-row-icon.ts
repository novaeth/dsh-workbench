import { createElement as h } from 'react';
import { IconBrandMark, IconModuleMark, IconNpm, IconOpencli } from '@dsh-workbench/shared';
import type { MarketRow } from './market-row-types';
import type { SharedRow } from './market-rows';

export type PackageKind = 'module' | 'plugin' | 'lib' | 'workbench';

const SIZE = 18;

export function packageIcon(kind: PackageKind) {
  switch (kind) {
    case 'module':
      return h(IconModuleMark, { size: SIZE });
    case 'plugin':
      return h(IconOpencli, { size: SIZE });
    case 'lib':
      return h(IconNpm, { size: SIZE });
    case 'workbench':
      return h(IconBrandMark, { size: SIZE });
  }
}

export function marketRowKind(row: MarketRow): PackageKind {
  if (row.workbench === true) return 'workbench';
  if (row.plugin === true) return 'plugin';
  return 'module';
}

export function sharedRowKind(row: SharedRow): PackageKind {
  return row.kind === 'plugin' ? 'plugin' : 'lib';
}

export type PackageIcon = ReturnType<typeof packageIcon>;
