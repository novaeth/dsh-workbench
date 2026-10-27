import { join } from 'node:path';
import { execa } from 'execa';
import { PLUGIN_ID } from '@dsh-workbench/shared/host';
import type { ProfilePackage } from '@dsh-workbench/shared/host';
import {
  migrateWorkbench,
  type MigrationRunInput,
  type MigrationRunResult,
} from '@/shared/api/host/migrate-workbench';
import { dismissFollowUp } from '@/shared/api/host/follow-up-dismiss';

export interface WorkbenchFollowUpDeps {
  readonly dshHome: (() => string) | undefined;
  readonly profileName: (() => string | null) | undefined;
  readonly workbench: ((pkg: string) => ProfilePackage | undefined) | undefined;
  readonly runMigration?: ((input: MigrationRunInput) => Promise<MigrationRunResult>) | undefined;
}

export interface WorkbenchFollowUpActions {
  migrateWorkbench(): Promise<{ readonly added: number; readonly files: number }>;
  dismissFollowUp(id: string): Promise<void>;
}

export function createWorkbenchFollowUps(deps: WorkbenchFollowUpDeps): WorkbenchFollowUpActions {
  const runMigration =
    deps.runMigration ??
    (async (input) => {
      const result = await execa(process.execPath, [input.script, '--migrate', '--force'], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ...input.env },
        reject: false,
        timeout: 120_000,
      });
      return { exitCode: result.exitCode ?? 1, stdout: result.stdout, stderr: result.stderr };
    });

  function homeAndProfile(): { readonly home: string; readonly profile: string } {
    if (deps.dshHome === undefined || deps.profileName === undefined) {
      throw new Error('拿不到 DSH_HOME 或 profile 名字 —— 这一步做不了。');
    }
    const home = deps.dshHome();
    const profile = deps.profileName();
    if (profile === null || profile === '') throw new Error('拿不到 profile 名字 —— 这一步做不了。');
    return { home, profile };
  }

  return {
    async migrateWorkbench() {
      const { home, profile } = homeAndProfile();
      const read = deps.workbench?.(PLUGIN_ID);
      if (read === undefined) throw new Error(`读不到 profile 里装的 ${PLUGIN_ID} —— 迁移做不了。`);
      return migrateWorkbench({ home, profile, pkg: read.pkg, run: runMigration });
    },

    async dismissFollowUp(id) {
      const { home, profile } = homeAndProfile();
      dismissFollowUp(process.env.DSH_WORKBENCH_HOME ?? join(home, profile), id);
    },
  };
}
