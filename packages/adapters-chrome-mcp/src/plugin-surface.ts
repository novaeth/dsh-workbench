import type { PluginSurface, PluginUnitsPort } from '@dsh-workbench/shared/host';

function emptyUnits(): PluginUnitsPort {
  return {
    refresh: async () => ({ units: [] }),
    touch: () => undefined,
    report: () => ({ units: [] }),
    dispose: () => undefined,
  };
}

export function createPluginSurface(): PluginSurface {
  return {
    declarationLookup: () => () => undefined,
    createUnits: emptyUnits,
  };
}
