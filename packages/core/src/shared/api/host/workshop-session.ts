import type {
  DshHostContext,
  DshSessionController,
  DshWorkspaceRecord,
  DshWorkspaceRegistry,
} from '@dsh-workbench/shared/host';
import { now } from '@dsh-workbench/shared/host';
import { DIY_PRESET_ID } from '@/shared/api/diy';
import { WORKSHOP_TITLE } from '@/kernel/contract/diy';
import { workshopPathOf } from './diy';

const RETRY_MS = 250;
const DEADLINE_MS = 15_000;

interface WorkshopRegistry {
  create(path: string, title?: string): Promise<DshWorkspaceRecord>;
}

export interface WorkshopSessionDeps {
  readonly registry: WorkshopRegistry;
  readonly sessions: Pick<DshSessionController, 'create'> | undefined;
}

export async function ensureWorkshopFirstSession(
  deps: WorkshopSessionDeps,
  path: string,
): Promise<boolean> {
  const workspace = await deps.registry.create(path, WORKSHOP_TITLE);
  if (deps.sessions === undefined || workspace.sessionIds.length > 0) return false;
  await deps.sessions.create({ workspaceId: workspace.id, agentPreset: DIY_PRESET_ID });
  return true;
}

function presetNotReady(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { readonly code?: unknown }).code === 'agent-preset/not-found'
  );
}

function fail(ctx: DshHostContext, error: unknown): void {
  ctx.logger?.warn?.(`[dsh-workbench] 工坊没能登记成工作区 / 首会话 —— ${String(error)}`);
}

function open(ctx: DshHostContext, path: string, createSession: boolean): void {
  const registry = ctx.get('workspaceRegistry') as Pick<DshWorkspaceRegistry, 'create'> | undefined;
  if (registry === undefined) return;
  const sessions = createSession ? (ctx.get('sessionController') as DshSessionController | undefined) : undefined;
  const deadline = now() + DEADLINE_MS;
  const attempt = (): void => {
    void ensureWorkshopFirstSession({ registry, sessions }, path).catch((error: unknown) => {
      if (presetNotReady(error) && now() < deadline) {
        setTimeout(attempt, RETRY_MS);
        return;
      }
      fail(ctx, error);
    });
  };
  attempt();
}

export function registerWorkshopSession(ctx: DshHostContext): void {
  const path = workshopPathOf(ctx);
  if (path === null) return;
  ctx.inject(['workspaceRegistry'], (scoped) => open(scoped, path, false));
  ctx.inject(['workspaceRegistry', 'sessionController'], (scoped) => open(scoped, path, true));
}
