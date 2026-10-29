import { quoteShellArg } from '@dsh-workbench/shared/host';

export function backgroundPrefix(): readonly string[] {
  return [quoteShellArg('env'), quoteShellArg('OPENCLI_WINDOW=background')];
}

export function backgroundLine(command: string, argv: readonly string[]): string {
  return [...backgroundPrefix(), quoteShellArg(command), ...argv.map(quoteShellArg)].join(' ');
}
