import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';

import { misplacedTests } from '../arch/rules/tests-in-folders.mjs';
import {
  ROOT,
  SHARED_SRC,
  SKILL_DIR,
  WORKBENCH_SRC,
  contractImportLinesOf,
  hasRolesBlock,
  hostExportSpecsOf,
  importsOf,
  kernelSideFindings,
  layerOfShared,
  layerOfWorkbench,
  missingModelTests,
  moduleSources,
  protocolDeclarationsOf,
  reachableFrom,
  read,
  relOf,
  scanImports,
  reverseLayerFindings,
  vendorFieldsOf,
  walkCode,
} from './lib.mjs';

const CORE_PKG = join(ROOT, 'packages/core/package.json');
const CORE_CONTRACT = join(WORKBENCH_SRC, 'kernel/contract/index.ts');
const MODULE_TOOLS_SRC = join(ROOT, 'packages/module-tools/src');
const ARCHITECTURE = join(ROOT, 'ARCHITECTURE.md');
const ADAPTER_PACKAGES = ['adapter-runtime', 'adapter-supply', 'adapter-profile', 'adapter-probe', 'adapters-default'].map((name) => join(ROOT, 'packages', name));
const TEST_SCAN_ROOTS = [join(ROOT, 'packages'), join(ROOT, 'scripts')];
const TEST_SCAN_SKIP = new Set(['node_modules', 'dist', 'coverage', 'site-dist', '.git', '.verify']);


function finding(file, line, text, fix) {
  return { file, line, text, fix };
}

function repoFiles() {
  const out = [];
  const visit = (here) => {
    for (const entry of readdirSync(here, { withFileTypes: true })) {
      if (TEST_SCAN_SKIP.has(entry.name)) continue;
      const full = join(here, entry.name);
      if (entry.isDirectory()) {
        visit(full);
        continue;
      }
      out.push(relative(ROOT, full).split('\\').join('/'));
    }
  };
  for (const base of TEST_SCAN_ROOTS) visit(base);
  return out;
}

function pass(note = '') {
  return { status: 'pass', findings: [], note };
}

function fail(findings, note = '') {
  return { status: 'fail', findings, note };
}

function wbRel(file) {
  return `src/${relOf(file, WORKBENCH_SRC)}`;
}

function workbenchFindings() {
  return reverseLayerFindings(walkCode(WORKBENCH_SRC), WORKBENCH_SRC, layerOfWorkbench);
}


function adapterUsageFindings() {
  const findings = [];
  for (const file of walkCode(WORKBENCH_SRC)) {
    const rel = relative(WORKBENCH_SRC, file).split('\\').join('/');
    if (rel === 'app/host.ts') continue;
    for (const { spec } of importsOf(read(file))) {
      if (spec === '@dsh-workbench/adapters-default' || /^@dsh-workbench\/adapter-/.test(spec)) {
        findings.push(finding(`src/${rel}`, 1, `非组合根 import ${spec}`, '只从 shared/contract 取端口；具体 adapter 只在 app/host.ts 选'));
      }
    }
  }
  return findings;
}

function adapterPackageFindings() {
  const findings = [];
  for (const dir of ADAPTER_PACKAGES) {
    if (existsSync(join(dir, 'src', 'contract'))) {
      findings.push(finding(relative(ROOT, join(dir, 'src', 'contract')), 1, 'adapter 包内仍有 contract 拷贝', '协议只住 shared/src/contract/protocol'));
    }
    for (const file of walkCode(join(dir, 'src'))) {
      const rel = relative(ROOT, file);
      for (const { spec } of importsOf(read(file))) {
        if (spec.startsWith('.') || spec.startsWith('node:')) continue;
        if (spec.startsWith('@dsh-workbench/shared') || spec.startsWith('@dsh-workbench/adapter-')) continue;
        if (['execa', 'proper-lockfile', 'write-file-atomic', 'dayjs'].includes(spec)) continue;
        findings.push(finding(rel, 1, `adapter 包越界 import ${spec}`, '适配器只取 shared 契约/纯函数与自己的依赖'));
      }
    }
  }
  return findings;
}

