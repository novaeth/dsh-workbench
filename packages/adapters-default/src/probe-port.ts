import type { ProbePort } from '@dsh-workbench/shared/host';
import { probeUnits, registerPreflight } from '@dsh-workbench/adapter-probe';
import { declaredPluginCommands } from '@dsh-workbench/adapter-supply';

export function createProbePort(): ProbePort {
  return { probeUnits, registerPreflight, declaredPluginCommands };
}
