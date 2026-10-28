import type { ProbePort } from '@dsh-workbench/shared/host';
import { probeUnits } from './probe-units.js';
import { registerPreflight } from './preflight-route.js';
import { declaredPluginCommands } from '@dsh-workbench/adapter-supply';

export function createProbePort(): ProbePort {
  return { probeUnits, registerPreflight, declaredPluginCommands };
}
