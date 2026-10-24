import { DEFAULT_WORKSPACE_TITLE } from '@dsh-workbench/shared';
import { isWorkshopPath } from '@/shared/api/diy';

export type WorkspaceSectionId = 'workspaces' | 'defaultWorkspace' | 'workshop';

export interface WorkspaceHeadings {
  readonly workspaces: string;
  readonly defaultWorkspace: string;
  readonly workshop: string;
}

export interface WorkspaceSectionPlan<T> {
  readonly id: WorkspaceSectionId;
  readonly heading: string | null;
  readonly items: readonly T[];
}

export function workspaceSections<T extends { readonly path: string; readonly title: string }>(
  items: readonly T[],
  headings: WorkspaceHeadings,
): readonly WorkspaceSectionPlan<T>[] {
  const workspaces: T[] = [];
  const defaults: T[] = [];
  const workshop: T[] = [];
  for (const item of items) {
    if (isWorkshopPath(item.path)) workshop.push(item);
    else if (item.title === DEFAULT_WORKSPACE_TITLE) defaults.push(item);
    else workspaces.push(item);
  }
  const special = defaults.length > 0 || workshop.length > 0;
  const sections: WorkspaceSectionPlan<T>[] = [];
  if (workspaces.length > 0) {
    sections.push({
      id: 'workspaces',
      heading: special ? headings.workspaces : null,
      items: workspaces,
    });
  }
  if (defaults.length > 0) {
    sections.push({ id: 'defaultWorkspace', heading: headings.defaultWorkspace, items: defaults });
  }
  if (workshop.length > 0) {
    sections.push({ id: 'workshop', heading: headings.workshop, items: workshop });
  }
  return sections;
}
