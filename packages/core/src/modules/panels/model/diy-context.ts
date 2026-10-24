import type { DshHostContext, DshToolRunContext } from '@dsh-workbench/shared';
import { sessionWorkspace } from '@dsh-workbench/shared/host';
import { modulesIn } from '@/shared/api/host/diy-modules';
import { sessionWorkspaceOf } from '@/shared/api/host/workspace-root';
import type { BundleChange } from '@/kernel/contract/bundle-install';
import { hostSurface } from '@dsh-workbench/shared/host';
import { supplyPortOf } from '@dsh-workbench/shared/host';
import type { PanelsService } from './service';

export const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    workspace: { type: 'string' },
    modules: { type: 'array', items: { type: 'object', additionalProperties: true } },
    unit: { type: 'string' },
    path: { type: 'string' },
    install: { type: 'object', additionalProperties: true },
    alreadyInstalled: { type: 'boolean' },
    panel: { type: 'object', additionalProperties: true },
  },
  additionalProperties: true,
};

export const OUTPUT = {
  schema: OUTPUT_SCHEMA,
  render: (_args: unknown, value: unknown) => {
    const payload = value as { text?: unknown } | null;
    return [{ type: 'text', text: typeof payload?.text === 'string' ? payload.text : JSON.stringify(value) }];
  },
};

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function plainJson<T>(value: T): T {
  return structuredClone(value) as T;
}

export function verdictOf(change: BundleChange): string {
  if (change.application === 'applied') return '装好了，已生效';
  if (change.application === 'restart-required') {
    return `装好了，要${hostSurface().restartHint} 才生效（装新模块、同名重装、替换已有包都走这一支）`;
  }
  if (change.application === 'overridden') return '被更高层的声明盖住了，这次没生效';
  if (change.application === 'cancelled') return '安装被取消，没有生效';
  const tail = (change.packageResult?.output ?? '').trim().split('\n').slice(-3).join(' | ');
  return `没装上（${change.errorCode ?? 'failed'}）${tail === '' ? '' : `：${tail}`}`;
}

export function showOrReason(
  panels: PanelsService,
  unit: string,
  workspace: string | null,
): { readonly ok: boolean; readonly reason?: string } {
  try {
    panels.show(unit, workspace);
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

export async function workspaceOf(
  ctx: DshHostContext,
  exec: DshToolRunContext,
): Promise<{ readonly root: string; readonly title: string }> {
  const session = sessionWorkspace(exec);
  const found = await sessionWorkspaceOf(ctx, session);
  if (found === null) {
    throw new Error(
      `读不到这条会话的登记工作区（会话 cwd：${session ?? '(不知道)'}）` +
        '—— 先在左栏选一个工作区；DIY 的模块、面板与调试都落在那一条工作区上',
    );
  }
  return found;
}

export interface KnownUnit {
  readonly unit: string;
  readonly name: string;
  readonly description: string;
  readonly dir: string;
  readonly installed: boolean;
}

export function unitsOf(ctx: DshHostContext, root: string) {
  const supply = supplyPortOf(ctx);
  const installed = supply.profileModules(supply.profileDirOf(ctx)).map((row: { unit: string }) => row.unit) as string[];
  const modules = modulesIn(root, installed);
  const here = new Set(modules.map((one) => one.unit));
  const onlyInstalled = installed
    .filter((unit) => !here.has(unit))
    .sort((left, right) => left.localeCompare(right))
    .map(
      (unit): KnownUnit => ({ unit, name: unit, description: '', dir: '', installed: true }),
    );
  return { installed, modules, units: [...modules, ...onlyInstalled] as readonly KnownUnit[] };
}

export function modulesOf(ctx: DshHostContext, root: string) {
  const supply = supplyPortOf(ctx);
  const installed = supply.profileModules(supply.profileDirOf(ctx)).map((row: { unit: string }) => row.unit) as string[];
  return { installed, modules: modulesIn(root, installed) };
}

export function moduleDirsOf(root: string): readonly string[] {
  return modulesIn(root).map((one) => one.dir);
}

export function panelEntriesOf(panels: PanelsService, workspace: string | null) {
  try {
    return panels.list(workspace);
  } catch {
    return [];
  }
}
