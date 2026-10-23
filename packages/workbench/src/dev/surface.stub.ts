import type { DevSurface } from './surface-types';

const noop = (): undefined => undefined;

export const devSurface: DevSurface = {
  on: () => false,
  crash: () => false,
  useBoard: ({ all }) => ({ shape: { kind: 'real' }, seed: all, strip: () => null, mode: false }),
  useStrips: () => ({
    pick: { enabled: false, active: null, current: undefined, nonce: 0, index: 0, pick: noop },
    current: undefined,
    enabled: false,
    strip: null,
  }),
  addModuleState: (base) => base,
  gateStrip: () => null,
  kitModule: null,
};
