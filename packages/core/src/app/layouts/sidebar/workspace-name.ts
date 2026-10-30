import { DEFAULT_WORKSPACE_TITLE, pathBase } from '@dsh-workbench/shared';

export const WORKSPACE_NAME_MAX = 20;

export const WORKSPACE_NAME_INPUT_MAX = WORKSPACE_NAME_MAX * 2;

export interface WorkspaceDisplayName {
  readonly dir: string;
  readonly name: string;
}

interface Named {
  readonly path: string;
  readonly title: string;
}

export function basenameOf(value: string): string {
  return pathBase(value);
}

export function displayNameOf(workspace: Named): WorkspaceDisplayName {
  const dir = basenameOf(workspace.path) || workspace.path;
  const title = workspace.title.trim();
  const custom = title !== '' && title !== dir && title !== DEFAULT_WORKSPACE_TITLE;
  return { dir, name: custom ? title : '' };
}

export function matchWorkspaces<T extends Named>(items: readonly T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [...items];
  return items.filter((workspace) => {
    const { dir, name } = displayNameOf(workspace);
    return `${dir} ${name} ${workspace.path}`.toLowerCase().includes(needle);
  });
}

export function titleFor(workspace: Named, draft: string): string {
  const trimmed = draft.trim();
  if (trimmed === '') return basenameOf(workspace.path) || workspace.path;
  return trimmed;
}

export function nameTooLong(draft: string): boolean {
  return draft.trim().length > WORKSPACE_NAME_MAX;
}
