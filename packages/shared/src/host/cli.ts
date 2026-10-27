import type { DshHostContext } from '../api/dsh.js';
import type { CliPort } from '../contract/cli.js';
import { adaptersOf } from './adapters.js';

export function cliPortOf(ctx: DshHostContext): CliPort {
  return { command: adaptersOf(ctx).runtime.opencliCommand(ctx).command };
}

export function cliCommandOf(ctx: DshHostContext): string {
  return cliPortOf(ctx).command;
}
