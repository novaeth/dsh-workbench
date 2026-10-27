export function dshHome(): string {
  const configured = process.env.DSH_HOME?.trim();
  if (configured !== undefined && configured !== '') return configured;
  return `${process.env.HOME ?? ''}/.dsh`;
}

export function workbenchRoot(): string {
  const configured = process.env.DSH_WORKBENCH_HOME?.trim();
  if (configured !== undefined && configured !== '') return configured;
  return `${dshHome()}/workbench`;
}

export function workspacesRoot(): string {
  return `${workbenchRoot()}/workspaces`;
}
