export const DIY_FLOW_RECORD = 'plugin:workbench/diy-flow' as const;
export const DIY_FLOW_PROJECTION = 'workbenchDiyFlow' as const;

export interface DiyFlowSnapshot {
  readonly version: 1;
  readonly flow: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly step: string | null;
  readonly values: Readonly<Record<string, unknown>>;
  readonly status: 'running' | 'done' | 'stopped';
}

export interface DiyFlowJournal {
  read(session: string): DiyFlowSnapshot | null;
  write(session: string, snapshot: DiyFlowSnapshot): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseDiyFlowSnapshot(value: unknown): DiyFlowSnapshot | null {
  if (!isRecord(value)) return null;
  if (value['version'] !== 1) return null;
  const flow = value['flow'];
  const step = value['step'];
  const status = value['status'];
  if (typeof flow !== 'string' || flow === '') return null;
  if (step !== null && (typeof step !== 'string' || step === '')) return null;
  if (status !== 'running' && status !== 'done' && status !== 'stopped') return null;
  if (!isRecord(value['input']) || !isRecord(value['values'])) return null;
  return {
    version: 1,
    flow,
    input: value['input'],
    step,
    values: value['values'],
    status,
  };
}

declare module '@deepseek-ai/dsh-session' {
  interface PluginRecordMap {
    'plugin:workbench/diy-flow': DiyFlowSnapshot;
  }
}
