import { quoteShellArg } from './shell-text.js';

const OPENCLI_WINDOW_ENV = 'OPENCLI_WINDOW=background';

export function backgroundPrefix(): readonly string[] {
  return [quoteShellArg('env'), quoteShellArg(OPENCLI_WINDOW_ENV)];
}

export function backgroundLine(command: string, argv: readonly string[]): string {
  return [...backgroundPrefix(), quoteShellArg(command), ...argv.map(quoteShellArg)].join(' ');
}
