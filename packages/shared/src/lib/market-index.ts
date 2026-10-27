import type { MarketIndexSource, MarketLocalizedText } from '../contract/protocol/market-index.js';

const BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

export function marketBranchOk(value: string): boolean {
  const branch = value.trim();
  return (
    BRANCH.test(branch) &&
    !branch.includes('..') &&
    !branch.endsWith('/') &&
    !branch.endsWith('.') &&
    !branch.includes('@{')
  );
}

export function marketText(value: MarketLocalizedText | undefined, locale: string): string {
  if (value === undefined) return '';
  const zh = value.zh ?? '';
  const en = value.en ?? '';
  return locale.toLowerCase().startsWith('zh') ? zh || en : en || zh;
}

export function marketInstallTarget(
  name: string,
  version: string,
  source: MarketIndexSource,
): { readonly spec: string; readonly registry?: string } {
  if (source.type === 'npm') {
    const registry = (source.registry ?? '').trim();
    return { spec: `${name}@${version}`, ...(registry === '' ? {} : { registry }) };
  }
  const base = `git+${source.url.trim().replace(/^git\+/, '')}#${source.commit}`;
  const path = (source.path ?? '').trim().replace(/^\/+/, '');
  return { spec: path === '' ? base : `${base}&path:/${path}` };
}

