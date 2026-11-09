import type { LongTaskIntervention, LongTaskStatus } from '../long-task.js';

export const LONG_TASKS_ROUTE = 'long-tasks';

export interface ShellLongTaskRow {
  readonly unit: string;
  readonly id: string;
  readonly workspace: string;
  readonly target: string;
  readonly headline?: string | undefined;
  readonly status: LongTaskStatus;
  readonly step?: string | undefined;
  readonly steps?: readonly string[] | undefined;
  readonly intervention?: LongTaskIntervention | undefined;
  readonly resumable?: boolean | undefined;
  readonly loginUrl?: string | undefined;
  readonly why?: string | undefined;
  readonly session?: string | undefined;
  readonly version?: string | undefined;
  readonly url?: string | undefined;
  readonly appUrl?: string | undefined;
  readonly sha?: string | undefined;
  readonly startedAt?: string | undefined;
  readonly at?: string | undefined;
}

export interface ShellLongTasksPayload {
  readonly runs: readonly ShellLongTaskRow[];
}
