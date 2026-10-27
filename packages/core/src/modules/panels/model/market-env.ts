import type { Need, NeedState, UnitCapability, UnitManifest } from '@dsh-workbench/shared/host';
import { buildSupplyIndex, needsOf, pluginRetentionOf, quoteShellArg } from '@dsh-workbench/shared/host';
import { libsPrefix } from '@dsh-workbench/shared/host';
import { pluginKeptOf, pluginKeptText, type PluginKept, type PluginReferences } from './plugin-actions';
import type { PluginLedger } from './plugin-ledger';

export interface EnvDropper {
  usersOf(plugin: string, except?: string): string[];
  drop(unit: string, needs: readonly Need[] | undefined, before: UnitCapability): Promise<string[]>;
}

function stateOf(before: UnitCapability, kind: NeedState['kind'], name: string): NeedState | undefined {
  return before.needs.find((item) => item.kind === kind && item.name === name);
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
          needsOf(item).some((need) => need.kind === 'extension' && need.name === plugin),
      )
      .map((item) => item.id);
  }

  function libUsersOf(name: string, unit: string): string[] {
    return catalog()
      .filter(
        (item) =>
          item.id !== unit &&
          !(isReleased?.(item.id) ?? false) &&
          needsOf(item).some((need) => need.kind === 'lib' && need.name === name),
      )
      .map((item) => item.id);
  }

  return {
    usersOf,

    async drop(unit, needs, before) {
      const kept = new Set<string>();
      const index = buildSupplyIndex(
        catalog()
          .filter((item) => options.isReleased?.(item.id) !== true)
          .map((item) => ({ id: item.id, needs: needsOf(item) })),
        { env: process.env },
      );
      const extensions = (needs ?? []).filter((need) => need.kind === 'extension');
      const libs = (needs ?? []).filter((need) => need.kind === 'lib');
      const onMachine = new Set(
        before.needs
          .filter((state) => state.kind === 'extension' && state.status !== 'missing')
          .map((state) => state.name),
      );
      const unknown = !before.needs.some((state) => state.kind === 'extension');

      for (const need of extensions) {
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
        if (index.entryOf('extension', need.name)?.conflicted === true) {
          logger?.warn?.(`[dsh-workbench] ${need.name} 的来源声明有冲突，按插件名卸`);
        }
        await run(`${quoteShellArg(command)} plugin uninstall ${quoteShellArg(need.name)}`);
      }

      for (const need of libs) {
        const keepers = libUsersOf(need.name, unit);
        if (keepers.length > 0) {
          for (const id of keepers) kept.add(id);
          continue;
        }
        const state = stateOf(before, 'lib', need.name);
        const present = state !== undefined && state.status !== 'missing';
        if (state !== undefined && !present) continue;
        if (index.entryOf('lib', need.name)?.conflicted === true) {
          logger?.warn?.(`[dsh-workbench] ${need.name} 的来源声明有冲突，按库名卸`);
        }
        await run(`npm uninstall --prefix ${quoteShellArg(libsPrefix())} ${quoteShellArg(need.name)}`, true);
      }

      return [...kept];
    },
  };
}
