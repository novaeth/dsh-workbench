import type { DshShell } from '@dsh-workbench/shared';
import { pluginRetentionOf, quoteShellArg, type PluginLedgerEntry } from '@dsh-workbench/shared/host';
import { requireSupply, type PluginSourceCommand, type SupplyPort } from '@dsh-workbench/shared/host';
import { sourceProblemText } from './market-dependency';
import { pluginNameOf, type PluginFiles } from './plugin-name';
import type { PluginLedger } from './plugin-ledger';

export type PluginKept =
  | { readonly kind: 'held' }
  | { readonly kind: 'claimed'; readonly by: readonly string[] }
  | { readonly kind: 'unsure'; readonly unreadable: readonly string[] }
  | { readonly kind: 'unnamed' };

export interface PluginUninstallOutcome {
  readonly removed: boolean;
  readonly name?: string;
  readonly kept?: PluginKept;
}

export interface PluginUpdateOutcome {
  readonly name?: string;
}

export interface PluginReferences {
  readonly trustworthy: boolean;
  readonly unreadable: readonly string[];
}

export function pluginKeptOf(
  retention: 'keep-held' | 'keep-claimed' | 'keep-unsure',
  detail: { readonly by: readonly string[]; readonly unreadable: readonly string[] },
): PluginKept {
  if (retention === 'keep-held') return { kind: 'held' };
  if (retention === 'keep-unsure') return { kind: 'unsure', unreadable: [...detail.unreadable] };
  return { kind: 'claimed', by: [...detail.by] };
}

export function pluginKeptText(kept: PluginKept): string {
  if (kept.kind === 'held') return '文件留着：你自己装的那一份，模块放手不动它。';
  if (kept.kind === 'unnamed') return '文件先留着：看不出这是哪个插件，说不准谁在用它。';
  if (kept.kind === 'unsure') {
    return kept.unreadable.length === 0
      ? '文件先留着：说不准还有谁在用它。'
      : `文件先留着：${kept.unreadable.join('、')} 读不出来用了什么，说不准它们在用它。`;
  }
  return `文件留着：${kept.by.join('、')} 还要用它。`;
}

export function pluginRemovedText(pkg: string): string {
  return `「${pkg}」卸载干净了：没人再用它，文件也删了。`;
}

export function pluginSweptText(pkg: string): string {
  return `清掉了 ${pkg}：先前要它的都放手了，也没别人在用，文件跟着删了。`;
}

export interface PluginActions {
  update(pkg: string): Promise<PluginUpdateOutcome>;
  uninstall(pkg: string): Promise<PluginUninstallOutcome>;
  sweep(claimedBy?: (plugin: string) => readonly string[]): Promise<readonly string[]>;
}

