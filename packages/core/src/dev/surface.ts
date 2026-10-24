import { createElement as h, useMemo } from 'react';

import { MockStrip } from './MockStrip';
import { crashModeOn, mockModeOn } from '@/shared/hooks/mock-mode';
import { useFixturePick } from '@/shared/hooks/use-fixture-pick';
import { useBoardMock } from '@/app/layouts/rightbar/board-mock';
import { BoardMockStrip } from '@/app/layouts/rightbar/BoardMockStrip';
import { buildPanelMocks } from '@/app/layouts/rightbar/panel-mock';
import { buildMarketMocks } from '@/app/layouts/rightbar/market-mock';
import { ADD_MODULE_MOCKS, stateOfMock } from '@/app/layouts/market/add-module-mock';
import { fixtureRoster, fixtureSeed } from '@/app/units/fixture-unit-mock';
import { mountGateMockStrip } from '@/app/layouts/env-gate/gate-mock';
import { KIT_PREVIEW_MODULE } from '@/app/layouts/rightbar/kit-preview';
import type { BoardModule, UnitManifest } from '@dsh-workbench/shared';
import type { PreflightSnapshot } from '@dsh-workbench/shared/host';
import type { AddModuleState } from '@/app/layouts/market/use-add-module';
import type { AddModuleMock } from '@/app/layouts/market/add-module-mock';
import { installDevSurface } from '@/shared/dev-surface';
import type { DevBoard, DevPickable, DevPickOptions, DevStrips, DevStripSite, DevSurface } from '@/shared/dev-surface';

const rosterOf = (manifests: readonly UnitManifest[]): readonly UnitManifest[] => fixtureRoster(manifests);

function mocksOf(site: DevStripSite, manifests: readonly UnitManifest[]): readonly DevPickable[] {
  if (site === 'panel') return buildPanelMocks(rosterOf(manifests));
  if (site === 'market') return buildMarketMocks(rosterOf(manifests));
  return ADD_MODULE_MOCKS;
}

function useBoard(input: {
  readonly manifests: readonly UnitManifest[];
  readonly all: readonly BoardModule[];
  readonly search: string;
}): DevBoard {
  const fixtures = useBoardMock(rosterOf(input.manifests));
  const crash = crashModeOn(input.search);
  return {
    shape: fixtures.shape,
    seed: fixtureSeed(input.manifests, input.all, crash),
    strip: (show: boolean) => h(BoardMockStrip, { fixtures, show }),
    mode: mockModeOn(input.search) || crash,
  };
}

function useStrips<T extends DevPickable>(
  site: DevStripSite,
  manifests: readonly UnitManifest[],
): DevStrips<T> {
  const mocks = useMemo<readonly T[]>(() => mocksOf(site, manifests) as readonly T[], [site, manifests]);
  const options: DevPickOptions<T> = { fixtures: mocks, initial: mocks[0]?.id ?? null };
  const pick = useFixturePick<T>(options);
  return {
    pick,
    current: pick.enabled ? pick.current : undefined,
    enabled: pick.enabled,
    strip: pick.enabled
      ? h(MockStrip, {
          mocks,
          index: pick.index,
          onPick: (at: number) => pick.pick(mocks[at]?.id ?? null),
        })
      : null,
  };
}

function gateStrip(options: {
  readonly onPick: (snapshot: PreflightSnapshot | null) => void;
}): HTMLElement | null {
  return mountGateMockStrip(options);
}

function addModuleState(base: AddModuleState, mock: AddModuleMock): AddModuleState {
  return stateOfMock(base, mock);
}

export const devSurface = {
  on: (search: string): boolean => mockModeOn(search),
  crash: (search: string): boolean => crashModeOn(search),
  useBoard,
  useStrips,
  addModuleState,
  gateStrip,
  Strip: MockStrip,
  kitModule: KIT_PREVIEW_MODULE,
} as unknown as DevSurface;

installDevSurface(devSurface);
