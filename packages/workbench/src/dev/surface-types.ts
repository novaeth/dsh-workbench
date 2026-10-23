import type { ReactNode } from 'react';
import type { BoardModule, UnitManifest } from '@dsh-workbench/shared';
import type { PreflightSnapshot } from '@/shared/api/host/preflight';
import type { BoardShape } from '@/app/layouts/rightbar/board-shape';
import type { AddModuleMock } from '@/app/layouts/market/add-module-mock';
import type { AddModuleState } from '@/app/layouts/market/use-add-module';

export interface DevPickable {
  readonly id: string;
  readonly label: string;
}

export interface DevPickOptions<T extends DevPickable> {
  readonly fixtures: readonly T[];
  readonly selected?: string | null | undefined;
  readonly onSelect?: ((id: string | null) => void) | undefined;
  readonly enabled?: boolean | undefined;
  readonly initial?: string | null | undefined;
}

export interface DevPick<T extends DevPickable> {
  readonly enabled: boolean;
  readonly active: string | null;
  readonly current: T | undefined;
  readonly nonce: number;
  readonly index: number;
  pick(id: string | null): void;
}

export interface DevStrips<T extends DevPickable> {
  readonly pick: DevPick<T>;
  readonly current: T | undefined;
  readonly enabled: boolean;
  readonly strip: ReactNode;
}

export interface DevBoard {
  readonly shape: BoardShape;
  readonly seed: readonly BoardModule[];
  readonly strip: (show: boolean) => ReactNode;
  readonly mode: boolean;
}

export type DevStripSite = 'panel' | 'market' | 'addModule';

export interface DevSurface {
  on(search: string): boolean;
  crash(search: string): boolean;
  useBoard(input: {
    readonly manifests: readonly UnitManifest[];
    readonly all: readonly BoardModule[];
    readonly search: string;
  }): DevBoard;
  useStrips<T extends DevPickable>(site: DevStripSite, manifests: readonly UnitManifest[]): DevStrips<T>;
  addModuleState(base: AddModuleState, mock: AddModuleMock): AddModuleState;
  gateStrip(options: {
    readonly onPick: (snapshot: PreflightSnapshot | null) => void;
  }): HTMLElement | null;
  readonly kitModule: BoardModule | null;
}
