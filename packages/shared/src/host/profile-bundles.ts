import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { writeJsonFile } from './fs-write.js';
import { profileManifestOf } from './installed-module.js';

export const WORKBENCH_BUNDLE = '@dsh-workbench/core';

export type ProfileBundleRefusal = 'no-manifest' | 'broken-manifest' | 'dependency-missing';

export interface ProfileBundleCheck {
  readonly path: string;
  readonly bundle: string;
  readonly bundles: readonly string[];
  readonly selected: boolean;
  readonly repaired: boolean;
  readonly refusal?: ProfileBundleRefusal | undefined;
}

function recordOf(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null ? (value as Readonly<Record<string, unknown>>) : {};
}

function stringsOf(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function profileBundlesOf(profileDir: string): readonly string[] {
  const manifest = profileManifestOf(profileDir);
  return stringsOf(recordOf(recordOf(manifest?.dsh).profile).bundles);
}

/**
 * 核对 `dsh.profile.bundles` 里有没有这一项；缺了按 `seed-profile.sh ensure-selected` 的老规矩补回去
 * （追加到末尾，且**依赖必须先在清单里** —— 没装的包塞进 bundles 只会让 profile 组不起来）。
 * 读不了清单、或依赖不在时一个字节都不写，把原因交给调用点说人话。
 * @param profileDir - profile 目录（清单在它下面的 `package.json`）。
 * @param bundle - 要确保选中的组合包名，默认工作台自己。
 * @returns 核对结果：改没改、现在有哪些、以及拒绝的原因。
 */
export function ensureProfileBundle(profileDir: string, bundle: string = WORKBENCH_BUNDLE): ProfileBundleCheck {
  const path = join(profileDir, 'package.json');
  const manifest = profileManifestOf(profileDir);
  if (manifest === undefined || Array.isArray(manifest)) {
    return {
      path,
      bundle,
      bundles: [],
      selected: false,
      repaired: false,
      refusal: existsSync(path) ? 'broken-manifest' : 'no-manifest',
    };
  }
  const dsh = recordOf(manifest.dsh);
  const profile = recordOf(dsh.profile);
  const bundles = stringsOf(profile.bundles);
  if (bundles.includes(bundle)) return { path, bundle, bundles, selected: true, repaired: false };
  if (typeof recordOf(manifest.dependencies)[bundle] !== 'string') {
    return { path, bundle, bundles, selected: false, repaired: false, refusal: 'dependency-missing' };
  }
  const after = [...bundles, bundle];
  writeJsonFile(path, { ...manifest, dsh: { ...dsh, profile: { ...profile, bundles: after } } });
  return { path, bundle, bundles: after, selected: true, repaired: true };
}
