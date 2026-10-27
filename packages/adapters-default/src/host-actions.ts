import type { HostActions } from '@dsh-workbench/shared/host';
import {
  configSyncAction,
  configSyncHandler,
  profileCreateAction,
  profileCreateHandler,
} from '@dsh-workbench/adapter-profile';

export function createHostActions(): HostActions {
  return { configSyncAction, configSyncHandler, profileCreateAction, profileCreateHandler };
}
