import { useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

export interface MarketPanelScroll {
  readonly installedDetailOpen: boolean;
  readonly discoverDetailOpen: boolean;
  readonly setInstalledDetailOpen: (open: boolean) => void;
  readonly setDiscoverDetailOpen: (open: boolean) => void;
  readonly installedPanel: RefObject<HTMLDivElement | null>;
  readonly discoverPanel: RefObject<HTMLDivElement | null>;
  readonly trackInstalledScroll: () => void;
  readonly trackDiscoverScroll: () => void;
}

export function useMarketPanelScroll(): MarketPanelScroll {
  const [installedDetailOpen, setInstalledDetailOpen] = useState(false);
  const [discoverDetailOpen, setDiscoverDetailOpen] = useState(false);
  const installedPanel = useRef<HTMLDivElement>(null);
  const discoverPanel = useRef<HTMLDivElement>(null);
  const installedScroll = useRef(0);
  const discoverScroll = useRef(0);

  const trackInstalledScroll = (): void => {
    if (installedPanel.current === null || installedDetailOpen) return;
    installedScroll.current = installedPanel.current.scrollTop;
  };

  const trackDiscoverScroll = (): void => {
    if (discoverPanel.current === null || discoverDetailOpen) return;
    discoverScroll.current = discoverPanel.current.scrollTop;
  };

  useLayoutEffect(() => {
    const panel = installedPanel.current;
    if (panel === null) return;
    if (installedDetailOpen) {
      panel.scrollTop = 0;
      return;
    }
    panel.scrollTop = installedScroll.current;
  }, [installedDetailOpen]);

  useLayoutEffect(() => {
    const panel = discoverPanel.current;
    if (panel === null) return;
    if (discoverDetailOpen) {
      panel.scrollTop = 0;
      return;
    }
    panel.scrollTop = discoverScroll.current;
  }, [discoverDetailOpen]);

  return {
    installedDetailOpen,
    discoverDetailOpen,
    setInstalledDetailOpen,
    setDiscoverDetailOpen,
    installedPanel,
    discoverPanel,
    trackInstalledScroll,
    trackDiscoverScroll,
  };
}
