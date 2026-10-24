import { useEffect, useState } from 'react';
import { longTaskPollMs } from '@dsh-workbench/shared';

import {
  LONG_TASKS_ROUTE,
  type ShellLongTaskRow,
  type ShellLongTasksPayload,
} from '@/kernel/contract/long-tasks';
import { useApiResource } from './use-api-resource';

export function useShellLongTasks(): readonly ShellLongTaskRow[] {
  const [tick, setTick] = useState(0);
  const state = useApiResource<ShellLongTasksPayload>(LONG_TASKS_ROUTE, {}, tick);
  const runs = state.value?.runs ?? [];
  const every = longTaskPollMs(runs.length > 0);
  useEffect(() => {
    const timer = setInterval(() => setTick((count) => count + 1), every);
    return () => clearInterval(timer);
  }, [every]);
  return runs;
}
