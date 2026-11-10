import { homedir } from 'node:os';
import { join } from 'node:path';

export function dshHome(): string {
  const configured = process.env.DSH_HOME?.trim();
  if (configured !== undefined && configured !== '') return configured;
  return join(homedir(), '.dsh');
}

export function workbenchRoot(): string {
  const configured = process.env.DSH_WORKBENCH_HOME?.trim();
  if (configured !== undefined && configured !== '') return configured;
  return join(dshHome(), 'workbench');
}

export function workbenchHostLock(): string {
  return join(workbenchRoot(), 'host.lock');
}

export function workbenchSelfUpdateMarker(): string {
  return join(workbenchRoot(), 'self-update.json');
}

export function workspacesRoot(): string {
  return join(workbenchRoot(), 'workspaces');
}
