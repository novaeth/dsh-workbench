import type { InstalledWorkbenchModule } from './market-rows';
import type { InstalledPlugin } from '@/shared/api/installed-plugins';
import type { UnitManifest } from '@dsh-workbench/shared';
import type { MarketRowAction, ModuleUpdateMap } from './market-rows';
import type { MarketFailure } from './market-row-types';
import type { CapabilityMap } from '@/shared/hooks/use-capabilities';
import type { MarketState } from './market-rows';
import type { WorkbenchSelfUpdate, WorkbenchVersion } from '@/kernel/contract/bundle-install';

export interface MarketMockExpect {
  readonly rows: number;
  readonly state?: MarketState;
  readonly actions?: readonly MarketRowAction[];
  readonly titleChars?: number;
  readonly shared?: number;
  readonly installed?: number;
  readonly installedState?: MarketState;
  readonly installedActions?: readonly MarketRowAction[];
  readonly installedNote?: boolean;
  readonly installedHint?: string;
  readonly sharedActions?: readonly MarketRowAction[];
  readonly plugins?: number;
  readonly pluginActions?: readonly MarketRowAction[];
  readonly pluginNote?: boolean;
  readonly pluginNoteKey?: 'panels.market.pluginBroken';
  readonly pluginState?: MarketState;
  readonly local?: boolean;
  readonly noteKey?: 'panels.market.needCommands';
  readonly version?: { readonly installed?: string; readonly latest?: string };
  readonly workbenchState?: MarketState;
  readonly workbenchActions?: readonly MarketRowAction[];
  readonly workbenchLocal?: boolean;
}

export interface MarketMock {
  readonly id: string;
  readonly label: string;
  readonly manifests: readonly UnitManifest[];
  readonly capabilities: CapabilityMap | null;
  readonly pending?: { readonly id: string; readonly action: MarketRowAction };
  readonly updates?: ModuleUpdateMap;
  readonly installed?: readonly InstalledWorkbenchModule[];
  readonly workbench?: WorkbenchVersion;
  readonly selfUpdate?: WorkbenchSelfUpdate;
  readonly installedRead?: boolean;
  readonly plugins?: readonly InstalledPlugin[];
  readonly loaded?: boolean;
  readonly confirming?: string;
  readonly failure?: MarketFailure;
  readonly expect: MarketMockExpect;
}
