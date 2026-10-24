import { dirname } from 'node:path';
import type { DshHostContext, DshWorkspaceRecord, DshWorkspaceRegistry } from '@dsh-workbench/shared';

export interface SessionWorkspace {
  readonly root: string;
  readonly title: string;
}

async function resolveAt(registry: DshWorkspaceRegistry, dir: string): Promise<DshWorkspaceRecord | undefined> {
  try {
    return await registry.resolveByPath(dir);
  } catch {
    return undefined;
  }
}

export async function sessionWorkspaceOf(
  ctx: DshHostContext,
  workspace: string | null,
): Promise<SessionWorkspace | null> {
  const start = typeof workspace === 'string' ? workspace.trim() : '';
  if (start === '') return null;
  const registry = ctx.get<DshWorkspaceRegistry>('workspaceRegistry');
  if (registry === undefined) return null;
  let dir = start;
  for (;;) {
    const hit = await resolveAt(registry, dir);
    if (hit !== undefined) return { root: hit.path, title: hit.title };
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
