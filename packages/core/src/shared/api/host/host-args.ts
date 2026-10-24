import type { DshHostContext } from '@dsh-workbench/shared';

export function asArgs(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null ? (value as Readonly<Record<string, unknown>>) : {};
}

export function warn(ctx: DshHostContext, message: string): void {
  ctx.logger?.warn?.(`[dsh-workbench] ${message}`);
}
