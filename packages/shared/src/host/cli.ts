import type { DshHostContext } from '../api/dsh.js';
import type { CliPort } from '../contract/cli.js';
import { adaptersOf } from './adapters.js';

export function cliPortOf(ctx: DshHostContext): CliPort {
  return { command: adaptersOf(ctx).runtime.commands(ctx)['opencli'] ?? 'opencli' };
}

export function cliCommandOf(ctx: DshHostContext): string {
  return cliPortOf(ctx).command;
}
