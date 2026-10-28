import type { HostActions } from '@dsh-workbench/shared/host';
import { configSyncAction, configSyncHandler } from './config-sync.js';
import { profileCreateAction, profileCreateHandler } from './profile-create.js';

export function createHostActions(): HostActions {
  return { configSyncAction, configSyncHandler, profileCreateAction, profileCreateHandler };
}
