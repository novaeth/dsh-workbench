import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { quoteShellArg } from '@dsh-workbench/shared/host';
import { isolatedHome, toolchainOpencliDir, vendorPeerLink, vendorPluginsDir } from '../foundation/paths.js';


export const CHANNEL_PLUGIN_NAME = 'opencli-plugin-workbench';
export const CHANNEL_PLUGIN_SITE = 'workbench';

export interface ChannelPluginPlan {
  readonly dest: string;
  readonly version: string;
  readonly commands: readonly string[];
  readonly line: string;
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function channelVersionOf(dir: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(dir, 'opencli-plugin.json'), 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const version = textOf((parsed as Record<string, unknown>)['version']);
    return version === '' ? undefined : version;
  } catch {
    return undefined;
  }
}

export function channelPluginPlan(options: {
  readonly channelDir: string;
  readonly command?: string;
}): ChannelPluginPlan | undefined {
  const version = channelVersionOf(options.channelDir);
  if (version === undefined) return undefined;
  const command = options.command ?? 'opencli';
  const dest = join(vendorPluginsDir(), CHANNEL_PLUGIN_NAME);
  const peer = vendorPeerLink();
  const commands = [
    `rm -rf ${quoteShellArg(dest)} && mkdir -p ${quoteShellArg(dest)} && cp -R ${quoteShellArg(options.channelDir)}/. ${quoteShellArg(dest)}/`,
    `rm -rf ${quoteShellArg(peer.dir)} && mkdir -p ${quoteShellArg(peer.parent)} && ln -s ${quoteShellArg(toolchainOpencliDir())} ${quoteShellArg(peer.dir)}`,
    `(${quoteShellArg(command)} plugin uninstall ${quoteShellArg(CHANNEL_PLUGIN_SITE)} || true)`,
    `${quoteShellArg(command)} plugin install ${quoteShellArg(dest)}`,
  ];
  return { dest, version, commands, line: commands.join(' && ') };
}

export function channelInstalledVersion(): string | undefined {
  return channelVersionOf(join(vendorPluginsDir(), CHANNEL_PLUGIN_NAME));
}

export function channelSiteInstalled(): boolean {
  return existsSync(join(isolatedHome(), '.opencli', 'plugins', CHANNEL_PLUGIN_SITE));
}
