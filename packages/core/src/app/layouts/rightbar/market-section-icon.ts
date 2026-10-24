import { createElement as h } from 'react';
import { IconModules } from '@/shared/components/IconModules';
import {
  IconCordisPluginOutlineRegular,
  IconDownloadOutlineRegular,
  IconLinkOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';

export type MarketSectionKind = 'installed' | 'pending' | 'plugins' | 'shared';

const SIZE = 14;

export function marketSectionIcon(kind: MarketSectionKind) {
  switch (kind) {
    case 'installed':
      return h(IconModules, { size: SIZE });
    case 'pending':
      return h(IconDownloadOutlineRegular, { size: SIZE });
    case 'plugins':
      return h(IconCordisPluginOutlineRegular, { size: SIZE });
    case 'shared':
      return h(IconLinkOutlineRegular, { size: SIZE });
  }
}

export type MarketSectionIcon = ReturnType<typeof marketSectionIcon>;
