import type { DshHostContext } from '../api/dsh.js';
import type { AdapterSet } from './adapters.js';
import { validateAdapterSet } from './adapter-set.js';

const CAPABILITY_KEYS = ['console', 'pluginMarket', 'browserBridge'] as const;
const DATA_METHODS = ['read', 'request', 'requestMany', 'submit'] as const;

function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

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
      if (!isNonEmptyString(profile?.terms?.[key])) gaps.push(`runtime.profile().terms.${key} 不是非空字符串`);
    }
    if (!isNonEmptyString(profile?.installHint)) gaps.push('runtime.profile().installHint 不是非空字符串');
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
  if (!isNonEmptyString(set.modules.runtimeInstallCommand())) gaps.push('modules.runtimeInstallCommand() 不是非空字符串');
  if (typeof set.probe.probeUnits !== 'function') gaps.push('probe.probeUnits 不是函数');
  if (typeof set.probe.registerPreflight !== 'function') gaps.push('probe.registerPreflight 不是函数');

  return gaps;
}
