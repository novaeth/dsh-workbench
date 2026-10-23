import type { UnitEnvNeeds, UnitLibNeed, UnitManifest } from '@dsh-workbench/shared';
import { libsPrefix, pluginRetentionOf, quoteShellArg } from '@dsh-workbench/shared/host';
import type { UnitCapability } from '@/shared/api/host/probe-units';
import { pluginKeptOf, pluginKeptText, type PluginKept, type PluginReferences } from './plugin-actions';
import type { PluginLedger } from './plugin-ledger';

export interface EnvDropper {
  usersOf(plugin: string, except?: string): string[];
  drop(unit: string, env: UnitEnvNeeds | undefined, before: UnitCapability): Promise<string[]>;
}

export function createEnvDropper(options: {
  readonly catalog: () => readonly UnitManifest[];
  readonly isReleased?: ((unit: string) => boolean) | undefined;
  readonly ledger?: PluginLedger | undefined;
  readonly references?: (() => PluginReferences) | undefined;
  readonly command: string;
  readonly run: (line: string, optional?: boolean) => Promise<void>;
  readonly logger?: { info?(message: string): void; warn?(message: string): void } | undefined;
}): EnvDropper {
  const { catalog, isReleased, ledger, command, run, logger } = options;

  function referencesOf(): PluginReferences {
    return options.references?.() ?? { trustworthy: false, unreadable: [] };
  }

  function usersOf(plugin: string, except?: string): string[] {
    return catalog()
      .filter(
        (item) =>
          item.id !== except &&
          !(isReleased?.(item.id) ?? false) &&
          (item.env?.plugins ?? []).some((need) => need.name === plugin),
      )
      .map((item) => item.id);
  }

  function libUsersOf(need: UnitLibNeed, unit: string): string[] {
    return catalog()
      .filter(
        (item) =>
          item.id !== unit &&
          !(isReleased?.(item.id) ?? false) &&
          (item.env?.libs ?? []).some((other) => other.name === need.name),
      )
      .map((item) => item.id);
  }

  return {
    usersOf,

    async drop(unit, env, before) {
      const kept = new Set<string>();
      const onMachine = new Set(
        (before.plugins ?? []).filter((state) => state.status !== 'missing').map((state) => state.name),
      );
      const unknown = before.plugins === undefined;

      for (const need of env?.plugins ?? []) {
        const users = usersOf(need.name, unit);
        const held = ledger?.heldAsPlugin(need.name) !== undefined;
        const retention = pluginRetentionOf({
          held,
          claimedBy: users,
          trustworthy: referencesOf().trustworthy,
        });
        if (retention !== 'remove') {
          for (const id of users) kept.add(id);
          const reason: PluginKept = pluginKeptOf(retention, {
            by: users,
            unreadable: referencesOf().unreadable,
          });
          logger?.info?.(`[dsh-workbench] ${pluginKeptText(reason)}`);
          continue;
        }
        if (!unknown && !onMachine.has(need.name)) continue;
        await run(`${quoteShellArg(command)} plugin uninstall ${quoteShellArg(need.name)}`);
      }

      for (const need of env?.libs ?? []) {
        const keepers = libUsersOf(need, unit);
        if (keepers.length > 0) {
          for (const id of keepers) kept.add(id);
          continue;
        }
        const present = (before.libs ?? []).some(
          (state) => state.name === need.name && state.status !== 'missing',
        );
        if (before.libs !== undefined && !present) continue;
        await run(`npm uninstall --prefix ${quoteShellArg(libsPrefix())} ${quoteShellArg(need.name)}`, true);
      }

      return [...kept];
    },
  };
}
