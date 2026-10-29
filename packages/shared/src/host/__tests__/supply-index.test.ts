import { describe, expect, it } from 'vitest';
import type { ExtensionNeed, LibNeed, SupplySource } from '../../contract/needs.js';
import { buildSupplyIndex, type SupplyDeclaration } from '../supply-index.js';

function npm(
  pkg?: string,
  registryEnv = 'DSH_WB_REGISTRY',
  registryDefault = 'https://registry.invalid/',
): SupplySource {
  return {
    kind: 'npm',
    ...(pkg === undefined ? {} : { package: pkg }),
    registryEnv,
    registryDefault,
  };
}

function extension(name: string, sources?: readonly SupplySource[]): ExtensionNeed {
  return {
    kind: 'extension',
    runtime: 'opencli',
    name,
    commands: [`${name}-read`],
    purpose: '测试',
    ...(sources === undefined ? {} : { sources }),
  };
}

function lib(name: string, sources?: readonly SupplySource[]): LibNeed {
  return { kind: 'lib', name, purpose: '测试', ...(sources === undefined ? {} : { sources }) };
}

function manifest(id: string, needs: SupplyDeclaration['needs']): SupplyDeclaration {
  return { id, needs };
}

describe('供给索引：一个包只有一个来源', () => {
  it('★★ 同一个插件、同一份源：收成一个条目，两家都记上', () => {
    const index = buildSupplyIndex([
      manifest('a', [extension('coding', [npm('opencli-plugin-coding')])]),
      manifest('b', [extension('coding', [npm('opencli-plugin-coding')])]),
    ]);

    expect(index.conflicts).toEqual([]);
    expect(index.entries.size).toBe(1);
    expect(index.entryOf('extension', 'coding')?.declarers).toEqual(['a', 'b']);
    expect(index.sourcesOf('extension', 'coding')).toEqual([npm('opencli-plugin-coding')]);
  });

  it('★★ 一家写了源、一家没写：判冲突，不 last-wins', () => {
    const index = buildSupplyIndex([
      manifest('a', [extension('coding', [npm('opencli-plugin-coding')])]),
      manifest('b', [extension('coding')]),
    ], { packagePrefix: 'opencli-plugin-' });

    expect(index.conflicts.map((item) => item.kind)).toEqual(['source-mismatch']);
    expect(index.entryOf('extension', 'coding')?.conflicted).toBe(true);
    expect(index.sourcesOf('extension', 'coding')).toEqual([]);
    expect(index.problems[0]).toContain('插件');
  });

  it('★★ 同一个插件名来自两个包：判 name-mismatch', () => {
    const index = buildSupplyIndex([
      manifest('a', [extension('coding', [npm('opencli-plugin-coding')])]),
      manifest('b', [extension('coding', [{ kind: 'git', url: 'github:acme/plugin-coding' }])]),
    ]);

    expect(index.conflicts.map((item) => item.kind)).toContain('name-mismatch');
    expect(index.entryOf('extension', 'coding')?.conflicted).toBe(true);
  });

  it('★★ 同一个包、同一个 registryEnv，一家只缺 registryDefault：不算冲突，缺的用有的一方补上', () => {
    const index = buildSupplyIndex([
      manifest('a', [
        extension('coding', [{ kind: 'npm', package: 'opencli-plugin-coding', registryEnv: 'DSH_WB_REGISTRY' }]),
      ]),
      manifest('b', [extension('coding', [npm('opencli-plugin-coding')])]),
    ]);

    expect(index.conflicts).toEqual([]);
    expect(index.sourcesOf('extension', 'coding')).toEqual([npm('opencli-plugin-coding')]);
  });

  it('★★ 共用库两家用不同的 registryEnv、解析到同一个地址：收成一家，不算冲突', () => {
    const index = buildSupplyIndex([
      manifest('argocd', [lib('opencli-workflow', [npm(undefined, 'DSH_WORKBENCH_ARGOCD_REGISTRY')])]),
      manifest('cmdb', [lib('opencli-workflow', [npm(undefined, 'DSH_WORKBENCH_CMDB_REGISTRY')])]),
    ]);

    expect(index.conflicts).toEqual([]);
    expect(index.entryOf('lib', 'opencli-workflow')?.conflicted).toBe(false);
    expect(index.entryOf('lib', 'opencli-workflow')?.declarers).toEqual(['argocd', 'cmdb']);
    expect(index.sourcesOf('lib', 'opencli-workflow')).toHaveLength(1);
  });

  it('★★ registryEnv 名不同、其中一家被环境变量指到别处：判冲突', () => {
    const index = buildSupplyIndex(
      [
        manifest('jenkins', [lib('opencli-workflow', [npm(undefined, 'DSH_WB_JENKINS_REGISTRY')])]),
        manifest('argocd', [lib('opencli-workflow', [npm(undefined, 'DSH_WB_ARGOCD_REGISTRY')])]),
      ],
      { env: { DSH_WB_JENKINS_REGISTRY: 'https://mirror.invalid/' } },
    );

    expect(index.conflicts.map((item) => item.kind)).toEqual(['source-mismatch']);
    expect(index.sourcesOf('lib', 'opencli-workflow')).toEqual([]);
  });

  it('★★ 两家默认源就不同：判冲突，哪怕 registryEnv 同名', () => {
    const index = buildSupplyIndex([
      manifest('a', [lib('opencli-workflow', [npm(undefined, 'DSH_WB_REGISTRY', 'https://r-a.invalid/')])]),
      manifest('b', [lib('opencli-workflow', [npm(undefined, 'DSH_WB_REGISTRY', 'https://r-b.invalid/')])]),
    ]);

    expect(index.conflicts).toHaveLength(1);
    expect(index.entryOf('lib', 'opencli-workflow')?.conflicted).toBe(true);
  });

  it('★ 两家都没写默认源、registryEnv 又不同：解析不出地址，按名字判冲突', () => {
    const index = buildSupplyIndex([
      manifest('a', [lib('opencli-workflow', [{ kind: 'npm', registryEnv: 'DSH_WB_A_REGISTRY' }])]),
      manifest('b', [lib('opencli-workflow', [{ kind: 'npm', registryEnv: 'DSH_WB_B_REGISTRY' }])]),
    ]);

    expect(index.conflicts).toHaveLength(1);
  });

  it('★★ 三家三个源：同一个包只报一条冲突，declarers 合并齐', () => {
    const index = buildSupplyIndex([
      manifest('a', [lib('opencli-workflow', [npm(undefined, 'DSH_WB_A_REGISTRY')])]),
      manifest('b', [lib('opencli-workflow', [npm(undefined, 'DSH_WB_B_REGISTRY')])]),
      manifest('c', [lib('opencli-workflow', [npm(undefined, 'DSH_WB_C_REGISTRY', 'https://mirror.invalid/')])]),
    ]);

    expect(index.conflicts).toHaveLength(1);
    expect(index.problems).toHaveLength(1);
    expect(index.conflicts[0]?.declarers).toEqual(['a', 'b', 'c']);
  });

  it('★ 跨 kind 同名不算冲突：bin:foo / extension:foo / lib:foo 是三件事', () => {
    const index = buildSupplyIndex([
      manifest('a', [
        { kind: 'bin', name: 'workflow', purpose: '测试' },
        extension('workflow', [npm('opencli-plugin-workflow')]),
        lib('workflow', [npm(undefined, 'DSH_WB_LIB_REGISTRY')]),
      ]),
    ]);

    expect(index.conflicts).toEqual([]);
    expect(index.entries.size).toBe(2);
    expect(index.entryOf('extension', 'workflow')?.package).toBe('opencli-plugin-workflow');
  });

  it('没写 sources 的 extension 按约定落包名，进索引但不代装', () => {
    const index = buildSupplyIndex([manifest('a', [extension('coding')])], { packagePrefix: 'opencli-plugin-' });

    expect(index.entryOf('extension', 'coding')?.package).toBe('opencli-plugin-coding');
    expect(index.sourcesOf('extension', 'coding')).toEqual([]);
    expect(index.conflicts).toEqual([]);
  });

  it('bin / env 不进供给索引（它们没有来源）', () => {
    const index = buildSupplyIndex([
      manifest('a', [
        { kind: 'bin', name: 'gitops', purpose: '测试' },
        { kind: 'env', name: 'DSH_TOKEN', purpose: '测试' },
      ]),
    ]);

    expect(index.entries.size).toBe(0);
    expect(index.conflicts).toEqual([]);
  });
});
