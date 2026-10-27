import type { MarketClaim, MarketIndex, MarketIndexEntry } from '../contract/protocol/market-index.js';

export interface PublisherIdentity {
  readonly name: string;
  readonly email?: string;
}

function foldedName(name: string): string {
  return name.replace(/\s+/gu, ' ').trim().toLowerCase();
}

export function publisherIdentityOf(text: string | undefined): PublisherIdentity | undefined {
  const raw = (text ?? '').trim();
  if (raw === '') return undefined;
  const match = /^(.*?)\s*<([^<>]*)>\s*$/u.exec(raw);
  const name = (match === null ? raw : match[1]).trim();
  const email = match === null ? '' : match[2].trim().toLowerCase();
  if (name === '') return undefined;
  return email === '' ? { name } : { name, email };
}

export function samePublisher(left: string, right: string): boolean {
  const a = publisherIdentityOf(left);
  const b = publisherIdentityOf(right);
  if (a === undefined || b === undefined) return false;
  if (a.email !== undefined && b.email !== undefined) return a.email === b.email;
  return foldedName(a.name) === foldedName(b.name);
}

export function entryOwnerOf(entry: MarketIndexEntry): string | undefined {
  const owner = (entry.owner ?? '').trim();
  if (owner !== '') return owner;
  const author = (entry.author ?? '').trim();
  return author === '' ? undefined : author;
}

export function claimOfEntry(entry: MarketIndexEntry | undefined, publisher: string | undefined): MarketClaim {
  if (entry === undefined) return { state: 'new' };
  const owner = entryOwnerOf(entry);
  if (owner === undefined) return { state: 'unowned' };
  if (publisher === undefined || publisher.trim() === '') return { state: 'unknown' };
  return samePublisher(owner, publisher) ? { state: 'owned', owner } : { state: 'conflict', owner };
}

export interface MarketClaimInput {
  readonly name: string;
  readonly publisher: string | undefined;
  readonly unit?: string | undefined;
  readonly artifactPath?: string | undefined;
}

export function marketArtifactPath(name: string): string {
  return `packages/${name}`;
}

export function entryUnitOf(entry: MarketIndexEntry): string | undefined {
  const unit = entry.metadata?.unit?.trim();
  if (unit !== undefined && unit !== '') return unit;
  for (const version of entry.versions) {
    if (version.source.type !== 'git') continue;
    const match = /^packages\/([^/]+)$/u.exec(version.source.path ?? '');
    const legacy = match?.[1];
    if (legacy !== undefined) return legacy;
  }
  return undefined;
}

export function claimOf(index: MarketIndex, input: MarketClaimInput): MarketClaim {
  const base = claimOfEntry(
    index.plugins.find((one) => one.name === input.name),
    input.publisher,
  );
  if (base.state === 'conflict' || base.state === 'unknown') return base;
  const unit = (input.unit ?? '').trim();
  if (unit !== '') {
    for (const other of index.plugins) {
      if (other.name === input.name) continue;
      if (entryUnitOf(other) !== unit) continue;
      const owner = entryOwnerOf(other);
      return { state: 'unit-taken', entry: other.name, ...(owner === undefined ? {} : { owner }) };
    }
  }
  const path = (input.artifactPath ?? '').trim();
  if (path !== '') {
    for (const other of index.plugins) {
      if (other.name === input.name) continue;
      if (!other.versions.some((one) => one.source.type === 'git' && (one.source.path ?? '') === path)) continue;
      const owner = entryOwnerOf(other);
      return { state: 'path-taken', entry: other.name, ...(owner === undefined ? {} : { owner }) };
    }
  }
  return base;
}
