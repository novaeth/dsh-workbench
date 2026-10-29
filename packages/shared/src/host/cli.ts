import type { DshHostContext } from '../api/dsh.js';
import type { CliPort } from '../contract/cli.js';
import { adaptersOf } from './adapters.js';

export function cliPortOf(ctx: DshHostContext): CliPort {
  const commands = adaptersOf(ctx).runtime.commands(ctx);
  const first = Object.values(commands)[0];
  return { command: first ?? '' };
}

export function cliCommandOf(ctx: DshHostContext): string {
  return cliPortOf(ctx).command;
}
