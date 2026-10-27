import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DshShell } from '@dsh-workbench/shared';
import type {
  CommandReader,
  CommandRequest,
  CommandResult,
} from '@dsh-workbench/shared';
import { quoteShellArg, runShell } from '@dsh-workbench/shared/host';

export interface CommandReaderOptions {
  readonly shell: DshShell;
  readonly tmpRoot?: string | undefined;
}

interface TempFiles {
  readonly dir: string;
  readonly paths: readonly string[];
}

function quoteAll(argv: readonly string[]): string {
  return argv.map((arg) => quoteShellArg(arg)).join(' ');
}

function writeFiles(request: CommandRequest, tmpRoot: string): TempFiles | undefined {
  if (request.files === undefined || request.files.length === 0) return undefined;
  const dir = mkdtempSync(join(tmpRoot, 'dsh-wb-command-'));
  const paths = request.files.map((file, index) => {
    const suffix = file.suffix === undefined || file.suffix === '' ? '' : `.${file.suffix}`;
    const path = join(dir, `file-${String(index)}${suffix}`);
    writeFileSync(path, file.content, 'utf8');
    return path;
  });
  return { dir, paths };
}

export function createCommandReader(options: CommandReaderOptions): CommandReader {
  const { shell } = options;
  const tmpRoot = options.tmpRoot ?? tmpdir();

  return {
    async run(request: CommandRequest): Promise<CommandResult> {
      let temp: TempFiles | undefined;
      try {
        temp = writeFiles(request, tmpRoot);
        const argv = [...request.argv];
        if (temp !== undefined && request.appendFileArgs !== undefined) {
          for (const path of temp.paths) argv.push(request.appendFileArgs, path);
        }
        const result = await runShell(shell, quoteAll(argv), {
          ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
          ...(request.cwd === undefined ? {} : { workdir: request.cwd }),
        });
        const filePaths = temp?.paths ?? [];
        if (result.timedOut) {
          return {
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode ?? -1,
            timedOut: true,
            filePaths,
          };
        }
        return {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode ?? -1,
          timedOut: false,
          filePaths,
        };
      } catch (error) {
        return {
          stdout: '',
          stderr: String(error),
          exitCode: -1,
          timedOut: false,
          filePaths: temp?.paths ?? [],
          error: String(error),
        };
      } finally {
        if (temp !== undefined) rmSync(temp.dir, { recursive: true, force: true });
      }
    },
  };
}
