import type { DshHostContext } from '../api/dsh.js';
import type { AdapterSet } from './adapters.js';
import { validateAdapterSet } from './adapter-set.js';

const CAPABILITY_KEYS = ['console', 'pluginMarket', 'browserBridge'] as const;
const DATA_METHODS = ['read', 'request', 'requestMany', 'submit'] as const;

function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

const CLI_DIR_METHODS = [
  ['cliCatalogPath', 'cliCatalogPath'],
  ['vendorPluginsDir', 'vendorPluginsDir'],
] as const;

export function adapterContractGaps(set: AdapterSet, ctx: DshHostContext): readonly string[] {
  const gaps: string[] = [];
  const validated = validateAdapterSet(set, '契约');
  if (!validated.ok) {
    gaps.push(`成员不全：${validated.detail}`);
    return gaps;
  }

  if (!Number.isInteger(set.apiVersion) || set.apiVersion < 1) {
    gaps.push(`apiVersion 不是正整数：${String(set.apiVersion)}`);
  }

  const capabilities = set.runtime.capabilities(ctx);
  for (const key of CAPABILITY_KEYS) {
    if (typeof capabilities[key] !== 'boolean') gaps.push(`capabilities.${key} 不是布尔值`);
  }

  if (typeof set.runtime.profile === 'function') {
    const profile = set.runtime.profile(ctx);
    if (!isNonEmptyString(profile?.label)) gaps.push('runtime.profile().label 不是非空字符串');
    for (const key of ['plugin', 'pluginOf', 'pluginThing', 'pluginArea'] as const) {
      const text = profile?.terms?.[key];
      if (!isNonEmptyString(text?.zh) || !isNonEmptyString(text?.en)) {
        gaps.push(`runtime.profile().terms.${key} 要给 zh / en 两份非空文案`);
      }
    }
    if (!isNonEmptyString(profile?.installHint?.zh) || !isNonEmptyString(profile?.installHint?.en)) {
      gaps.push('runtime.profile().installHint 要给 zh / en 两份非空文案');
    }
  }

  if (typeof set.runtime.commandSurface === 'function') {
    const surface = set.runtime.commandSurface(ctx);
    if (surface !== undefined) {
      if (!isNonEmptyString(surface.name)) gaps.push('runtime.commandSurface().name 不是非空字符串');
      if (!isNonEmptyString(surface.pluginPrefix)) {
        gaps.push('runtime.commandSurface().pluginPrefix 不是非空字符串');
      }
      if (typeof surface.invoke !== 'function') gaps.push('runtime.commandSurface().invoke 不是函数');
      else if (!isNonEmptyString(surface.invoke('site', 'command'))) {
        gaps.push('runtime.commandSurface().invoke(site, command) 拼不出非空命令行');
      }
      if (typeof surface.help !== 'function') gaps.push('runtime.commandSurface().help 不是函数');
      else if (!isNonEmptyString(surface.help('site'))) {
        gaps.push('runtime.commandSurface().help(site) 拼不出非空提示');
      }
    }
  }

  const health = set.runtime.health(ctx);
  const commands = set.runtime.commands(ctx);
  for (const [name, status] of Object.entries(health)) {
    if (!isNonEmptyString(status?.command)) gaps.push(`health['${name}'].command 不是非空字符串`);
    if (!['env', 'isolated', 'path'].includes(status?.source)) gaps.push(`health['${name}'].source 不是已知来源`);
  }
  for (const name of Object.keys(commands)) {
    if (health[name] === undefined) gaps.push(`commands 里的 ${name} 在 health 里没有对应条目`);
    else if (!isNonEmptyString(commands[name])) gaps.push(`commands['${name}'] 不是非空字符串`);
  }

  for (const method of DATA_METHODS) {
    if (typeof set.data[method] !== 'function') gaps.push(`data.${method} 不是函数`);
  }

  if (!isNonEmptyString(set.modules.isolatedRoot())) gaps.push('modules.isolatedRoot() 不是非空字符串');
  if (set.modules.runtimeInstallCommand !== undefined && !isNonEmptyString(set.modules.runtimeInstallCommand())) {
    gaps.push('modules.runtimeInstallCommand() 给了但不是非空字符串');
  }
  for (const [name, method] of CLI_DIR_METHODS) {
    const given = set.modules[method];
    if (given !== undefined && !isNonEmptyString(given())) gaps.push(`modules.${method}() 给了但不是非空字符串（${name}）`);
  }
  if (typeof set.probe.probeUnits !== 'function') gaps.push('probe.probeUnits 不是函数');
  if (typeof set.probe.registerPreflight !== 'function') gaps.push('probe.registerPreflight 不是函数');

  return gaps;
}
