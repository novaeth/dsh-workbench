import type { LongTaskStatus } from '@dsh-workbench/shared';

export const LONG_TASKS_ROUTE = 'long-tasks';

export interface ShellLongTaskRow {
  readonly unit: string;
  readonly id: string;
  readonly workspace: string;
  readonly target: string;
  readonly status: LongTaskStatus;
  readonly session?: string | undefined;
}

export interface ShellLongTasksPayload {
  readonly runs: readonly ShellLongTaskRow[];
}
