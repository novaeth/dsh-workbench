import semver from 'semver';

export type VersionVerdict = 'satisfied' | 'unsatisfied' | 'malformed';

export function checkVersionRange(contract: string | undefined, version: string): VersionVerdict {
  const spec = contract?.trim() ?? '';
  if (spec === '') return 'satisfied';
  const range = semver.validRange(spec);
  if (range === null) return 'malformed';
  const parsed = semver.coerce(version);
  if (parsed === null) return 'malformed';
  return semver.satisfies(parsed, range) ? 'satisfied' : 'unsatisfied';
}
