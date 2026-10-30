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

export function workspacesRoot(): string {
  return join(workbenchRoot(), 'workspaces');
}
