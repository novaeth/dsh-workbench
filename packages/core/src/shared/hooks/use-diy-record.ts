import type { RecordState } from '@dsh-workbench/shared/host';
import { DIY_RECORD_FACT } from '@dsh-workbench/shared/contract/facts';
import { DIY_RECORD_ROUTE } from '@dsh-workbench/shared/contract/protocol/panels';
import { useHostWrite } from './use-host-write';
import type { HostWrite } from './use-host-write';
import { useApiResource } from './use-api-resource';

export { DIY_RECORD_FACT, DIY_RECORD_ROUTE };

export function useDiyRecordState(): RecordState | null {
  const read = useApiResource<{ state?: RecordState | null }>(DIY_RECORD_ROUTE, {}, 0, {
    fact: DIY_RECORD_FACT,
    report: false,
  });
  if (read.value === undefined) return null;
  return read.value.state ?? null;
}

export function useDiyRecordAct(): HostWrite<{ text?: string }> {
  return useHostWrite<{ text?: string }>({
    channel: 'diy-record',
    resource: 'act',
    networkText: '网络不通，动作没发出去',
  });
}
