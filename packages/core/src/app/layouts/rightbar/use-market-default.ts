import { useState } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { useHostWrite } from '@/shared/hooks/use-host-write';
import { machineBoardSignature, useBoardSettle } from './panel-write';

export interface MarketDefaultSeat {
  readonly pending: boolean;
  setDefault(id: string, next: boolean): Promise<void>;
}

export function useMarketDefault(input: {
  readonly t: Translate;
  readonly mocked: boolean;
  readonly defaults: readonly string[];
  readonly changed: Readonly<Record<string, number>>;
  readonly setNotice: (next: string | null) => void;
}): MarketDefaultSeat {
  const { t, mocked, defaults, changed, setNotice } = input;
  const boardWrite = useHostWrite<unknown>({
    channel: 'prefs',
    resource: 'panels',
    networkText: t('panels.failed'),
  });
  const [writing, setWriting] = useState(false);
  const settle = useBoardSettle(machineBoardSignature(defaults, changed));

  const setDefault = async (id: string, next: boolean): Promise<void> => {
    if (mocked) return;
    setWriting(true);
    settle.begin();
    const outcome = await boardWrite.send({ action: next ? 'show' : 'hide', id, scope: 'machine' });
    setWriting(false);
    if (!outcome.ok) {
      settle.clear();
      setNotice(t('panels.failed'));
    }
  };

  return { pending: writing || settle.pending, setDefault };
}
