import type { DebugState } from '@dsh-workbench/shared/host';
import { DIY_DEBUG_FACT } from '@dsh-workbench/shared/contract/facts';
import { DIY_DEBUG_ROUTE } from '@dsh-workbench/shared/contract/protocol/panels';
import { useHostWrite } from './use-host-write';
import type { HostWrite } from './use-host-write';
import { useApiResource } from './use-api-resource';

export { DIY_DEBUG_FACT, DIY_DEBUG_ROUTE };

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
