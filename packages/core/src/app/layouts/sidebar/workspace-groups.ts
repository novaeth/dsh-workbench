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

export interface WorkspaceSectionOptions<T> {
  readonly rankOf?: ((item: T) => number | null) | undefined;
}

const STATEFUL_SECTION_ORDER: readonly WorkspaceSectionId[] = ['workshop', 'defaultWorkspace', 'workspaces'];

export function workspaceSections<T extends { readonly path: string; readonly title: string }>(
  items: readonly T[],
  headings: WorkspaceHeadings,
  options: WorkspaceSectionOptions<T> = {},
): readonly WorkspaceSectionPlan<T>[] {
  const workspaces: T[] = [];
  const defaults: T[] = [];
  const workshop: T[] = [];
  for (const item of items) {
    if (isWorkshopPath(item.path)) workshop.push(item);
    else if (item.title === DEFAULT_WORKSPACE_TITLE) defaults.push(item);
    else workspaces.push(item);
  }
  const rankOf = options.rankOf;
  const ordered = (rows: readonly T[]): readonly T[] =>
    rankOf === undefined
      ? rows
      : [...rows].sort((left, right) => (rankOf(left) ?? Number.POSITIVE_INFINITY) - (rankOf(right) ?? Number.POSITIVE_INFINITY));
  const special = defaults.length > 0 || workshop.length > 0;
  const sections: WorkspaceSectionPlan<T>[] = [];
  if (workspaces.length > 0) {
    sections.push({ id: 'workspaces', heading: special ? headings.workspaces : null, items: ordered(workspaces) });
  }
  if (defaults.length > 0) {
    sections.push({ id: 'defaultWorkspace', heading: headings.defaultWorkspace, items: ordered(defaults) });
  }
  if (workshop.length > 0) {
    sections.push({ id: 'workshop', heading: headings.workshop, items: ordered(workshop) });
  }
  if (rankOf === undefined) return sections;
  const sectionRank = (section: WorkspaceSectionPlan<T>): number =>
    Math.min(...section.items.map((item) => rankOf(item) ?? Number.POSITIVE_INFINITY));
  const priorityOf = (section: WorkspaceSectionPlan<T>): number => STATEFUL_SECTION_ORDER.indexOf(section.id);
  const stateful = sections.filter((section) => sectionRank(section) !== Number.POSITIVE_INFINITY);
  const idle = sections.filter((section) => sectionRank(section) === Number.POSITIVE_INFINITY);
  const orderedSections = [...stateful].sort(
    (left, right) => sectionRank(left) - sectionRank(right) || priorityOf(left) - priorityOf(right),
  );
  return [...orderedSections, ...idle];
}
