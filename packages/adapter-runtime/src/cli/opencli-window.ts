import { quoteShellArgFor } from '@dsh-workbench/shared/host';

export const OPENCLI_WINDOW_ENV: Readonly<Record<string, string>> = { OPENCLI_WINDOW: 'background' };

export function backgroundLine(
  command: string,
  argv: readonly string[],
  platform: NodeJS.Platform = process.platform,
): string {
  return [quoteShellArgFor(command, platform), ...argv.map((arg) => quoteShellArgFor(arg, platform))].join(' ');
}
