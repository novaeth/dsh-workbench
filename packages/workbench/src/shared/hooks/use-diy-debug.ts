import type { DebugState } from '@dsh-workbench/shared/host';
import { useHostWrite } from './use-host-write';
import type { HostWrite } from './use-host-write';
import { useApiResource } from './use-api-resource';

export const DIY_DEBUG_ROUTE = 'panels/diy-debug';
export const DIY_DEBUG_FACT = 'diy-debug';

export function useDiyDebugState(): DebugState | null {
  const read = useApiResource<{ state?: DebugState | null }>(DIY_DEBUG_ROUTE, {}, 0, {
    fact: DIY_DEBUG_FACT,
    report: false,
  });
  if (read.value === undefined) return null;
  return read.value.state ?? null;
}

export function useDiyDebugAct(): HostWrite<{ text?: string }> {
  return useHostWrite<{ text?: string }>({
    channel: 'diy-debug',
    resource: 'act',
    networkText: '网络不通，动作没发出去',
  });
}
