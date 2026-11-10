import type { BootRecord } from '@dsh-workbench/shared/host';

export type SelfUpdateBootRecord = BootRecord;

export { readBootRecord, writeBootRecord } from '@dsh-workbench/shared/host';

export type BootVerdict = 'confirmed' | 'wrong-version' | 'half-down' | 'waiting' | 'no-boot';

function millis(at: string): number {
  const value = Date.parse(at);
  return Number.isFinite(value) ? value : Number.NaN;
}

function fresh(record: SelfUpdateBootRecord | undefined, since: string): boolean {
  if (record === undefined) return false;
  const at = millis(record.at);
  return Number.isFinite(at) && at >= millis(since);
}

export function bootVerdict(input: {
  readonly target: string;
  readonly since: string;
  readonly boot: SelfUpdateBootRecord | undefined;
  readonly up: SelfUpdateBootRecord | undefined;
  readonly now: string;
  readonly graceMs: number;
}): BootVerdict {
  if (input.up !== undefined && input.up.version === input.target && fresh(input.up, input.since)) {
    return 'confirmed';
  }
  if (!fresh(input.boot, input.since)) return 'no-boot';
  const boot = input.boot as SelfUpdateBootRecord;
  if (boot.version !== input.target) return 'wrong-version';
  const waited = millis(input.now) - millis(boot.at);
  return Number.isFinite(waited) && waited >= input.graceMs ? 'half-down' : 'waiting';
}

export function bootRollsBack(verdict: BootVerdict): verdict is 'wrong-version' | 'half-down' {
  return verdict === 'wrong-version' || verdict === 'half-down';
}
