import { marketInstallTarget } from '@dsh-workbench/shared';
import type { Translate } from '@dsh-workbench/shared';
import type { MarketRow } from './market-row-types';

export interface MarketDetailFact {
  readonly labelKey: string;
  readonly value: string;
  readonly code?: boolean;
}

const DIRECT_SOURCE = /^(?:git\+|git:|github:|gitlab:|bitbucket:|https?:|ssh:|file:|link:|workspace:|\.{0,2}\/|\/)/i;

export function isDirectSourceSpec(spec: string): boolean {
  return DIRECT_SOURCE.test(spec.trim());
}

export function localPathOf(row: MarketRow): string | undefined {
  const spec = row.spec?.trim() ?? '';
  const prefixed = /^(?:link:|file:)(.+)$/i.exec(spec)?.[1]?.trim() ?? '';
  if (prefixed !== '') return prefixed;
  if (/^(?:\.{0,2}\/|\/)/.test(spec)) return spec;
  if (row.plugin === true && row.local === true) {
    const path = row.pkg?.trim() ?? '';
    if (path !== '') return path;
  }
  return undefined;
}

export function installSourceOf(
  row: MarketRow,
  t: Translate,
): { readonly text: string; readonly code: boolean } {
  if (row.local === true) {
    const path = localPathOf(row);
    if (path !== undefined) return { text: path, code: false };
    return { text: t('panels.market.detailLocalDirectory'), code: false };
  }
  const spec = row.spec?.trim() ?? '';
  if (spec !== '' && isDirectSourceSpec(spec)) return { text: spec, code: true };
  const registry = row.registry?.trim() ?? '';
  if (registry !== '') return { text: registry, code: true };
  return { text: t('panels.market.detailUnknown'), code: false };
}

export function marketDetailFacts(row: MarketRow, t: Translate): readonly MarketDetailFact[] {
  const facts: MarketDetailFact[] = [];
  const add = (labelKey: string, value: string | undefined, code = false): void => {
    if (value === undefined || value.trim() === '') return;
    facts.push({ labelKey, value, ...(code ? { code: true } : {}) });
  };
  const source = installSourceOf(row, t);
  add('panels.market.detailSource', source.text, source.code);
  if (row.plugin === true) {
    add(
      'panels.market.detailPluginName',
      row.label !== undefined && row.label !== row.pkg ? row.label : undefined,
    );
    add(
      'panels.market.detailRegistry',
      row.registry !== undefined && source.text !== row.registry ? row.registry : undefined,
      true,
    );
    add(
      'panels.market.detailInstalledAt',
      row.installedAt === undefined ? undefined : row.installedAt.slice(0, 10),
    );
  } else {
    add(
      'panels.market.detailRegistry',
      row.registry !== undefined && source.text !== row.registry ? row.registry : undefined,
      true,
    );
    add(
      'panels.market.detailSpec',
      row.spec !== undefined && source.text !== row.spec ? row.spec : undefined,
      true,
    );
    add('panels.market.detailUnit', row.workbench === true ? undefined : row.id, true);
  }
  add('panels.market.detailVersion', row.version?.installed);
  add(
    'panels.market.detailLatest',
    row.version?.latest !== undefined && row.version.latest !== row.version.installed
      ? row.version.latest
      : undefined,
  );
  if (row.market !== undefined) {
    add('panels.market.detailMarket', row.market.sourceLabel);
    if (row.market.source.type === 'git') {
      add('panels.market.detailRepository', row.market.source.url);
      add('panels.market.detailCommit', row.market.source.commit, true);
      add('panels.market.detailDirectory', row.market.source.path, true);
    }
    if (row.pkg !== undefined) {
      const target = marketInstallTarget(row.pkg, row.market.version, row.market.source);
      add('panels.market.detailUpdateSource', target.spec, true);
      add(
        'panels.market.detailUpdateVersion',
        row.version?.latest === row.market.version ? undefined : row.market.version,
      );
    }
  }
  return facts;
}
