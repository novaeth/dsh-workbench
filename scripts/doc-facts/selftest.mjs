import { normalizeBody, parseBlocks, replaceBlock } from './lib.mjs';
import { archRules, gateChainInline } from './blocks.mjs';
import { coreArchRules, gateSteps } from './facts.mjs';
import { depEdges, packageTable, sharedExportsCheck } from './checks.mjs';

function record(results, name, ok) {
  results.push({ name, ok });
}

function packageFixture(extra = {}) {
  const core = { dir: 'packages/core', manifest: { name: '@dsh-workbench/core', dependencies: {} } };
  const defaults = {
    dir: 'packages/adapters-default',
    manifest: {
      name: '@dsh-workbench/adapters-default',
      dependencies: {
        '@dsh-workbench/adapter-runtime': 'workspace:*',
        '@dsh-workbench/adapter-supply': 'workspace:*',
      },
    },
  };
  const runtime = { dir: 'packages/adapter-runtime', manifest: { name: '@dsh-workbench/adapter-runtime', dependencies: {} } };
  const supply = {
    dir: 'packages/adapter-supply',
    manifest: {
      name: '@dsh-workbench/adapter-supply',
      dependencies: { '@dsh-workbench/adapter-runtime': 'workspace:*' },
    },
  };
  return { core, defaults, runtime, supply, ...extra };
}

export async function selfTest() {
  const results = [];
  const text = 'a\n<!-- doc-facts:begin x -->\nold\n<!-- doc-facts:end x -->\nb';
  record(results, '管理块读写往返', replaceBlock(text, 'x', 'new') === 'a\n<!-- doc-facts:begin x -->\nnew\n<!-- doc-facts:end x -->\nb');
  record(results, '管理块解析拒绝未闭合', parseBlocks('<!-- doc-facts:begin x -->\n').errors.length === 1);
  record(results, '比对口径折叠空白', normalizeBody('a  b\n\n\nc') === 'a b\n\nc');

  const steps = gateSteps();
  record(results, '门禁链来自根 package.json', steps.length >= 10 && steps[0]?.name === 'lint:commit' && steps.at(-1)?.name === 'check:release-artifacts');
  record(results, '门禁链每步都有名字', steps.every((step) => typeof step.name === 'string' && step.name !== ''));
  record(results, '门禁链可渲染', gateChainInline().split('\n').length >= 1);

  const pkgs = packageFixture();
  const arch = [
    '## 1. 包',
    '',
    '| 包 | 是什么 | 发布名 |',
    '|---|---|---|',
    '| `packages/core/` | 外壳 | `@dsh-workbench/core` |',
    '| `packages/adapters-default/` | 默认集合 | `@dsh-workbench/adapters-default` |',
    '| `packages/adapter-runtime/` | 运行时 | `@dsh-workbench/adapter-runtime` |',
    '| `packages/adapter-supply/` | 供给 | `@dsh-workbench/adapter-supply` |',
    '',
    '### 1.1 依赖图',
    '',
    '```text',
    '@dsh-workbench/core',
    '  └── (dynamic fallback) @dsh-workbench/adapters-default',
    '        ├── @dsh-workbench/adapter-runtime',
    '        └── @dsh-workbench/adapter-supply → runtime',
    '```',
  ].join('\n');
  const agents = '## 仓库结构\n\n`packages/core/` `packages/adapters-default/` `packages/adapter-runtime/` `packages/adapter-supply/`';
  const packages = [pkgs.core, pkgs.defaults, pkgs.runtime, pkgs.supply];
  record(results, '包表正例通过', packageTable({ arch, agents, packages }).length === 0);
  record(results, '包表负例：缺一行', packageTable({ arch: arch.replace('| `packages/adapter-runtime/` | 运行时 | `@dsh-workbench/adapter-runtime` |\n', ''), agents, packages }).length === 1);
  record(results, '依赖图正例通过', depEdges({ arch, packages }).length === 0);
  record(results, '依赖图负例：假边', depEdges({ arch: arch.replace('supply → runtime', 'supply → profile'), packages }).length >= 1);

  const keys = ['.', './host', './testing', './contract/*'];
  const full = keys.map((key) => `@dsh-workbench/shared${key.slice(1)}`);
  const complete = {
    'packages/shared/README.md': full.join(' '),
    'AGENTS.md': full.join(' '),
    'ARCHITECTURE.md': full.join(' '),
  };
  record(results, 'shared 入口正例通过', sharedExportsCheck({ keys, texts: complete }).length === 0);
  record(
    results,
    'shared 入口负例：漏 contract',
    sharedExportsCheck({ keys, texts: { ...complete, 'packages/shared/README.md': full.slice(0, 3).join(' ') } }).length === 1,
  );

  const rules = await coreArchRules();
  record(results, 'S 规则来自 arch.config', rules.length >= 10 && new Set(rules.map((rule) => rule.id)).size === rules.length);
  const table = await archRules();
  record(results, 'S 规则表行数与规则数一致', table.split('\n').filter((line) => line.startsWith('| S')).length === rules.length);

  return results;
}
