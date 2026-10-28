import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BundleChange } from '@/kernel/contract/bundle-install';
import type { BundleManager } from '@dsh-workbench/shared/host';
import type { RegistryEntry, RegistryNotebook } from '@dsh-workbench/shared/host';
import { packageSourceOf } from '@dsh-workbench/shared/host';
import { rememberInstalledSource, retryAfterRegistryFix } from './market-registry';

function notebook(options: {
  sources?: readonly RegistryEntry[];
  added?: readonly string[];
  throwOnRemember?: boolean;
}): { readonly book: RegistryNotebook; readonly seen: RegistryEntry[][] } {
  const seen: RegistryEntry[][] = [];
  return {
    seen,
    book: {
      sources: () => options.sources ?? [],
      remember: (entries) => {
        seen.push([...entries]);
        if (options.throwOnRemember === true) throw new Error('写不进去');
        return options.added ?? entries.map((entry) => entry.scope);
      },
    },
  };
}

function manager(options: {
  resolved?: string | null;
  registriesThrows?: boolean;
  removed?: readonly (BundleChange | null)[];
}): { readonly bundles: BundleManager; readonly removed: string[] } {
  const removed: string[] = [];
  const replies = [...(options.removed ?? [])];
  return {
    removed,
    bundles: {
      registries: async () => {
        if (options.registriesThrows === true) throw new Error('问不到');
        return { registry: null, fallbackRegistries: [], resolved: options.resolved ?? null };
      },
      inspect: async () => null,
      install: async () => null,
      remove: async (name) => {
        removed.push(name);
        return replies.shift() ?? null;
      },
      cancel: async () => null,
    },
  };
}

const failed: BundleChange = {
  application: 'failed',
  stage: 'remove',
  changed: false,
  target: '@a/mod',
  errorDetail: 'ERR_PNPM_FETCH_404 GET https://r.example/@a/mod: Not found',
};

const other: BundleChange = {
  application: 'failed',
  stage: 'remove',
  changed: false,
  target: '@a/mod',
  errorDetail: '别的错',
};

describe('装完之后把源记一行（卸载时 pnpm 得问得到）', () => {
  it('带 scope 的私有包 + 显式源 → 记一行，并把记了什么说出来', async () => {
    const { book, seen } = notebook({});
    const { bundles } = manager({});
    const lines: string[] = [];

    await rememberInstalledSource(
      { registries: book, logger: { info: (line) => lines.push(line) } },
      bundles,
      '@a/mod',
      'https://r.example/',
    );

    expect(seen).toEqual([[{ scope: '@a', registry: 'https://r.example/' }]]);
    expect(lines.join(' ')).toContain('@a');
  });

  it('没源 / 没 scope（不带 @ 的包）/ 就是 profile 现在这个源 → 都不写', async () => {
    const { book, seen } = notebook({});
    const { bundles } = manager({ resolved: 'https://r.example/' });

    await rememberInstalledSource({ registries: book }, bundles, '@a/mod', undefined);
    await rememberInstalledSource({ registries: book }, bundles, 'plain-mod', 'https://r.example/');
    await rememberInstalledSource({ registries: book }, bundles, '@a/mod', 'https://r.example/');

    expect(seen).toEqual([]);
  });

  it('问不到 profile 的源、写不进去 → 都不抛（装已经装完了，记不上只是下次卸载难一点）', async () => {
    const { book } = notebook({ throwOnRemember: true });
    const { bundles } = manager({ registriesThrows: true });
    const warned: string[] = [];

    await rememberInstalledSource(
      { registries: book, logger: { warn: (line) => warned.push(line) } },
      bundles,
      '@a/mod',
      'https://r.example/',
    );

    expect(warned.join(' ')).toContain('源失败');
  });

  it('★ 装完按包记一条来源（版本一起记，检查更新只认它）', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-registry-'));
    const { book } = notebook({});
    const { bundles } = manager({});

    try {
      await rememberInstalledSource(
        { registries: book, profileDir: dir },
        bundles,
        '@a/mod',
        'https://r.example/',
        '0.3.1',
      );
      expect(packageSourceOf(dir, '@a/mod')).toEqual({ version: '0.3.1', registry: 'https://r.example/' });

      await rememberInstalledSource({ registries: book, profileDir: dir }, bundles, '@a/mod', 'https://r.example/');
      expect(packageSourceOf(dir, '@a/mod')?.version).toBe('0.3.1');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('没有台账（不做这件事）→ 直接返回', async () => {
    const { bundles, removed } = manager({});
    await rememberInstalledSource({}, bundles, '@a/mod', 'https://r.example/');
    expect(removed).toEqual([]);
  });
});

describe('卸的时候撞上源：补一行再重试一次（ADR-0030）', () => {
  it('★ 源失败 + 台账里有缺的行 → 补上再卸一次，交回第二次的结果', async () => {
    const { book, seen } = notebook({ sources: [{ scope: '@a', registry: 'https://r.example/' }] });
    const second: BundleChange = { application: 'applied', stage: 'remove', changed: true, target: '@a/mod' };
    const { bundles, removed } = manager({ removed: [second] });

    const change = await retryAfterRegistryFix(
      { registries: book, logger: { warn: () => {} } },
      bundles,
      '@a/mod',
      failed,
    );

    expect(seen).toEqual([[{ scope: '@a', registry: 'https://r.example/' }]]);
    expect(removed).toEqual(['@a/mod']);
    expect(change).toBe(second);
  });

  it('★ 不是源失败 / 缺的行一条没有 / 补完还是没有新行 → 原样交回第一次那份（不瞎重试）', async () => {
    const same = await retryAfterRegistryFix(
      { registries: notebook({ sources: [{ scope: '@a', registry: 'https://r.example/' }] }).book },
      manager({ resolved: 'https://r.example/' }).bundles,
      '@a/mod',
      failed,
    );
    const notRegistry = await retryAfterRegistryFix(
      { registries: notebook({ sources: [{ scope: '@a', registry: 'https://r.example/' }] }).book },
      manager({}).bundles,
      '@a/mod',
      other,
    );
    const nothingAdded = await retryAfterRegistryFix(
      { registries: notebook({ sources: [{ scope: '@a', registry: 'https://r.example/' }], added: [] }).book },
      manager({}).bundles,
      '@a/mod',
      failed,
    );

    expect(same).toBe(failed);
    expect(notRegistry).toBe(other);
    expect(nothingAdded).toBe(failed);
  });

  it('补配置失败 / 第二次卸也没成 → 都不抛，交回第一次那份', async () => {
    const { book } = notebook({ sources: [{ scope: '@a', registry: 'https://r.example/' }], throwOnRemember: true });
    const warned: string[] = [];
    const threw = await retryAfterRegistryFix(
      { registries: book, logger: { warn: (line) => warned.push(line) } },
      manager({}).bundles,
      '@a/mod',
      failed,
    );
    const again = await retryAfterRegistryFix(
      { registries: notebook({ sources: [{ scope: '@a', registry: 'https://r.example/' }] }).book },
      manager({ removed: [null] }).bundles,
      '@a/mod',
      failed,
    );

    expect(threw).toBe(failed);
    expect(warned.join(' ')).toContain('补配置失败');
    expect(again).toBe(failed);
  });
});
