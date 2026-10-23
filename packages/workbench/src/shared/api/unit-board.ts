import type { ApiError, CapabilityPayload, GateMode, ModuleBlocker, UnitBlockers, UnitGate } from '@dsh-workbench/shared';

export function gateOf(capability: CapabilityPayload | null, mode: GateMode): UnitGate {
  if (mode === 'none') return { gated: true };
  if (capability === null) return { gated: true };
  return { gated: capability.status === 'ok' || capability.status === 'unchecked' };
}

export function splitBlocker(candidates: readonly (ModuleBlocker | undefined)[]): UnitBlockers {
  let blocker: ModuleBlocker | undefined;
  let notice: ModuleBlocker | undefined;
  for (const candidate of candidates) {
    if (candidate === undefined) continue;
    if (candidate.severity === 'block') {
      blocker ??= candidate;
      continue;
    }
    notice ??= candidate;
  }
  return {
    ...(blocker === undefined ? {} : { blocker }),
    ...(blocker !== undefined || notice === undefined ? {} : { notice }),
  };
}

export function probeKeyOf(error: ApiError | undefined): string | null {
  if (error === undefined) return null;
  return error.code === '' ? 'unknown' : error.code;
}
