import { compareVersions } from './release';

export type VersionVerdict =
  | 'satisfied'
  | 'unsatisfied'
  | 'malformed';

function readable(version: string): boolean {
  return compareVersions(version, '0.0.0') !== undefined;
}

function segmentsOf(version: string): number[] | undefined {
  if (!readable(version)) return undefined;
  return version.split('.').map((part) => Number.parseInt(part, 10));
}

function caretUpper(base: readonly number[]): string {
  const [major = 0, minor = 0, patch = 0] = base;
  if (major > 0) return `${major + 1}.0.0`;
  return minor > 0 ? `0.${minor + 1}.0` : `0.0.${patch + 1}`;
}

function tildeUpper(base: readonly number[]): string {
  const [major = 0, minor = 0] = base;
  return `${major}.${minor + 1}.0`;
}

function comparator(token: string, version: string): boolean | undefined {
  const match = /^(>=|<=|>|<|=|\^|~)?\s*(.+)$/.exec(token.trim());
  if (match === null) return undefined;
  const [, operator = '', raw = ''] = match;
  const base = segmentsOf(raw.trim());
  if (base === undefined) return undefined;
  const at = (other: string): number | undefined => compareVersions(version, other);
  switch (operator) {
    case '^':
      return (at(raw) ?? -1) >= 0 && (at(caretUpper(base)) ?? 1) < 0;
    case '~':
      return (at(raw) ?? -1) >= 0 && (at(tildeUpper(base)) ?? 1) < 0;
    default:
      break;
  }
  const compared = at(raw.trim());
  if (compared === undefined) return undefined;
  switch (operator) {
    case '>=':
      return compared >= 0;
    case '<=':
      return compared <= 0;
    case '>':
      return compared > 0;
    case '<':
      return compared < 0;
    case '=':
    case '':
      return compared === 0;
    default:
      return undefined;
  }
}

export function checkVersionRange(contract: string | undefined, version: string): VersionVerdict {
  const spec = contract?.trim() ?? '';
  if (spec === '') return 'satisfied';
  if (!readable(version)) return 'malformed';
  const tokens = spec.split(/\s+/).filter((token) => token !== '');
  if (tokens.length === 0) return 'satisfied';
  for (const token of tokens) {
    const verdict = comparator(token, version);
    if (verdict === undefined) return 'malformed';
    if (!verdict) return 'unsatisfied';
  }
  return 'satisfied';
}
