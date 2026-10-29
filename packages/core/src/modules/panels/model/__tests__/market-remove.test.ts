import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { BundleChange } from '@/kernel/contract/bundle-install';
import type { BundleManager, RegistryNotebook } from '@dsh-workbench/shared/host';
import { packageSourceOf, rememberPackageSource } from '@dsh-workbench/shared/host';
import { removeDshBundle } from '../market-remove';

const dirs: string[] = [];

function profile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-remove-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const book: RegistryNotebook = {
  sources: () => [],
  remember: (entries) => entries.map((entry) => entry.scope),
};

function manager(change: BundleChange | null, setEnabled?: (name: string, enabled: boolean) => void): BundleManager {
  return {
    remove: async () => change,
    registries: async () => null,
    inspect: async () => null,
    install: async () => null,
    cancel: async () => null,
    ...(setEnabled === undefined
      ? {}
      : {
          setEnabled: async (name: string, enabled: boolean) => {
            setEnabled(name, enabled);
            return change;
          },
        }),
  } as BundleManager;
}

describe('卸载时把按包记的来源一起清掉', () => {
  it('卸成了 → 记录删掉（不留一条指向已卸包的源）', async () => {
    const dir = profile();
    rememberPackageSource(dir, '@a/mod', { version: '0.3.1', registry: 'https://r.example/' });
    const change: BundleChange = { application: 'applied', stage: 'remove', changed: true, target: '@a/mod' };

    await removeDshBundle({ manager: manager(change), pkg: '@a/mod', profileDir: dir, registryFix: { registries: book } });

    expect(packageSourceOf(dir, '@a/mod')).toBeUndefined();
  });

  it('★ 没卸成 → 记录留着、把那一行放回名单，并说清为什么', async () => {
    const dir = profile();
    rememberPackageSource(dir, '@a/mod', { version: '0.3.1', registry: 'https://r.example/' });
    const failed: BundleChange = {
      application: 'failed',
      stage: 'remove',
      changed: false,
      target: '@a/mod',
      errorCode: 'network',
    };
    const enabled: boolean[] = [];
    const warned: string[] = [];

    const result = await removeDshBundle({
      manager: manager(failed, (_name, enabledNow) => enabled.push(enabledNow)),
      pkg: '@a/mod',
      profileDir: dir,
      registryFix: { registries: book },
      logger: { warn: (line) => warned.push(line) },
    });

    expect(result).toEqual(failed);
    expect(packageSourceOf(dir, '@a/mod')?.registry).toBe('https://r.example/');
    expect(enabled).toEqual([true]);
    expect(warned.join(' ')).toContain('没卸成');
  });

  it('没有 profile 目录 → 卸载照走，不抛', async () => {
    const change: BundleChange = { application: 'applied', stage: 'remove', changed: true, target: '@a/mod' };

    await expect(
      removeDshBundle({ manager: manager(change), pkg: '@a/mod', profileDir: null, registryFix: { registries: book } }),
    ).resolves.toEqual(change);
  });
});

describe('同 scope 多源时卸载：临时把 scope 指到这个包记录的源', () => {
  function swappingBook(calls: string[]): RegistryNotebook {
    return {
      sources: () => [],
      remember: (entries) => entries.map((entry) => entry.scope),
      swapScope: (scope, registry) => {
        calls.push(`${scope}|${registry}`);
        return () => calls.push('restore');
      },
    };
  }

  it('★ 有记录 → 换成记录里的源再卸；卸完还原，记录删掉', async () => {
    const dir = profile();
    rememberPackageSource(dir, '@a/mod', { version: '0.3.1', registry: 'https://r2.example/' });
    const change: BundleChange = { application: 'applied', stage: 'remove', changed: true, target: '@a/mod' };
    const calls: string[] = [];

    await removeDshBundle({
      manager: manager(change),
      pkg: '@a/mod',
      profileDir: dir,
      registryFix: { registries: swappingBook(calls) },
    });

    expect(calls).toEqual(['@a|https://r2.example/', 'restore']);
    expect(packageSourceOf(dir, '@a/mod')).toBeUndefined();
  });

  it('★ 没卸成也还原（别把 .npmrc 留在临时状态）', async () => {
    const dir = profile();
    rememberPackageSource(dir, '@a/mod', { version: '0.3.1', registry: 'https://r2.example/' });
    const failed: BundleChange = {
      application: 'failed',
      stage: 'remove',
      changed: false,
      target: '@a/mod',
      errorCode: 'network',
    };
    const calls: string[] = [];

    await removeDshBundle({
      manager: manager(failed),
      pkg: '@a/mod',
      profileDir: dir,
      registryFix: { registries: swappingBook(calls) },
    });

    expect(calls).toEqual(['@a|https://r2.example/', 'restore']);
    expect(packageSourceOf(dir, '@a/mod')?.registry).toBe('https://r2.example/');
  });

  it('没有记录 → 不动 .npmrc', async () => {
    const change: BundleChange = { application: 'applied', stage: 'remove', changed: true, target: '@a/mod' };
    const calls: string[] = [];

    await removeDshBundle({
      manager: manager(change),
      pkg: '@a/mod',
      profileDir: profile(),
      registryFix: { registries: swappingBook(calls) },
    });

    expect(calls).toEqual([]);
  });
});
