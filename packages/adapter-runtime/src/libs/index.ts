import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { LibNeed } from '@dsh-workbench/shared/host';
import { libInstallCommand, WorkbenchDataError } from '@dsh-workbench/shared/host';
import type { LibReader } from '@dsh-workbench/shared/host';
import type { NpmSource } from '@dsh-workbench/shared/host';

export interface LibReaderOptions {
  readonly roots?: readonly string[] | undefined;
  readonly env?: Readonly<Record<string, string | undefined>> | undefined;
}

function rootsOf(env: Readonly<Record<string, string | undefined>>): readonly string[] {
  const home = env['DSH_HOME'] ?? join(homedir(), '.dsh');
  return [
    join(home, 'workbench', 'opencli', 'libs', 'node_modules'),
    join(home, 'workbench', 'opencli', 'toolchain', 'node_modules'),
  ];
}

function entryProblem(entry: string): string | null {
  if (entry.trim() === '') return '入口是空串';
  if (entry.startsWith('/') || /^[A-Za-z]:[\\/]/u.test(entry)) return '入口不能是绝对路径';
  if (normalize(entry).split(/[\\/]/u).includes('..')) return '入口不能跳出 lib 目录';
  return null;
}

export function createLibReader(options: LibReaderOptions = {}): LibReader {
  const env = options.env ?? process.env;
  const roots = options.roots ?? rootsOf(env);

  return {
    async load<T = unknown>(need: LibNeed, entry: string): Promise<T> {
      const problem = entryProblem(entry);
      if (problem !== null) {
        throw new WorkbenchDataError('lib-path-invalid', `${need.name}: ${problem}`, {
          hint: '入口写相对路径，比如 src/utils.js',
        });
      }

      for (const root of roots) {
        const file = join(root, need.name, entry);
        if (!existsSync(file)) continue;
        return (await import(pathToFileURL(file).href)) as T;
      }

      const source = need.sources?.find((one): one is NpmSource => one.kind === 'npm');
      const hint =
        source === undefined
          ? `装它：${need.name}${need.version === undefined ? '' : `@${need.version}`}`
          : `装它：${libInstallCommand({ need, source, ...(need.version === undefined ? {} : { version: need.version }) })}`;
      throw new WorkbenchDataError('lib-missing', `没有找到 ${need.name} 的 ${entry}`, { hint });
    },
  };
}