export function createPluginActions(options: {
  readonly ledger?: PluginLedger | undefined;
  readonly shell?: DshShell | undefined;
  readonly command: string;
  readonly runAll: (commands: readonly PluginSourceCommand[]) => Promise<void>;
  readonly claimedBy?: ((plugin: string) => readonly string[]) | undefined;
  readonly references?: (() => PluginReferences) | undefined;
  readonly logger?: { info?(message: string): void; warn?(message: string): void } | undefined;
  readonly supply?: SupplyPort | undefined;
}): PluginActions {
  const { ledger, shell, command, runAll, logger } = options;
  const supply = options.supply ?? requireSupply();
  const pluginFilesOf = (): PluginFiles | undefined => {
    const dir = supply.vendorPluginsDir?.();
    const manifest = supply.pluginManifestFile?.();
    return dir === undefined || manifest === undefined ? undefined : { dir, manifest };
  };

  function requireLedger(): PluginLedger {
    if (ledger === undefined) throw new Error('这个市场没有台账（插件记录），用户装的插件动不了。');
    return ledger;
  }

  function requireHeld(pkg: string): { readonly entry: PluginLedgerEntry; readonly key: string } {
    const held = requireLedger();
    const direct = held.read(pkg);
    if (direct !== undefined) return { entry: direct, key: direct.package };
    const named = held.heldAsPlugin(pkg);
    if (named !== undefined) return { entry: named, key: named.package };
    const known = held.list().map((entry) => entry.name ?? entry.package);
    throw new Error(
      `台账里没有「${pkg}」这一笔（包名与插件名都认）—— 你装的插件有：${known.join('、') || '（空）'}`,
    );
  }

  function referencesOf(): PluginReferences {
    return options.references?.() ?? { trustworthy: false, unreadable: [] };
  }

  type PluginDecision =
    | { readonly act: 'remove'; readonly plugin: string }
    | { readonly act: 'keep'; readonly kept: PluginKept; readonly plugin?: string };

  function decide(
    entry: PluginLedgerEntry,
    held: boolean,
    claimedBy?: (plugin: string) => readonly string[],
  ): PluginDecision {
    const plugin = pluginNameOf(entry, pluginFilesOf());
    if (plugin === undefined) return { act: 'keep', kept: { kind: 'unnamed' } };
    const refs = referencesOf();
    const by = claimedBy?.(plugin) ?? options.claimedBy?.(plugin) ?? [];
    const retention = pluginRetentionOf({ held, claimedBy: by, trustworthy: refs.trustworthy });
    if (retention === 'remove') return { act: 'remove', plugin };
    return { act: 'keep', kept: pluginKeptOf(retention, { by, unreadable: refs.unreadable }), plugin };
  }

  async function removeFiles(plugin: string): Promise<void> {
    if (shell === undefined) throw new Error('没有执行缝（shell 服务不可用），删不掉插件文件。');
    await runAll([{ line: `${quoteShellArg(command)} plugin uninstall ${quoteShellArg(plugin)}` }]);
  }

  return {
    async update(pkg) {
      const { entry } = requireHeld(pkg);
      if (entry.local === true || entry.registry === undefined) {
        throw new Error(`「${entry.package}」是从本地装的，没有地方查新版。`);
      }
      if (shell === undefined) throw new Error('没有执行缝（shell 服务不可用），更新做不了。');
      const latest = await supply.latestVersion({
        shell,
        name: entry.package,
        registry: entry.registry,
        force: true,
      });
      if (latest === undefined) throw new Error(`问不到「${entry.package}」的新版本。`);
      const plan = supply.pluginInstallPlan({
        spec: `${entry.package}@${latest}`,
        command,
        registry: entry.registry,
        ...(entry.name === undefined ? {} : { pluginName: entry.name }),
      });
      if (!plan.ok) throw new Error(sourceProblemText(plan.problem, plan.env));
      await runAll(plan.commands);
      logger?.info?.(`[dsh-workbench] 把 ${entry.package} 更新到 ${latest}`);
      return { name: pluginNameOf(entry, pluginFilesOf()) ?? entry.name ?? entry.package };
    },

    async uninstall(pkg) {
      const ledger = requireLedger();
      const { entry, key } = requireHeld(pkg);
      ledger.release(key);
      const decision = decide(entry, false);
      if (decision.act === 'keep') {
        logger?.info?.(`[dsh-workbench] ${pluginKeptText(decision.kept)}`);
        return {
          removed: false,
          ...(decision.plugin === undefined ? {} : { name: decision.plugin }),
          kept: decision.kept,
        };
      }
      await removeFiles(decision.plugin);
      ledger.drop(key);
      logger?.info?.(`[dsh-workbench] ${pluginRemovedText(key)}`);
      return { removed: true, name: decision.plugin };
    },

    async sweep(claimedBy) {
      if (ledger === undefined) return [];
      const removed: string[] = [];
      for (const entry of ledger.all()) {
        if (entry.releasedAt === undefined) continue;
        const decision = decide(entry, false, claimedBy);
        if (decision.act === 'keep') continue;
        try {
          await removeFiles(decision.plugin);
        } catch (error) {
          logger?.warn?.(`[dsh-workbench] 清 ${entry.package} 没成：${String(error)}`);
          continue;
        }
        ledger.drop(entry.package);
        removed.push(entry.package);
        logger?.info?.(`[dsh-workbench] ${pluginSweptText(entry.package)}`);
      }
      return removed;
    },
  };
}
