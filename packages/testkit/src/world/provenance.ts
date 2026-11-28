import type { Provenance } from './types';

export function captured(hostVersion: string, at: string): Provenance {
  return { kind: 'captured', hostVersion, at };
}

export function derived(from: string, changed: readonly string[]): Provenance {
  return { kind: 'derived', from, changed };
}

export function fault(faultName: string): Provenance {
  return { kind: 'fault', fault: faultName };
}

export function transport(note: string): Provenance {
  return { kind: 'transport', note };
}
