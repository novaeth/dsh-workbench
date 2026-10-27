import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface MigrationRunInput {
  readonly script: string;
  readonly env: Readonly<Record<string, string>>;
}

export interface MigrationRunResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface MigrateWorkbenchInput {
  readonly home: string;
  readonly profile: string;
  readonly pkg: string;
  readonly run: (input: MigrationRunInput) => Promise<MigrationRunResult>;
}

export interface MigrateWorkbenchResult {
  readonly added: number;
  readonly files: number;
}

export async function migrateWorkbench(input: MigrateWorkbenchInput): Promise<MigrateWorkbenchResult> {
  const script = join(
    input.home,
    'profiles',
    input.profile,
    'node_modules',
    input.pkg,
    'scripts',
    'share-data-root.mjs',
  );
  if (!existsSync(script)) throw new Error(`找不到迁移脚本（${script}）—— 这一份没装全？`);
  const runtimeRoot = process.env.DSH_WORKBENCH_HOME ?? join(input.home, input.profile);
  const result = await input.run({
    script,
    env: { DSH_HOME: input.home, WORKBENCH_PROFILE: input.profile, DSH_WORKBENCH_HOME: runtimeRoot },
  });
  if (result.exitCode !== 0) {
    const tail = (result.stderr || result.stdout).trim().split('\n').slice(-6).join('\n');
    throw new Error(`迁移没成（退出码 ${result.exitCode}）${tail === '' ? '' : `：${tail}`}`);
  }
  const added = Number.parseInt(/新增\s+(\d+)\s+个项目/.exec(result.stdout)?.[1] ?? '0', 10);
  const files = Number.parseInt(/补了\s+(\d+)\s+个文件/.exec(result.stdout)?.[1] ?? '0', 10);
  return { added, files };
}