const GATES = [
  {
    id: 'WB-L1',
    title: 'workbench 目标层序',
    run() {
      const findings = workbenchFindings().map((one) => ({
        ...one,
        file: `src/${one.file}`,
        fix: one.fix ?? '把依赖挪到下层；不要提高层号',
      }));
      return findings.length === 0 ? pass('所有 import 都是向下依赖') : fail(findings);
    },
    selfTest() {
      return layerOfWorkbench('src/app/layouts/x.ts') === 6 && layerOfWorkbench('src/dev/x.ts') === 9;
    },
  },
  {
    id: 'WB-L2',
    title: 'kernel host / client 不互引',
    run() {
      const findings = kernelSideFindings(walkCode(join(WORKBENCH_SRC, 'kernel')), WORKBENCH_SRC).map((one) => ({
        ...one,
        file: `src/${one.file}`,
      }));
      return findings.length === 0 ? pass('两侧各住各的') : fail(findings);
    },
    selfTest() {
      const tmp = mkdtempSync(join(tmpdir(), 'dsh-gate-kernel-'));
      try {
        const host = join(tmp, 'src/kernel/host/a.ts');
        const client = join(tmp, 'src/kernel/client/b.ts');
        mkdirSync(dirname(host), { recursive: true });
        mkdirSync(dirname(client), { recursive: true });
        writeFileSync(host, "import { b } from '../client/b';\nexport const a = b;\n");
        writeFileSync(client, 'export const b = 1;\n');
        return kernelSideFindings([host], tmp).length === 1;
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    },
  },
  {
    id: 'WB-L3',
    title: 'shell 不 import dev',
    run() {
      const findings = workbenchFindings()
        .filter((one) => one.from === 6 && one.to === 9)
        .map((one) => finding(`src/${one.file}`, one.line, one.text, 'DevSurface 端口化，由 app 注入实现'));
      return findings.length === 0 ? pass('shell 没有 dev 依赖') : fail(findings);
    },
    selfTest() {
      const tmp = mkdtempSync(join(tmpdir(), 'dsh-gate-shell-'));
      try {
        const layout = join(tmp, 'src/app/layouts/a.ts');
        const dev = join(tmp, 'src/dev/b.ts');
        mkdirSync(dirname(layout), { recursive: true });
        mkdirSync(dirname(dev), { recursive: true });
        writeFileSync(layout, "import { b } from '../../dev/b';\nexport const a = b;\n");
        writeFileSync(dev, 'export const b = 1;\n');
        const found = reverseLayerFindings([layout], join(tmp, 'src'), layerOfWorkbench).filter(
          (one) => one.from === 6 && one.to === 9,
        );
        return found.length === 1;
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    },
  },
  {
    id: 'WB-K1',
    title: 'kernel 不碰 UI / 适配器',
    run() {
      const banned = [
        /^react(?:\/|$)/,
        /^react-dom(?:\/|$)/,
        /^@deepseek-ai\//,
        /^@\/app\//,
        /^@\/modules\//,
        /^@\/dev\//,
        /^@\/adapters\//,
        /^@\/shared\/hooks\//,
        /^@\/shared\/components\//,
        /^@\/shared\/api\/host\//,
      ];
      const findings = scanImports(
        walkCode(join(WORKBENCH_SRC, 'kernel')),
        WORKBENCH_SRC,
        (spec) => banned.some((pattern) => pattern.test(spec)),
        (spec) => `kernel import 了 ${spec}`,
        '只留端口类型；实现放 adapters',
      ).map((one) => ({ ...one, file: `src/${one.file}` }));
      return findings.length === 0 ? pass('kernel 只依赖端口') : fail(findings);
    },
    selfTest() {
      const tmp = mkdtempSync(join(tmpdir(), 'dsh-gate-kernelui-'));
      try {
        const file = join(tmp, 'src/kernel/host/a.ts');
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, "import { createElement } from 'react';\nexport const a = createElement;\n");
        return scanImports([file], tmp, (spec) => /^react(?:\/|$)/.test(spec), () => 'x', 'fix').length === 1;
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    },
  },
  {
    id: 'WB-K2',
    title: 'kernel 契约不新增供应商字段',
    run() {
      const fields = vendorFieldsOf(read(join(SHARED_SRC, 'host/unit-face.ts')));
      const findings = fields.map((field) =>
        finding('src/host/unit-face.ts', field.line, `UnitMountDeps 新增 ${field.name}`, '放进 adapter 端口，不进每个模块都收的 deps'),
      );
      return findings.length === 0 ? pass('没有新增供应商字段') : fail(findings);
    },
    selfTest() {
      return vendorFieldsOf('export interface UnitMountDeps {\n  readonly browserX: string;\n}\n').length === 1;
    },
  },
  {
    id: 'WB-C1',
    title: 'core 只暴露一份 ./contract',
    run() {
      const findings = contractEntryFindings(existsSync(CORE_CONTRACT), JSON.parse(read(CORE_PKG)), []);
      return findings.length === 0 ? pass('contract 入口存在') : fail(findings);
    },
    selfTest() {
      return contractEntryFindings(false, { exports: {} }, []).length === 2;
    },
  },
  {
    id: 'WB-A1',
    title: 'opencli / adapter 包 / 组合根边界',
    run() {
      const findings = [...opencliFindings(walkCode(WORKBENCH_SRC), WORKBENCH_SRC), ...adapterPackageFindings(), ...adapterUsageFindings()];
      return findings.length === 0 ? pass('opencli、adapter 包与组合根都收口') : fail(findings);
    },
    selfTest() {
      return tempImportTest('src/app/host.ts', "import { x } from 'opencli';\n", /opencli/i);
    },
  },
  {
    id: 'WB-R1',
    title: '浏览器图里没有宿主传输层',
    run() {
      const graph = reachableFrom(join(WORKBENCH_SRC, 'app/client.tsx'), WORKBENCH_SRC, { valuesOnly: true });
      const findings = browserHostFindings(graph, WORKBENCH_SRC);
      return findings.length === 0 ? pass(`${graph.size} 个文件无宿主层`) : fail(findings);
    },
    selfTest() {
      const tmp = mkdtempSync(join(tmpdir(), 'dsh-gate-clienthost-'));
      try {
        const client = join(tmp, 'src/app/client.tsx');
        const host = join(tmp, 'src/kernel/host/a.ts');
        mkdirSync(dirname(client), { recursive: true });
        mkdirSync(dirname(host), { recursive: true });
        writeFileSync(client, "import '../kernel/host/a';\n");
        writeFileSync(host, 'export const a = 1;\n');
        return browserHostFindings(reachableFrom(client, join(tmp, 'src'), { valuesOnly: true }), join(tmp, 'src')).length === 1;
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    },
  },
  {
    id: 'WB-R2',
    title: '宿主图里没有浏览器侧文件',
    run() {
      const graph = reachableFrom(join(WORKBENCH_SRC, 'app/host.ts'), WORKBENCH_SRC, { valuesOnly: true });
      const banned = [
        'src/kernel/client/',
        'src/app/layouts/',
        'src/app/units/manifests.ts',
        'src/shared/components/',
        'src/shared/hooks/',
        'src/shared/styles/',
      ];
      const findings = [];
      for (const file of graph) {
        const rel = wbRel(file);
        if (!banned.some((prefix) => rel.startsWith(prefix))) continue;
        findings.push(finding(rel, 1, '宿主入口可达浏览器侧文件', '宿主侧只走 /host 与 kernel'));
      }
      return findings.length === 0 ? pass(`${graph.size} 个文件无浏览器层`) : fail(findings);
    },
    selfTest() {
      const tmp = mkdtempSync(join(tmpdir(), 'dsh-gate-hostgraph-'));
      try {
        const host = join(tmp, 'src/app/host.ts');
        const layout = join(tmp, 'src/app/layouts/a.ts');
        mkdirSync(dirname(host), { recursive: true });
        mkdirSync(dirname(layout), { recursive: true });
        writeFileSync(host, "import './layouts/a';\n");
        writeFileSync(layout, 'export const a = 1;\n');
        const graph = reachableFrom(host, join(tmp, 'src'), { valuesOnly: true });
        return [...graph].some((file) => relative(join(tmp, 'src'), file).split('\\').join('/').startsWith('app/layouts/'));
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    },
  },
  {
    id: 'WB-R3',
    title: 'shared 宿主模块不进浏览器图',
    run() {
      const graph = reachableFrom(join(WORKBENCH_SRC, 'app/client.tsx'), WORKBENCH_SRC, { valuesOnly: true });
      const findings = sharedHostFindings(graph, WORKBENCH_SRC);
      return findings.length === 0 ? pass('shared/host 不在浏览器图') : fail(findings);
    },
    selfTest() {
      const tmp = mkdtempSync(join(tmpdir(), 'dsh-gate-sharedhost-'));
      try {
        const client = join(tmp, 'src/app/client.tsx');
        mkdirSync(dirname(client), { recursive: true });
        writeFileSync(client, "import { x } from '@dsh-workbench/shared/host';\nexport const a = x;\n");
        return sharedHostFindings(reachableFrom(client, join(tmp, 'src'), { valuesOnly: true }), join(tmp, 'src')).length === 1;
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    },
  },
  {
    id: 'WB-R4',
    title: 'app/units 两侧不交错',
    run() {
      const client = reachableFrom(join(WORKBENCH_SRC, 'app/client.tsx'), WORKBENCH_SRC, { valuesOnly: true });
      const host = reachableFrom(join(WORKBENCH_SRC, 'app/host.ts'), WORKBENCH_SRC, { valuesOnly: true });
      const findings = [];
      const hostFile = join(WORKBENCH_SRC, 'app/units/host.ts');
      const manifestsFile = join(WORKBENCH_SRC, 'app/units/manifests.ts');
      if (client.has(hostFile)) findings.push(finding('src/app/units/host.ts', 1, '浏览器图包含 host 装配', '只从 app/host.ts 引'));
      if (host.has(manifestsFile)) findings.push(finding('src/app/units/manifests.ts', 1, '宿主图包含清单加载器', '只从 app/client.tsx 引'));
      return findings.length === 0 ? pass('app/units 两侧分开') : fail(findings);
    },
    selfTest() {
      const tmp = mkdtempSync(join(tmpdir(), 'dsh-gate-appunits-'));
      try {
        const client = join(tmp, 'src/app/client.tsx');
        const manifest = join(tmp, 'src/app/units/manifests.ts');
        mkdirSync(dirname(client), { recursive: true });
        mkdirSync(dirname(manifest), { recursive: true });
        writeFileSync(client, "import './units/manifests';\n");
        writeFileSync(manifest, 'export const m = 1;\n');
        return reachableFrom(client, join(tmp, 'src'), { valuesOnly: true }).has(manifest);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    },
  },
  {
    id: 'SH-L1',
    title: 'shared 目标层序',
    run() {
      const findings = reverseLayerFindings(walkCode(SHARED_SRC), SHARED_SRC, layerOfShared).map((one) => ({
        ...one,
        file: `src/${one.file}`,
        fix: '按 contract 1 / lib 2 / ui 3 / adapters 4 / testing 99 落位',
      }));
      return findings.length === 0 ? pass('shared 所有 import 向下') : fail(findings);
    },
    selfTest() {
      const tmp = mkdtempSync(join(tmpdir(), 'dsh-gate-sharedlayer-'));
      try {
        const component = join(tmp, 'src/components/a.ts');
        const api = join(tmp, 'src/api/x.ts');
        mkdirSync(dirname(component), { recursive: true });
        mkdirSync(dirname(api), { recursive: true });
        writeFileSync(component, "import { x } from '../api/x';\nexport const a = x;\n");
        writeFileSync(api, 'export const x = 1;\n');
        return reverseLayerFindings([component], join(tmp, 'src'), layerOfShared).length === 1;
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    },
  },
  {
    id: 'SH-R1',
    title: 'shared 浏览器入口不含宿主运行值',
    run() {
      const findings = hostExportSpecsOf(read(join(SHARED_SRC, 'index.ts'))).map((imported) =>
        finding('src/index.ts', imported.line, `浏览器入口导出 ${imported.spec}`, '根入口只留组件与纯函数；宿主侧走 /host'),
      );
      return findings.length === 0 ? pass('index.ts 不含 host') : fail(findings);
    },
    selfTest() {
      return hostExportSpecsOf("export * from './host/x.js';\n").length === 1;
    },
  },
  {
    id: 'SH-A1',
    title: 'shared 不依赖、不 import 适配器实现',
    run() {
      const pkg = JSON.parse(read(join(ROOT, 'packages/shared/package.json')));
      const deps = [
        ...Object.keys(pkg.dependencies ?? {}),
        ...Object.keys(pkg.peerDependencies ?? {}),
        ...Object.keys(pkg.optionalDependencies ?? {}),
      ];
      const imports = walkCode(SHARED_SRC).flatMap((file) => {
        const rel = relative(ROOT, file).split('\\').join('/');
        return importsOf(read(file)).map((one) => [rel, one.spec]);
      });
      const findings = sharedAdapterFindings({
        hasAdaptersDir: existsSync(join(SHARED_SRC, 'adapters')),
        deps,
        imports,
      });
      return findings.length === 0 ? pass('shared 只依赖契约与纯工具') : fail(findings);
    },
    selfTest() {
      const one = (input) => sharedAdapterFindings({ hasAdaptersDir: false, deps: [], imports: [], ...input }).length;
      return (
        one({ hasAdaptersDir: true }) === 1 &&
        one({ deps: ['@dsh-workbench/core'] }) === 1 &&
        one({ imports: [['src/a.ts', '@dsh-workbench/adapter-supply']] }) === 1 &&
        one({ imports: [['src/a.ts', 'execa']] }) === 1 &&
        one({}) === 0
      );
    },
  },
  {
    id: 'SH-K1',
    title: 'contract 不碰 UI / 宿主',
    run() {
      const banned = [/^react(?:\/|$)/, /^react-dom(?:\/|$)/, /^@deepseek-ai\//, /^node:/, /opencli/i, /^\.\.\/host\//];
      const findings = scanImports(
        walkCode(join(SHARED_SRC, 'contract')),
        SHARED_SRC,
        (spec) => banned.some((pattern) => pattern.test(spec)),
        (spec) => `contract import 了 ${spec}`,
        'contract 只放类型与纯数据',
      ).map((one) => ({ ...one, file: `src/${one.file}` }));
      return findings.length === 0 ? pass('contract 是纯的') : fail(findings);
    },
    selfTest() {
      const tmp = mkdtempSync(join(tmpdir(), 'dsh-gate-contract-'));
      try {
        const file = join(tmp, 'src/contract/a.ts');
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, "import { readFileSync } from 'node:fs';\nexport const a = readFileSync;\n");
        return scanImports([file], tmp, (spec) => /^node:/.test(spec), () => 'x', 'fix').length === 1;
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    },
  },
  {
    id: 'MOD-C1',
    title: 'core 有 ./contract，模块从它取协议',
    run() {
      const faces = moduleSources().filter((file) => /\/src\/(?:host\.ts|client\.tsx)(?:\.tpl)?$/.test(file));
      const findings = contractEntryFindings(existsSync(CORE_CONTRACT), JSON.parse(read(CORE_PKG)), faces);
      return findings.length === 0 ? pass('协议入口唯一') : fail(findings);
    },
    selfTest() {
      return contractEntryFindings(false, { exports: {} }, []).length === 2;
    },
  },
  {
    id: 'MOD-C2',
    title: '模块不本地重声明协议',
    run() {
      const findings = [];
      for (const file of moduleSources()) {
        if (!/\/src\/.*\.(?:ts|tsx|tpl)$/.test(file)) continue;
        const rel = relative(ROOT, file).split('\\').join('/');
        for (const decl of protocolDeclarationsOf(read(file))) {
          findings.push(finding(rel, decl.line, `本地声明 ${decl.name}`, '删掉，改 import type from @dsh-workbench/core/contract'));
        }
      }
      return findings.length === 0 ? pass('模块协议只有一处') : fail(findings);
    },
    selfTest() {
      return protocolDeclarationsOf('interface UnitModuleFace {}').length === 1;
    },
  },
  {
    id: 'MOD-C3',
    title: '模块契约 import 必须 type-only',
    run() {
      const findings = [];
      for (const file of moduleSources()) {
        const rel = relative(ROOT, file).split('\\').join('/');
        for (const line of contractImportLinesOf(read(file))) {
          findings.push(finding(rel, line.line, '运行期 import 了 contract', '改成 import type'));
        }
      }
      return findings.length === 0 ? pass('契约 import 都是类型') : fail(findings);
    },
    selfTest() {
      return contractImportLinesOf("import { X } from '@dsh-workbench/core/contract';\n").length === 1;
    },
  },
  {
    id: 'MOD-M1',
    title: '模块 model 有配对测试',
    run() {
      const findings = missingModelTests(moduleSources()).map((rel) =>
        finding(rel, 1, 'model 没有配对测试', '加 src/model/__tests__/model.test.ts；不要用空断言凑覆盖率'),
      );
      return findings.length === 0 ? pass('model 都有测试') : fail(findings);
    },
    selfTest() {
      const tmp = mkdtempSync(join(tmpdir(), 'dsh-gate-model-'));
      try {
        const file = join(tmp, 'src/model/probe.ts');
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, 'export const probe = 1;\n');
        const missing = missingModelTests([file], tmp).length;
        const nested = join(tmp, 'src/model/__tests__/probe.test.ts');
        mkdirSync(dirname(nested), { recursive: true });
        writeFileSync(nested, '');
        return missing === 1 && missingModelTests([file], tmp).length === 0;
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    },
  },
  {
    id: 'TEST-1',
    title: '测试文件住在 __tests__ 目录里',
    run() {
      const findings = misplacedTests(repoFiles()).map((rel) =>
        finding(rel, 1, '测试文件不在 __tests__ 目录里', '挪进同目录的 __tests__/，相对路径的 import 各退一级'),
      );
      return findings.length === 0 ? pass('测试文件都在 __tests__ 里') : fail(findings);
    },
    selfTest() {
      return misplacedTests(['src/a/b.test.ts', 'src/a/__tests__/b.test.ts']).length === 1;
    },
  },
  {
    id: 'MOD-L1',
    title: '模块 model / messages 不碰宿主与 UI',
    run() {
      const banned = [/^react(?:\/|$)/, /^react-dom(?:\/|$)/, /^@deepseek-ai\//, /^@dsh-workbench\/core(?:\/client)?$/, /^@dsh-workbench\/shared\/host$/, /^node:/, /opencli/i, /components\//, /(?:\.\/)?host$/, /(?:\.\/)?client$/];
      const findings = [];
      for (const file of moduleSources()) {
        const rel = relative(ROOT, file).split('\\').join('/');
        if (!/\/src\/(?:model\/|messages\.ts)/.test(rel)) continue;
        for (const imported of importsOf(read(file))) {
          if (!banned.some((pattern) => pattern.test(imported.spec))) continue;
          findings.push(finding(rel, imported.line, `model import 了 ${imported.spec}`, '纯逻辑只依赖 model / 类型'));
        }
      }
      return findings.length === 0 ? pass('model 是纯的') : fail(findings);
    },
    selfTest() {
      return tempImportTest('packages/m/src/model/a.ts', "import { x } from 'react';\n", /^react(?:\/|$)/);
    },
  },
  {
    id: 'MOD-L2',
    title: '模块 components 不碰宿主与 node',
    run() {
      const banned = [/^@dsh-workbench\/shared\/host$/, /^@dsh-workbench\/core$/, /^node:/, /opencli/i, /^(?:\.\/)?host$/, /^(?:\.\/)?client$/];
      const findings = [];
      for (const file of moduleSources()) {
        const rel = relative(ROOT, file).split('\\').join('/');
        if (!/\/src\/components\//.test(rel)) continue;
        for (const imported of importsOf(read(file))) {
          if (!banned.some((pattern) => pattern.test(imported.spec))) continue;
          findings.push(finding(rel, imported.line, `component import 了 ${imported.spec}`, '组件只拿数据与回调'));
        }
      }
      return findings.length === 0 ? pass('components 只面向浏览器') : fail(findings);
    },
    selfTest() {
      return tempImportTest('packages/m/src/components/a.tsx', "import { readFileSync } from 'node:fs';\n", /^node:/);
    },
  },
  {
    id: 'MOD-C4',
    title: '模块不依赖外壳源码',
    run() {
      const findings = [];
      for (const file of moduleSources()) {
        const rel = relative(ROOT, file).split('\\').join('/');
        for (const imported of importsOf(read(file))) {
          if (imported.spec !== '@/app' && !imported.spec.startsWith('@/app/') && !imported.spec.startsWith('@/modules/')) continue;
          findings.push(finding(rel, imported.line, `模块 import 了外壳路径 ${imported.spec}`, '只走 kit / mount deps'));
        }
      }
      return findings.length === 0 ? pass('模块不碰外壳源码') : fail(findings);
    },
    selfTest() {
      return tempImportTest('packages/m/src/model/a.ts', "import { x } from '@/app/x';\n", /^@\/app(?:\/|$)/);
    },
  },
  {
    id: 'MOD-M2',
    title: '清单 / 卡片 / 面一致',
    run() {
      const findings = modulePackages().flatMap(({ dir, pkg }) => moduleManifestFindings(pkg, dir));
      return findings.length === 0 ? pass('模块清单 / 面文件齐全') : fail(findings);
    },
    selfTest() {
      return moduleManifestFindings({ dsh: { workbench: { unit: 'x' }, workbenchFaces: {} } }, ROOT).length === 3;
    },
  },
  {
    id: 'MOD-L3',
    title: '模块面不跨运行时',
    run() {
      const findings = [];
      for (const file of moduleSources()) {
        const rel = relative(ROOT, file).split('\\').join('/');
        const isHost = /\/src\/host\.ts(?:\.tpl)?$/.test(rel);
        const isClient = /\/src\/client\.tsx(?:\.tpl)?$/.test(rel);
        if (!isHost && !isClient) continue;
        for (const imported of importsOf(read(file))) {
          const bad = isHost
            ? /^react(?:\/|$)/.test(imported.spec) || imported.spec === '@dsh-workbench/core/client'
            : /^node:/.test(imported.spec) || imported.spec === '@dsh-workbench/shared/host' || /(?:\.\/)?host$/.test(imported.spec);
          if (!bad) continue;
          findings.push(finding(rel, imported.line, `面跨运行时：${imported.spec}`, 'host 面只做宿主接线；client 面只做浏览器接线'));
        }
      }
      return findings.length === 0 ? pass('两侧面各住各的') : fail(findings);
    },
    selfTest() {
      return tempImportTest('packages/m/src/host.ts', "import { createElement } from 'react';\n", /^react(?:\/|$)/);
    },
  },
  {
    id: 'SK-2',
    title: 'skill 链接存在',
    run() {
      const findings = missingLinksOf(walkMarkdown(SKILL_DIR), SKILL_DIR);
      return findings.length === 0 ? pass('链接都通') : fail(findings);
    },
    selfTest() {
      const tmp = mkdtempSync(join(tmpdir(), 'dsh-gate-links-'));
      try {
        const file = join(tmp, 'a.md');
        writeFileSync(file, '[x](missing.md)\n');
        return missingLinksOf([file], tmp).length === 1;
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    },
  },
  {
    id: 'SK-3',
    title: 'SKILL.md 索引覆盖',
    run() {
      const findings = missingIndexEntries(read(join(SKILL_DIR, 'SKILL.md')), walkMarkdown(SKILL_DIR), SKILL_DIR);
      return findings.length === 0 ? pass('索引全覆盖') : fail(findings);
    },
    selfTest() {
      const tmp = mkdtempSync(join(tmpdir(), 'dsh-gate-index-'));
      try {
        const file = join(tmp, 'A.md');
        writeFileSync(file, '# A\n');
        return missingIndexEntries('# SKILL\n', [file], tmp).length === 1;
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    },
  },
  {
    id: 'DOC-1',
    title: 'ARCHITECTURE roles 由 config 渲染',
    run() {
      const text = read(ARCHITECTURE);
      const ok = text.includes('arch-guard:begin roles') && text.includes('arch-guard:end roles');
      return ok ? pass('roles 管理块存在') : fail([finding('ARCHITECTURE.md', 1, '缺 roles 管理块', '用 --render-docs 生成')]);
    },
    selfTest() {
      return hasRolesBlock('<!-- arch-guard:begin roles -->\n<!-- arch-guard:end roles -->');
    },
  },
  {
    id: 'DOC-2',
    title: 'CHECKS 元数据 + --list',
    run() {
      const findings = checksMetadataFindings(read(join(MODULE_TOOLS_SRC, 'check.mjs')));
      return findings.length === 0 ? pass('元数据可生成文档') : fail(findings);
    },
    selfTest() {
      return checksMetadataFindings('').length === 3;
    },
  },
  {
    id: 'DOC-3',
    title: '第一方文档的链接 / 锚点 / §N 引用',
    run() {
      const files = firstPartyDocs();
      const findings = [...missingDocLinksOf(files), ...referenceFindingsOf(files)];
      return findings.length === 0 ? pass(`${files.length} 份文档链接都通`) : fail(findings);
    },
    selfTest() {
      const tmp = mkdtempSync(join(tmpdir(), 'dsh-gate-doclinks-'));
      try {
        writeFileSync(join(tmp, 'ARCHITECTURE.md'), '# A\n\n## 1. 包\n');
        writeFileSync(join(tmp, 'a.md'), '[x](missing.md)\n[y](#nope)\n[z](ARCHITECTURE.md) §9\n');
        const files = [join(tmp, 'a.md'), join(tmp, 'ARCHITECTURE.md')];
        return missingDocLinksOf(files, tmp).length === 2 && referenceFindingsOf(files).length === 1;
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    },
  },
  {
    id: 'CHAIN-1',
    title: '目标报告有入口',
    run() {
      const pkg = JSON.parse(read(join(ROOT, 'package.json')));
      return packageHasScript(pkg, 'check:gates:target')
        ? pass('check:gates:target 已存在')
        : fail([finding('package.json', 1, '缺 check:gates:target', '加脚本入口')]);
    },
    selfTest() {
      return packageHasScript({ scripts: { 'check:gates:target': 'x' } }, 'check:gates:target');
    },
  },
  {
    id: 'CHAIN-2',
    title: '目标报告与默认 check 的并入时机',
    run() {
      const pkg = JSON.parse(read(join(ROOT, 'package.json')));
      const allGreen = GATES.filter((gate) => gate.id !== 'CHAIN-2').every((gate) => gate.run().status === 'pass');
      const inCheck = defaultCheckHasTarget(pkg);
      if (chainTargetPolicy(allGreen, inCheck)) return pass(allGreen ? '全绿，目标报告已并入 check' : '仍有红，目标报告独立于 check');
      return fail([
        finding(
          'package.json',
          1,
          allGreen ? '全绿了但目标报告还没并入 check' : '目标报告已在默认 check 里',
          allGreen ? '把 check:gates:target --fail-on-red 并入 check' : '红全部清掉后再并入',
        ),
      ]);
    },
    selfTest() {
      return chainTargetPolicy(false, true) === false && chainTargetPolicy(true, false) === false;
    },
  },
  {
    id: 'WB-A2',
    title: '外部读只经 DataReader',
    run() {
      const hasPort = walkCode(join(SHARED_SRC, 'contract')).some((file) =>
        /\b(?:interface|type)\s+DataReader\b/.test(read(file)),
      );
      const findings = dataReaderFindings(hasPort);
      return findings.length === 0 ? pass('DataReader 端口在场') : fail(findings);
    },
    selfTest() {
      return dataReaderFindings(false).length === 1;
    },
  },
  {
    id: 'COV-1',
    title: '关键文件覆盖率',
    run() {
      const file = join(ROOT, 'packages/core/coverage/coverage-summary.json');
      if (!existsSync(file)) return fail([finding('packages/core/coverage/coverage-summary.json', 1, '缺覆盖率报告', '先跑 coverage 再评')]);
      const findings = coverageFindings(JSON.parse(read(file)));
      return findings.length === 0 ? pass('覆盖报告包含 kernel / model') : fail(findings);
    },
    selfTest() {
      return coverageFindings({}).length === 1 && coverageFindings({ '/x/src/kernel/a.ts': {} }).length === 0;
    },
  },
];

function walkMarkdown(dir) {
  const out = [];
  const visit = (here) => {
    for (const entry of readdirSync(here)) {
      const full = join(here, entry);
      if (statSync(full).isDirectory()) visit(full);
      else if (entry.endsWith('.md')) out.push(full);
    }
  };
  if (existsSync(dir)) visit(dir);
  return out;
}

function linksOf(text) {
  return [...text.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1]);
}

function opencliFindings(files, base) {
  return scanImports(
    files,
    base,
    (spec, rel) =>
      !rel.startsWith('adapters/') &&
      !rel.startsWith('modules/panels/model/diy-') &&
      !/^(?:@\/|\.{1,2}\/).*adapters\/opencli\//.test(spec) &&
      /opencli/i.test(spec),
    (spec) => `opencli import：${spec}`,
    '读走 DataReader；侦察/DIY 放 G2',
  ).map((one) => ({ ...one, file: `src/${one.file}` }));
}

function browserHostFindings(graph, base) {
  const findings = [];
  for (const file of graph) {
    const rel = `src/${relOf(file, base)}`;
    if (
      rel.startsWith('src/kernel/host/') ||
      rel.startsWith('src/shared/api/host/') ||
      rel === 'src/app/units/host.ts' ||
      rel === 'src/app/host.ts'
    ) {
      findings.push(finding(rel, 1, '浏览器入口可达宿主文件', '把宿主代码移出 client 可达图'));
    }
  }
  return findings;
}

function sharedHostFindings(graph, base) {
  const findings = [];
  for (const file of graph) {
    const rel = `src/${relOf(file, base)}`;
    for (const imported of importsOf(read(file))) {
      if (imported.typeOnly || imported.spec !== '@dsh-workbench/shared/host') continue;
      findings.push(finding(rel, imported.line, '浏览器图包含 shared/host', '浏览器侧改走 kit / 类型'));
    }
  }
  return findings;
}

function contractEntryFindings(contractExists, pkg, faces) {
  const findings = [];
  if (!contractExists) {
    findings.push(finding('packages/core/src/kernel/contract/index.ts', 1, '缺 core/contract 入口', '新增 type-only 入口并 build-types 出货'));
  }
  if (pkg.exports?.['./contract'] === undefined) {
    findings.push(finding('packages/core/package.json', 1, 'exports 没有 ./contract', '加 type-only 导出'));
  }
  if (findings.length === 0) {
    for (const file of faces) {
      const rel = relative(ROOT, file).split('\\').join('/');
      if (!importsOf(read(file)).some((one) => one.spec === '@dsh-workbench/core/contract')) {
        findings.push(finding(rel, 1, '面没有从 core/contract 取类型', '改 import type'));
      }
    }
  }
  return findings;
}

function checksMetadataFindings(text) {
  const findings = [];
  if (!/summary:/.test(text)) findings.push(finding('packages/module-tools/src/check.mjs', 1, 'CHECKS 缺 summary', '补 title / summary / layer'));
  if (!/layer:/.test(text)) findings.push(finding('packages/module-tools/src/check.mjs', 1, 'CHECKS 缺 layer', '补 title / summary / layer'));
  if (!/--list/.test(text)) findings.push(finding('packages/module-tools/src/check.mjs', 1, '没有 --list', '加 --list --json'));
  return findings;
}

const SHARED_IMPLEMENTATION_IMPORTS = new Set(['opencli', 'execa', 'proper-lockfile', 'write-file-atomic']);

function sharedAdapterFindings({ hasAdaptersDir, deps, imports }) {
  const findings = [];
  if (hasAdaptersDir) {
    findings.push(finding('packages/shared/src/adapters/', 1, 'shared 仍有适配器实现', '把实现搬进对应 adapter 包'));
  }
  for (const dep of deps) {
    if (dep.startsWith('@dsh-workbench/')) {
      findings.push(finding('packages/shared/package.json', 1, `shared 依赖了 ${dep}`, 'shared 只放契约与纯工具'));
    }
  }
  for (const [file, spec] of imports) {
    if (/^@dsh-workbench\/(?:core|adapter-)/.test(spec)) {
      findings.push(finding(file, 1, `shared import 了 ${spec}`, 'shared 不 import 外壳或适配器实现'));
      continue;
    }
    if (SHARED_IMPLEMENTATION_IMPORTS.has(spec)) {
      findings.push(finding(file, 1, `shared import 了 ${spec}`, '执行 / 锁 / 原子写属于适配器实现'));
    }
  }
  return findings;
}

function dataReaderFindings(hasPort) {
  return hasPort
    ? []
    : [finding('packages/shared/src/contract/data.ts', 1, '缺 DataReader 端口', '先落 contract/data.ts，再把外部读收口')];
}

function modulePackages() {
  const out = [];
  const dir = join(ROOT, 'packages');
  for (const entry of readdirSync(dir)) {
    const file = join(dir, entry, 'package.json');
    if (!existsSync(file)) continue;
    const pkg = JSON.parse(read(file));
    if (pkg.dsh?.workbench === undefined) continue;
    out.push({ dir: join(dir, entry), pkg });
  }
  return out;
}

function moduleManifestFindings(pkg, dir) {
  const findings = [];
  const workbench = pkg.dsh?.workbench;
  if (typeof workbench?.unit !== 'string' || workbench.unit === '') {
    findings.push(finding(`${relative(ROOT, join(dir, 'package.json')).split('\\').join('/')}`, 1, 'dsh.workbench.unit 缺失', '补单元 id'));
  }
  const faces = pkg.dsh?.workbenchFaces ?? {};
  for (const side of ['host', 'client']) {
    const rel = faces[side];
    if (typeof rel !== 'string' || !existsSync(join(dir, rel))) {
      findings.push(finding(`${relative(ROOT, join(dir, 'package.json')).split('\\').join('/')}`, 1, `workbenchFaces.${side} 不存在`, `补 ${side} 面文件`));
    }
  }
  const title = workbench?.title;
  if (
    typeof title !== 'object' ||
    title === null ||
    typeof title.zh !== 'string' ||
    title.zh.trim() === '' ||
    typeof title.en !== 'string' ||
    title.en.trim() === ''
  ) {
    findings.push(
      finding(
        `${relative(ROOT, join(dir, 'package.json')).split('\\').join('/')}`,
        1,
        'dsh.workbench.title 缺失（zh / en 各一份）',
        '补名字：`"title": { "zh": "…", "en": "…" }`',
      ),
    );
  }
  return findings;
}

function coverageFindings(summary) {
  const keys = Object.keys(summary).filter(
    (key) => key.includes('/src/kernel/') || /\/src\/modules\/[^/]+\/model\//.test(key),
  );
  return keys.length === 0
    ? [finding('packages/core/coverage/coverage-summary.json', 1, '覆盖报告没有 kernel / model 文件', '先跑 coverage 再评')]
    : [];
}

function tempImportTest(rel, source, pattern) {
  const tmp = mkdtempSync(join(tmpdir(), 'dsh-gate-import-'));
  try {
    const file = join(tmp, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, source);
    return scanImports([file], tmp, (spec) => pattern.test(spec), () => 'x', 'fix').length === 1;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const DOC_SKIP = new Set([
  'node_modules',
  '.git',
  'dist',
  'coverage',
  'site-dist',
  '.verify',
  '.doc-audit',
  'private-docs',
  '.agents',
  'src.hidden',
]);

function firstPartyDocs() {
  const out = [];
  const visit = (here) => {
    for (const entry of readdirSync(here)) {
      if (DOC_SKIP.has(entry)) continue;
      const full = join(here, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        if (full !== ROOT) visit(full);
        continue;
      }
      if (entry.endsWith('.md')) out.push(full);
    }
  };
  visit(ROOT);
  return out.sort();
}

function proseLinesOf(text) {
  const out = [];
  let fenced = false;
  for (const [index, line] of text.split('\n').entries()) {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    out.push({ line: index + 1, text: line.replace(/`[^`]*`/g, '') });
  }
  return out;
}

function slugOf(text) {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_~]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

function headingSlugsOf(text) {
  const slugs = new Set();
  for (const { text: line } of proseLinesOf(text)) {
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading !== null) slugs.add(slugOf(heading[1]));
    for (const anchor of line.matchAll(/<a\s+(?:id|name)="([^"]+)"/g)) slugs.add(anchor[1]);
  }
  return slugs;
}

function resolveDocTarget(file, ref) {
  const clean = ref.split('?')[0];
  const direct = clean.startsWith('/') ? join(ROOT, clean) : resolve(dirname(file), clean);
  if (existsSync(direct)) return direct;
  const base = clean.split('/').pop();
  const matches = firstPartyDocs().filter((one) => one.split('/').pop() === base);
  return matches.length === 1 ? matches[0] : undefined;
}

function docLinksOf(text) {
  const out = [];
  for (const { line, text: flat } of proseLinesOf(text)) {
    for (const match of flat.matchAll(/\]\(([^)\s]+)\)/g)) out.push({ link: match[1], line });
  }
  return out;
}

function missingDocLinksOf(files, base = ROOT) {
  const findings = [];
  for (const file of files) {
    const rel = relative(base, file).split('\\').join('/');
    const text = read(file);
    const slugs = headingSlugsOf(text);
    for (const { link, line } of docLinksOf(text)) {
      if (/^(?:https?:|mailto:)/.test(link)) continue;
      if (link.startsWith('#')) {
        if (!slugs.has(decodeURIComponent(link.slice(1)))) {
          findings.push(finding(rel, line, `锚点不存在 ${link}`, '改成现有标题的锚点'));
        }
        continue;
      }
      const [pathPart, anchor] = link.split('#');
      const target = resolveDocTarget(file, pathPart);
      if (target === undefined || !existsSync(target)) {
        findings.push(finding(rel, line, `死链 ${link}`, '修链接或删文件'));
        continue;
      }
      if (anchor === undefined || anchor === '' || !target.endsWith('.md')) continue;
      if (!headingSlugsOf(read(target)).has(decodeURIComponent(anchor))) {
        findings.push(finding(rel, line, `锚点不存在 ${link}`, '改成目标文档现有标题的锚点'));
      }
    }
  }
  return findings;
}

function referenceFindingsOf(files) {
  const findings = [];
  for (const file of files) {
    const rel = relative(ROOT, file).split('\\').join('/');
    for (const { line, text } of proseLinesOf(read(file))) {
      for (const match of text.matchAll(/(?:\]\(([^)\s]+)\)|([A-Za-z0-9_./-]+\.md))\s*§(\d+)(?!\.\d)/g)) {
        const ref = match[1] ?? match[2];
        const num = match[3];
        const target = resolveDocTarget(file, ref);
        if (target === undefined || !target.endsWith('.md')) continue;
        const numbers = new Set();
        for (const one of proseLinesOf(read(target))) {
          const heading = one.text.match(/^#{1,6}\s+(\d+)(?:[.\s]|$)/);
          if (heading !== null) numbers.add(heading[1]);
        }
        if (numbers.has(num)) continue;
        findings.push(
          finding(rel, line, `§${num} 在 ${relative(ROOT, target).split('\\').join('/')} 里没有对应章节`, '改章节号或换成精确链接'),
        );
      }
    }
  }
  return findings;
}

function missingLinksOf(files, base) {
  const findings = [];
  for (const file of files) {
    const rel = relative(base, file).split('\\').join('/');
    for (const link of linksOf(read(file))) {
      const target = link.split('#')[0];
      if (target === '') continue;
      if (existsSync(resolve(dirname(file), target))) continue;
      findings.push(finding(rel, 1, `死链 ${link}`, '修链接或删文件'));
    }
  }
  return findings;
}

function missingIndexEntries(router, files, base) {
  const findings = [];
  for (const file of files) {
    const rel = relative(base, file).split('\\').join('/');
    if (rel === 'SKILL.md') continue;
    if (router.includes(rel.split('/').pop() ?? rel)) continue;
    findings.push(finding(rel, 1, '索引没有指向', '在 SKILL.md 补路由'));
  }
  return findings;
}

function packageHasScript(pkg, name) {
  return typeof pkg.scripts?.[name] === 'string';
}

function defaultCheckHasTarget(pkg) {
  return String(pkg.scripts?.check ?? '').includes('check:gates:target');
}

function chainTargetPolicy(allGreen, inCheck) {
  return allGreen ? inCheck : !inCheck;
}

function selfTest() {
  const results = [];
  for (const gate of GATES) {
    if (gate.selfTest !== undefined) {
      results.push({ id: gate.id, ok: gate.selfTest(), note: 'synthetic fixture' });
      continue;
    }
    const result = gate.run();
    results.push({
      id: gate.id,
      ok: result.status === 'fail',
      note: result.status === 'fail' ? 'current red fixture' : '缺负例',
    });
  }
  for (const one of results) console.log(`${one.ok ? '✔' : '✖'} ${one.id} ${one.note}`);
  const missing = results.filter((one) => !one.ok);
  console.log(`\n负例覆盖：${results.length - missing.length}/${results.length}${missing.length === 0 ? '' : ` · 缺：${missing.map((one) => one.id).join(' / ')}`}`);
  return missing.length === 0;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }
  const only = args.find((arg) => arg.startsWith('--only='))?.slice('--only='.length);
  const failOnRed = args.includes('--fail-on-red');
  const selected = only === undefined ? GATES : GATES.filter((gate) => gate.id === only);
  if (selected.length === 0) {
    console.error(`不认识的门禁：${only}`);
    process.exit(2);
  }

  let red = 0;
  let green = 0;
  let skipped = 0;
  for (const gate of selected) {
    const result = gate.run();
    if (result.status === 'fail') {
      red += 1;
      console.log(`✖ ${gate.id} ${gate.title}（${result.findings.length} 条）`);
      for (const one of result.findings.slice(0, 8)) {
        console.log(`  ${one.file}:${one.line} ${one.text}`);
        console.log(`    → ${one.fix}`);
      }
      if (result.findings.length > 8) console.log(`  …还有 ${result.findings.length - 8} 条`);
    } else if (result.status === 'skip') {
      skipped += 1;
      console.log(`○ ${gate.id} ${gate.title}：${result.note}`);
    } else {
      green += 1;
      console.log(`✔ ${gate.id} ${gate.title}${result.note === '' ? '' : `：${result.note}`}`);
    }
  }
  console.log(`\n目标门禁：${green} 绿 · ${red} 红 · ${skipped} 暂缓（红是迁移清单，不是门禁失败）`);
  if (failOnRed && red > 0) process.exit(1);
}

main();
