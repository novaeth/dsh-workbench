export {
  configSyncAction,
  configSyncApply,
  configSyncHandler,
  configSyncSnapshot,
  createHostActions,
  mergeBlocks,
  normalizeBlock,
  profileCreateAction,
  profileCreateApply,
  profileCreateHandler,
  profileCreateSnapshot,
  readPatchBlocks,
  syncRows,
} from '@dsh-workbench/shared/host';
export type { ConfigSyncDeps, PatchBlock, ProfileCreateDeps } from '@dsh-workbench/shared/host';
export { patchBlocks, writePatchFile } from '@dsh-workbench/shared/host';
export {
  createRegistryNotebook,
  mergeRegistryConfig,
  normalizeRegistry,
  REGISTRY_MARKER,
  registryFailure,
  replaceScopeRegistry,
  sameRegistry,
  scopeOf,
  sourcesFromLockfile,
} from '@dsh-workbench/shared/host';
export * from './release.js';
