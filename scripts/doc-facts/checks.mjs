import { fencedAfter, lineOfIndex, readText } from './lib.mjs';
import { sharedExports, workspacePackages } from './facts.mjs';

function finding(file, line, message, fix) {
  return { file, line, message, fix };
}

function headingLine(text, heading) {
  const index = text.indexOf(heading);
  return index === -1 ? 1 : lineOfIndex(text, index);
}

function packageRow(section, dir) {
  return section.split('\n').find((line) => line.startsWith(`| \`${dir}/\``));
}

export function packageTable(ctx = {}) {
  const arch = ctx.arch ?? readText('ARCHITECTURE.md');
  const agents = ctx.agents ?? readText('AGENTS.md');
  const packages = ctx.packages ?? workspacePackages();
  const findings = [];
  const start = arch.indexOf('## 1. 包');
  const end = arch.indexOf('### 1.1');
  if (start === -1 || end === -1 || end < start) {
    return [finding('ARCHITECTURE.md', 1, '缺 §1 包表 / §1.1 依赖图', '恢复「## 1. 包」与「### 1.1 依赖图」两节')];
  }
  const section = arch.slice(start, end);
  const rows = [...section.matchAll(/^\| `(packages\/[^`]+)`/gm)].map((match) => match[1]);
  const tableLine = headingLine(arch, '## 1. 包');
  for (const pkg of packages) {
    const row = packageRow(section, pkg.dir);
    if (row === undefined) {
      findings.push(
        finding(
          'ARCHITECTURE.md',
          tableLine,
          `§1 包表缺 ${pkg.dir}/`,
          `加一行：| \`${pkg.dir}/\` | … | ${pkg.manifest.private === true ? '私有，不发布' : pkg.manifest.name} |`,
        ),
      );
      continue;
    }
    if (pkg.manifest.private !== true && !row.includes(pkg.manifest.name)) {
      findings.push(
        finding('ARCHITECTURE.md', tableLine, `${pkg.dir}/ 的发布名与 package.json 不一致`, `发布名列写 ${pkg.manifest.name}`),
      );
    }
  }
  for (const row of rows) {
    const dir = row.replaceAll('`', '').replace(/\/$/, '');
    if (!packages.some((pkg) => pkg.dir === dir)) {
      findings.push(finding('ARCHITECTURE.md', tableLine, `§1 包表多出 ${dir}/（磁盘上没有）`, '删掉这一行'));
    }
  }
  for (const pkg of packages) {
    if (!agents.includes(`${pkg.dir}/`)) {
      findings.push(finding('AGENTS.md', headingLine(agents, '## 仓库结构'), `仓库结构表缺 ${pkg.dir}/`, '补一行，写它是什么'));
    }
  }
  return findings;
}

export function depEdges(ctx = {}) {
  const arch = ctx.arch ?? readText('ARCHITECTURE.md');
  const packages = ctx.packages ?? workspacePackages();
  const findings = [];
  const block = fencedAfter(arch, '### 1.1 依赖图');
  if (block === undefined) {
    return [finding('ARCHITECTURE.md', headingLine(arch, '### 1.1 依赖图'), '缺 §1.1 依赖图代码块', '恢复 ```text 依赖图')];
  }
  const listed = new Set();
  const edges = new Map();
  for (const line of block.text.split('\n')) {
    const names = [...line.matchAll(/@dsh-workbench\/[a-z0-9-]+/g)].map((match) => match[0]);
    if (names.length === 0) continue;
    for (const name of names) listed.add(name);
    const arrow = line.split('→')[1];
    if (arrow === undefined) continue;
    const targets = arrow
      .split('/')
      .map((one) => one.trim())
      .filter(Boolean)
      .map((one) => `@dsh-workbench/${one.startsWith('adapter-') || one.startsWith('adapters-') ? one : `adapter-${one}`}`);
    edges.set(names[0], new Set(targets));
  }
  for (const [left, rights] of edges) {
    const pkg = packages.find((one) => one.manifest.name === left);
    if (pkg === undefined) {
      findings.push(finding('ARCHITECTURE.md', block.line, `依赖图里的 ${left} 不是 workspace 包`, '改成真实包名'));
      continue;
    }
    const deps = pkg.manifest.dependencies ?? {};
    for (const right of rights) {
      if (typeof deps[right] !== 'string') {
        findings.push(finding('ARCHITECTURE.md', block.line, `依赖图多出边 ${left} → ${right}`, '删掉这条边，或先确认真实依赖'));
      }
    }
  }
  const defaults = packages.find((one) => one.manifest.name === '@dsh-workbench/adapters-default');
  if (defaults !== undefined) {
    for (const dep of Object.keys(defaults.manifest.dependencies ?? {})) {
      if (dep.startsWith('@dsh-workbench/adapter-') && !listed.has(dep)) {
        findings.push(finding('ARCHITECTURE.md', block.line, `依赖图漏掉 ${defaults.manifest.name} → ${dep}`, '把实现包列进默认集合下面'));
      }
    }
  }
  for (const pkg of packages) {
    if (!pkg.manifest.name.startsWith('@dsh-workbench/adapter-')) continue;
    const actual = Object.keys(pkg.manifest.dependencies ?? {}).filter((one) => one.startsWith('@dsh-workbench/adapter-'));
    const drawn = edges.get(pkg.manifest.name) ?? new Set();
    for (const dep of actual) {
      if (!drawn.has(dep)) {
        findings.push(finding('ARCHITECTURE.md', block.line, `依赖图漏掉边 ${pkg.manifest.name} → ${dep}`, '补进对应行的 → 后面'));
      }
    }
  }
  const core = packages.find((one) => one.manifest.name === '@dsh-workbench/core');
  if (core !== undefined && !block.text.includes('(dynamic fallback) @dsh-workbench/adapters-default')) {
    findings.push(
      finding(
        'ARCHITECTURE.md',
        block.line,
        '依赖图没有标出 core → adapters-default 的动态兜底',
        '补 "(dynamic fallback) @dsh-workbench/adapters-default"',
      ),
    );
  }
  return findings;
}

const EXPORT_TARGETS = [
  { file: 'packages/shared/README.md', heading: '## ' },
  { file: 'AGENTS.md', heading: '## 仓库结构' },
  { file: 'ARCHITECTURE.md', heading: '### 1.2' },
];

export function sharedExportsCheck(ctx = {}) {
  const expected = (ctx.keys ?? sharedExports()).map((key) => `@dsh-workbench/shared${key.slice(1)}`);
  const texts = ctx.texts ?? Object.fromEntries(EXPORT_TARGETS.map((one) => [one.file, readText(one.file)]));
  const findings = [];
  for (const target of EXPORT_TARGETS) {
    const text = texts[target.file];
    if (typeof text !== 'string') continue;
    for (const key of expected) {
      if (text.includes(key)) continue;
      findings.push(
        finding(target.file, headingLine(text, target.heading), `没有列出 shared 的导出面 ${key}`, `在入口/导出面清单里补上 ${key}`),
      );
    }
  }
  return findings;
}
