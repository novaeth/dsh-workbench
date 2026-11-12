import type { DshHostContext } from '@dsh-workbench/shared/host';
import type { ModulePort } from '@dsh-workbench/shared/host';
import { workbenchSelfUpdateMarker } from '@dsh-workbench/shared/host';
import { basename } from 'node:path';
import { warn } from './host-args';
import { readSelfUpdateMarker } from './self-update-marker';

export interface SelfUpdateResumeInput {
  readonly supply: Pick<ModulePort, 'startSelfUpdate'> | undefined;
  readonly home: string;
  readonly profileDir: string | null;
}

export function resumeQueuedSelfUpdate(ctx: DshHostContext, input: SelfUpdateResumeInput): boolean {
  if (input.supply === undefined || input.profileDir === null || input.profileDir === '') return false;
  const marker = readSelfUpdateMarker(workbenchSelfUpdateMarker());
  if (marker.state !== 'queued' || marker.pkg === undefined) return false;
  const started = input.supply.startSelfUpdate(
    {
      dshHome: input.home,
      profile: basename(input.profileDir),
      pkg: marker.pkg,
      from: marker.from ?? '',
      to: marker.to ?? '',
      pinned: false,
    },
    (message) => warn(ctx, message),
  );
  return started.started;
}
