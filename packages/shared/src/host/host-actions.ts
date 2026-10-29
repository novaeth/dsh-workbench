import type { HostActions } from './port-types.js';
import { configSyncAction, configSyncHandler } from './config-sync.js';
import { profileCreateAction, profileCreateHandler } from './profile-create.js';

export function createHostActions(): HostActions {
  return { configSyncAction, configSyncHandler, profileCreateAction, profileCreateHandler };
}
