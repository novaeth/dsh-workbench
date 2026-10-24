import type {
  BoardShape,
  DevBoard,
  DevPick,
  DevPickable,
  DevPickOptions,
  DevStrips,
  DevStripSite,
  DevSurface,
  FixtureStripProps,
} from './types';
import type { UnitManifest } from '@dsh-workbench/shared';

const noop = (): undefined => undefined;

function noopPick<T extends DevPickable>(): DevPick<T> {
  return {
    enabled: false,
    active: null,
    current: undefined,
    nonce: 0,
    index: 0,
    pick: noop,
  };
}

export function createNoopDevSurface(): DevSurface {
  return {
    on: () => false,
    crash: () => false,
    useBoard: ({ all }) => ({ shape: { kind: 'real' }, seed: all, strip: () => null, mode: false }),
    useStrips: <T extends DevPickable>(_site: DevStripSite, _manifests: readonly UnitManifest[]) =>
      ({
        pick: noopPick<T>(),
        current: undefined,
        enabled: false,
        strip: null,
      }) as DevStrips<T>,
    addModuleState: (base) => base,
    gateStrip: () => null,
    Strip: () => null,
    kitModule: null,
  };
}

let current = createNoopDevSurface();

export function installDevSurface(next: DevSurface): void {
  current = next;
}

export { type BoardShape, type DevBoard, type DevPick, type DevPickable, type DevPickOptions, type DevStrips, type DevStripSite, type DevSurface, type FixtureStripProps };

export const devSurface: DevSurface = {
  on: (search) => current.on(search),
  crash: (search) => current.crash(search),
  useBoard: (input) => current.useBoard(input),
  useStrips: (site, manifests) => current.useStrips(site, manifests),
  addModuleState: (base, mock) => current.addModuleState(base, mock),
  gateStrip: (options) => current.gateStrip(options),
  get Strip() {
    return current.Strip;
  },
  get kitModule() {
    return current.kitModule;
  },
};
