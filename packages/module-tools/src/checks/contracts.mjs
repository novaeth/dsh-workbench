import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  OPENCLI_CATALOG_ENV,
  OPENCLI_NPM_PACKAGE,
  buildSupplyIndex,
  createHostKit,
  hostSurface,
  readDeclaration,
  recipeProblemOf,
  resolveRecipeOf,
} from '@dsh-workbench/shared/host';
import {
  DECLARED_TOOLS_FILE,
  declaredToolsProblemOf,
  declaredToolsWithoutKey,
  declaredToolsApplies,
} from '../contract/declared-tools.mjs';
import { discoverPackages, workspaceRootOf } from '../support/discover.mjs';
import { scopedPackages, scopeNote } from '../support/scope.mjs';
import {
  HEAD_BUDGETS,
  LONG_SCALE,
  budgetProbeOf,
  headlineFloorProblemsOf,
  headlineProblemsOf,
  planProblemsOf,
  probeCallOf,
} from '../support/approval-plan.mjs';
import { loadRegisteredClientFace } from '../support/client-face.mjs';
import { readDesign } from '../contract/design.mjs';
import { DEFAULT_FACES } from '../contract/faces.mjs';
import { datasourceProblemOf } from '../contract/datasource-file.mjs';
import { sitesProblemOf } from '../contract/sites-file.mjs';
import { SEED_SHORT } from '../build/seed.mjs';

const ROOT = process.env.DSH_WB_ROOT ?? fileURLToPath(new URL('../../../../', import.meta.url));

const SEED = SEED_SHORT;

const PLATFORMS = new Set(['web']);

const UNIT_ID = /^[a-z][a-z0-9-]*$/;

const SHELL = '@dsh-workbench/core';

export { HEAD_BUDGETS } from '../support/approval-plan.mjs';

export const title = '模块契约';

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function withoutComments(source) {
  let out = '';
  let quote = '';
  for (let index = 0; index < source.length; index += 1) {
    const ch = source[index];
    const next = source[index + 1];
    if (quote !== '') {
      out += ch;
      if (ch === '\\') {
        out += next ?? '';
        index += 1;
      } else if (ch === quote) {
        quote = '';
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index += 1;
      out += '\n';
      continue;
    }
    if (ch === '/' && next === '*') {
      index += 2;
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) index += 1;
      index += 1;
      continue;
    }
    out += ch;
  }
  return out;
}

function isApostrophe(source, index, ch) {
  if (ch === '`') return false;
  return /[A-Za-z0-9]/.test(source[index - 1] ?? '') && /[A-Za-z0-9]/.test(source[index + 1] ?? '');
}

function visibleMask(source) {
  const mask = new Uint8Array(source.length);
  let quote = '';
  for (let index = 0; index < source.length; index += 1) {
    const ch = source[index];
    if (quote !== '') {
      if (ch === '\\') index += 1;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      if (isApostrophe(source, index, ch)) {
        mask[index] = 1;
        continue;
      }
      quote = ch;
      mask[index] = 1;
      continue;
    }
    mask[index] = 1;
  }
  return mask;
}

function blankStrings(source) {
  let out = '';
  let quote = '';
  for (let index = 0; index < source.length; index += 1) {
    const ch = source[index];
    if (quote !== '') {
      if (ch === '\\') {
        out += '  ';
        index += 1;
      } else if (ch === quote) {
        quote = '';
        out += ch;
      } else {
        out += ' ';
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      if (!isApostrophe(source, index, ch)) quote = ch;
      out += ch;
      continue;
    }
    out += ch;
  }
  return out;
}

function topLevelParts(source) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of source) {
    if (ch === '{' || ch === '[' || ch === '(') depth += 1;
    else if (ch === '}' || ch === ']' || ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

function visibleHits(source, mask, pattern) {
  const hits = [];
  for (const match of source.matchAll(pattern)) {
    if (match.index === undefined || mask[match.index] !== 1) continue;
    hits.push(match[1]);
  }
  return hits;
}

function destructuredSiteNames(source, mask) {
  const names = [];
  let dynamic = false;
  for (const hit of source.matchAll(/\b(?:const|let|var)\s*\{/g)) {
    if (hit.index === undefined || mask[hit.index] !== 1) continue;
    let index = hit.index + hit[0].length;
    let depth = 1;
    let body = '';
    while (index < source.length && depth > 0) {
      const ch = source[index];
      if (mask[index] === 1) {
        if (ch === '{') depth += 1;
        else if (ch === '}') depth -= 1;
      }
      if (depth > 0) body += ch;
      index += 1;
    }
    const tail = source.slice(index).trimStart();
    if (!/^(?::[^=]+)?=\s*SITES\b/.test(tail)) continue;
    for (const part of topLevelParts(body)) {
      const head = part.trim();
      if (head === '') continue;
      if (head.startsWith('...') || head.startsWith('[')) {
        dynamic = true;
        continue;
      }
      const key = head
        .split(':')[0]
        .split('=')[0]
        .trim()
        .replace(/^['"]|['"]$/g, '');
      if (/^[a-z][a-z0-9-]*$/.test(key)) names.push(key);
    }
  }
  return { names, dynamic };
}

function dynamicSitesUsed(code, destructuredDynamic) {
  return (
    destructuredDynamic ||
    /\bSITES\s*\??\s*\[(?!\s*['"])/.test(code) ||
    /\{\s*\.\.\.\s*SITES\b/.test(code) ||
    /\bObject\s*\.\s*(?:values|entries|keys)\s*\(\s*SITES\b/.test(code) ||
    /\bSITES\s+as\s+[A-Za-z_$]/.test(code) ||
    /\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*SITES\b/.test(code)
  );
}

async function unitFaceOf(dir) {
  const entry = join(dir, 'dist/host.js');
  if (!existsSync(entry)) return undefined;
  try {
    const mod = await import(pathToFileURL(entry).href);
    if (typeof mod.apply !== 'function') return undefined;
    const faces = [];
    mod.apply({
      get: (key) =>
        key === 'workbenchUnits'
          ? {
              register(face) {
                faces.push(face);
                return () => {};
              },
            }
          : undefined,
      effect: (fn) => {
        fn();
      },
      logger: { warn: () => {}, info: () => {} },
    });
    return faces[0];
  } catch {
    return undefined;
  }
}

function workbenchRootOf() {
  const configured = process.env.DSH_WORKBENCH_HOME?.trim();
  if (configured !== undefined && configured !== '') return configured;
  const home = process.env.DSH_HOME?.trim();
  return `${home === undefined || home === '' ? join(homedir(), '.dsh') : home}/workbench`;
}

function isolatedRootOf() {
  return `${workbenchRootOf()}/opencli`;
}

function catalogPathOf() {
  const override = process.env[OPENCLI_CATALOG_ENV]?.trim();
  return override === undefined || override === ''
    ? `${isolatedRootOf()}/toolchain/node_modules/${OPENCLI_NPM_PACKAGE}/cli-manifest.json`
    : override;
}

function pluginDirOf(plugin) {
  return `${isolatedRootOf()}/plugins-npm/node_modules/opencli-plugin-${plugin}`;
}

function pluginCommandsIn(dir) {
  try {
    return readdirSync(dir)
      .filter((one) => one.endsWith('.js'))
      .map((one) => one.slice(0, -3))
      .filter((one) => one !== 'index' && !one.startsWith('_'));
  } catch {
    return undefined;
  }
}

function catalogBySite(onBroken = () => {}) {
  const file = catalogPathOf();
  if (!existsSync(file)) return undefined;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    onBroken(`${file}：opencli 的 cli-manifest.json 读不出来（${error instanceof Error ? error.message : String(error)}）`);
    return undefined;
  }
  if (!Array.isArray(parsed)) return undefined;
  const bySite = new Map();
  for (const one of parsed) {
    if (typeof one !== 'object' || one === null) continue;
    const site = text(one['site']);
    const name = text(one['name']);
    if (site === '' || name === '') continue;
    const set = bySite.get(site) ?? new Set();
    set.add(name);
    for (const alias of Array.isArray(one['aliases']) ? one['aliases'] : []) {
      if (typeof alias === 'string' && alias !== '') set.add(alias);
    }
    bySite.set(site, set);
  }
  return bySite;
}

function productsTextOf(dir) {
  let text = '';
  for (const rel of ['dist/host.js', 'client.js']) {
    const full = join(dir, rel);
    if (existsSync(full)) text += `\n${readFileSync(full, 'utf8')}`;
  }
  return text;
}

function sourceFilesOf(dir) {
  const srcDir = join(dir, 'src');
  if (!existsSync(srcDir)) return [];
  const found = [];
  const walk = (at) => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const full = join(at, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
        walk(full);
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        found.push(full);
      }
    }
  };
  walk(srcDir);
  return found;
}

function pluginLiteralsOf(line) {
  if (!/\bplugin\s*:/.test(line)) return [];
  const found = [];
  const direct = /plugin\s*:\s*['"]([^'"]+)['"]/.exec(line);
  if (direct !== null) found.push(direct[1]);
  for (const match of line.matchAll(/\?\?\s*['"]([^'"]+)['"]/g)) found.push(match[1]);
  return found;
}

function hostProductOf(dir) {
  try {
    return readFileSync(join(dir, 'dist/host.js'), 'utf8');
  } catch {
    return '';
  }
}

function designRowsOf(dir, key) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(join(dir, 'design.json'), 'utf8'));
  } catch {
    return undefined;
  }
  return Array.isArray(parsed?.[key]) ? parsed[key] : [];
}

function fakeLongTasks(created) {
  return {
    create(options) {
      created.push(options);

      return {
        start: () => ({}),
        snapshot: () => null,
        active: () => null,
        current: () => [],
        live: () => [],
        recent: () => [],
        stop: () => false,
        seen: () => false,
        onChange: () => () => {},
        recheck: () => false,
        answer: () => false,
        answerable: false,
      };
    },
  };
}

function fakeStore() {
  const files = new Map();
  const one = () => ({
    dir: 'memory',
    read: (name) => (files.has(name) ? files.get(name) : null),
    write: (name, value) => {
      files.set(name, value);
    },
    remove: (name) => {
      files.delete(name);
    },
    list: () => [...files.keys()],
  });
  return { for: () => one(), machine: () => one(), scan: () => [one()] };
}

function fakeShell() {
  return {
    resolve: () => undefined,
    execute: async () => ({
      result: async () => ({
        exitCode: null,
        timedOut: false,
        aborted: false,
        stdout: { text: '', truncated: false },
        stderr: { text: '', truncated: false },
      }),
    }),
  };
}

function fakeWorkspaceRegistry() {
  return {
    get: () => undefined,
    resolveByPath: async () => undefined,
    create: async () => undefined,
  };
}

function fakeDataReader() {
  const missing = async () => ({
    ok: false,
    error: { code: 'invalid-request', message: 'gate: 没有注入 DataReader（模块只能通过 deps.data 读取数据）' },
  });
  return {
    read: missing,
    request: missing,
    requestMany: async (_recipe, calls) => {
      const out = {};
      for (const name of Object.keys(calls)) out[name] = await missing();
      return out;
    },
    submit: missing,
  };
}

function mountOf(face, created, manifest, tools) {
  if (face === undefined) return {};
  if (typeof face.mount !== 'function') return { error: '宿主面没有 mount(deps)' };

  const shell = fakeShell();
  const workspaceRegistry = fakeWorkspaceRegistry();
  const toolRegistry = {
    register(tool) {
      tools.push(tool);
      return () => {};
    },
  };
  try {
    return {
      result: face.mount({
        manifest,
        ctx: {
          get: (key) => {
            if (key === 'tools') return toolRegistry;
            if (key === 'shell') return shell;
            if (key === 'workspaceRegistry') return workspaceRegistry;
            return undefined;
          },
          effect: (fn) => {
            fn();
          },
          provide: () => {},
          logger: { warn: () => {}, info: () => {} },
        },
        manifests: () => [],
        ownedUnits: () => [],
        data: fakeDataReader(),
        ...createHostKit({ libInstallCommand: () => '', surface: hostSurface() }),
        opencliCommand: 'opencli',
        env: {},
        git: {
          origin: async () => ({ kind: 'no-origin' }),
          branch: async () => ({ kind: 'no-branch' }),
          head: async () => ({ kind: 'no-head' }),
        },
        libs: {
          load: async () => {
            throw new Error('gate: libs 未装');
          },
        },
        store: fakeStore(),
        longTasks: fakeLongTasks(created),
        longTaskRuns: () => new Map(),
      }),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

const LONG_TASK_METHODS = ['start', 'snapshot', 'active', 'current', 'live', 'recent', 'stop', 'seen', 'onChange', 'recheck', 'answer'];

const LONG_TASK_RENDERERS = ['useLongTask', 'LongTaskRow', 'longTaskDot'];

function installed(specifier, from) {
  try {
    createRequire(join(from, 'package.json')).resolve(`${packageOf(specifier)}/package.json`);
    return true;
  } catch {
    return false;
  }
}

function barePackage(pkg) {
  return workspaceRootOf(pkg.dir) === pkg.dir && !existsSync(join(pkg.dir, 'node_modules'));
}

function packageOf(specifier) {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function reconcileTools(name, manifest, toolNames) {
  const declared = manifest.tools.map((tool) => tool.name).sort();
  const actual = [...new Set(toolNames.filter((one) => one !== ''))].sort();
  if (declared.join('\n') === actual.join('\n')) return [];
  return [
    `${name}: dsh.workbench 声明的能力与代码真正注册的对不上 —— ` +
      `清单 [${declared.join(', ')}]、代码 [${actual.join(', ')}]。` +
      `清单是工具面的**唯一**来源（工作台按它限制范围、市场按它生成花名册）：` +
      `漏声明 = 该工具不会被收起也不会进入花名册；多声明 = 花名册中存在一个永远不会出现的工具`,
  ];
}

export async function run(options = {}) {
  const packages = discoverPackages({ root: process.cwd() });
  const targets = scopedPackages(packages, options.scope);
  const known = new Set(packages.map((pkg) => pkg.manifest.name));
  const problems = [];
  const warnings = [];
  const unresolvedIn = new Set();
  const unitOwners = new Map();
  const supplyDeclarations = [];
  const readOf = new Map();

  const probeNotes = [];
  const headlineNotes = [];
  let declared = 0;
  let modules = 0;

  for (const pkg of packages) {
    if (pkg.manifest.dsh?.workbench === undefined) continue;
    const unit = pkg.manifest.dsh.workbench.unit;
    if (typeof unit === 'string' && UNIT_ID.test(unit)) {
      const owners = unitOwners.get(unit) ?? [];
      owners.push(pkg.manifest.name);
      unitOwners.set(unit, owners);
    }
    const read = readDeclaration(pkg.manifest.name, pkg.manifest.dsh.workbench);
    readOf.set(pkg.manifest.name, read);
    if (read.manifest !== undefined) {
      supplyDeclarations.push({ id: read.manifest.id, needs: read.manifest.needs ?? [] });
    }
  }

  for (const [unit, owners] of unitOwners) {
    if (owners.length < 2) continue;
    if (options.scope !== undefined && !owners.some((one) => options.scope.has(one))) continue;
    problems.push(
      `${owners.join(' / ')}: 单元 id ${JSON.stringify(unit)} 重复 —— ` +
        `多个包声明了同一个单元；安装后注册表会立即抛出错误（id 会写入持久化配置）`,
    );
  }

  for (const pkg of targets) {
    const name = pkg.manifest.name;
    const dsh = pkg.manifest.dsh;
    if (dsh === undefined) continue;
    declared += 1;

    const patches = dsh.bundle?.patch;
    for (const patch of patches === undefined ? [] : Array.isArray(patches) ? patches : [patches]) {
      if (!existsSync(join(pkg.dir, patch))) {
        problems.push(`${name}: dsh.bundle.patch 指的 ${patch} 不存在`);
      }
    }

    if (dsh.client !== undefined) {
      if (!PLATFORMS.has(dsh.client.platform)) {
        problems.push(`${name}: dsh.client.platform 不认识 —— ${String(dsh.client.platform)}`);
      }
      for (const field of ['inject', 'external']) {
        for (const specifier of dsh.client[field] ?? []) {
          const resolvable =
            SEED.has(specifier) ||
            packageOf(specifier).startsWith('@deepseek-ai/') ||
            known.has(packageOf(specifier)) ||
            installed(specifier, pkg.dir);
          if (!resolvable) {
            unresolvedIn.add(pkg);
            problems.push(
              `${name}: dsh.client.${field} 里的 ${JSON.stringify(specifier)} 落不到图里任何一行 —— ` +
                `既不是 seed 词、也不是平台包、也不在 workspace 里、也不是装进来的依赖（dsh 自己不校验这条，错的声明要等浏览器 require 才炸）`,
            );
          }
        }
      }
    }

    if (dsh.workbench === undefined) continue;
    modules += 1;

    const unit = dsh.workbench.unit;
    if (typeof unit !== 'string' || !UNIT_ID.test(unit)) {
      problems.push(`${name}: dsh.workbench.unit 形状不对 —— ${JSON.stringify(unit)}（应为小写连字符）`);
    } else {
      const shellPkg = packages.find((item) => item.manifest.name === SHELL);
      if (shellPkg !== undefined && existsSync(join(shellPkg.dir, 'src/modules', unit, 'unit.ts'))) {
        problems.push(
          `${name}: 单元 ${JSON.stringify(unit)} 在工作台里还有一份（${SHELL}/src/modules/${unit}/）—— ` +
            `同一个单元不能同时存在于两边：存在两份事实来源，安装模块时注册表会立即抛出错误`,
        );
      }
    }

    const declaredProblem = declaredToolsProblemOf(pkg.dir, dsh.workbench);
    if (declaredProblem !== undefined) {
      problems.push(`${name}: ${declaredProblem}`);
    } else if (declaredToolsApplies(dsh.workbench)) {
      const bare = declaredToolsWithoutKey(dsh.workbench);
      const literals = [];
      const generated = join(pkg.dir, DECLARED_TOOLS_FILE);
      for (const file of sourceFilesOf(pkg.dir)) {
        if (file === generated) continue;
        const text = readFileSync(file, 'utf8');
        for (const tool of dsh.workbench.tools) {
          const one = `'${tool.name}'`;
          const two = `"${tool.name}"`;
          if (text.includes(one) || text.includes(two)) {
            literals.push(`${relative(pkg.dir, file)} 里的 ${tool.name}`);
          }
        }
      }
      if (literals.length > 0) {
        problems.push(
          `${name}: 工具名的字面量又写回了源码 —— ${literals.join(' / ')}。` +
            `清单里已经有 key，代码应引用生成物（\`DECLARED_TOOLS.<key>.name\`）：` +
            `名称只有清单这一个写入来源，写两遍会产生不一致，且不一致不会引起编译错误`,
        );
      }
      if (bare.length > 0) {
        problems.push(`${name}: 清单里 ${bare.join(' / ')} 没有 key`);
      }
    }

    for (const face of ['host', 'client']) {
      const rel = dsh.workbenchFaces?.[face];
      if (typeof rel !== 'string') {
        problems.push(
          `${name}: dsh.workbenchFaces.${face} 没声明 —— 这两个源码入口是工具链字段` +
            `（不在 dsh.workbench 协议里）：source 判据靠它们判定"属于哪一半"，缺少后无法判定` +
            `（\`dsh-wb-module migrate\` 会补默认的 ${DEFAULT_FACES[face]}）`,
        );
      } else if (!existsSync(join(pkg.dir, rel))) {
        problems.push(`${name}: dsh.workbenchFaces.${face} 指的文件不存在 —— ${rel}`);
      }
    }

    const publishable = pkg.manifest.private !== true;
    const registry = pkg.manifest.publishConfig?.registry;
    const isPublic = pkg.manifest.publishConfig?.access === 'public';
    if (publishable && !isPublic && (typeof registry !== 'string' || registry.includes('registry.npmjs.org'))) {
      problems.push(
        `${name}: 该包不是 private，但既未声明 publishConfig.access=public，也没有指向私有源的 registry —— ` +
          `必须显式声明发布目标（公网 / 私有源），否则等于把私有模块发布到公共源`,
      );
    }

    if (pkg.manifest.peerDependencies?.[SHELL] === undefined) {
      problems.push(
        `${name}: 没有对 ${SHELL} 的 peer 依赖 —— 模块运行在工作台提供的服务上，安装时必须能声明版本`,
      );
    }

    for (const script of ['build', 'typecheck', 'test', 'selfcheck']) {
      if (pkg.manifest.scripts?.[script] === undefined) {
        problems.push(
          `${name}: 没有 ${script} 脚本 —— 模块包必须自带整套门禁：` +
            `工作台的 arch / 覆盖率 / 运行时边界都只扫描自己的 src/，模块出包后没有其他环节代为运行`,
        );
      }
    }

    const read = readOf.get(name) ?? readDeclaration(name, dsh.workbench);
    const manifest = read.manifest;
    const created = [];

    const tools = [];
    const face = await unitFaceOf(pkg.dir);
    const mountedOf = face === undefined ? undefined : mountOf(face, created, manifest, tools);
    const mounted = mountedOf?.result;
    const mountError = mountedOf?.error;
    const needs = manifest?.needs;
    warnings.push(...read.warnings);
    if (manifest === undefined) {
      for (const one of read.problems) problems.push(one);
    }

    if (manifest !== undefined) {
      if (face === undefined) {
        problems.push(
          `${name}: 声明了 ${manifest.tools.length} 个能力，但宿主面无法挂载（dist/host.js 缺失，或 apply 抛出异常）` +
            `—— 声明的能力无法对账，请先修复宿主面`,
        );
      } else if (mountError !== undefined) {
        problems.push(
          `${name}: 宿主面 mount(deps) 抛出异常 —— ${mountError}。` +
            `请先修复 mount 中用到的 deps（宿主提供的服务）与初始化，能力才能完成对账`,
        );
      } else {
        try {
          mounted?.registerTools();
        } catch (error) {
          problems.push(`${name}: registerTools() 抛出异常 —— ${String(error)}`);
        }
        problems.push(
          ...reconcileTools(
            name,
            manifest,
            tools.map((tool) => (typeof tool?.name === 'string' ? tool.name : '')),
          ),
        );
      }
    }

    if (needs !== undefined) {
      const products = productsTextOf(pkg.dir);
      const extensions = needs.filter((need) => need?.kind === 'extension');

      const catalog = catalogBySite((reason) =>
        problems.push(
          `${name}: ${reason} —— needs 里的 extension 命令这一项没有对账（不是通过；opencli 安装损坏了先修它，或用 ${OPENCLI_CATALOG_ENV} 指一份能读的清单）`,
        ),
      );
      extensions.forEach((plugin, index) => {
        const pluginName = text(plugin?.name);
        const declared = (plugin?.commands ?? []).map((one) => text(one)).filter((one) => one !== '');
        if (pluginName === '' || declared.length === 0) return;
        const builtIn = catalog?.get(pluginName);
        const installed = pluginCommandsIn(pluginDirOf(pluginName));
        const builtinSource = (plugin?.sources ?? []).some((source) => source?.kind === 'builtin');
        if (builtinSource) {
          if (catalog !== undefined && builtIn === undefined) {
            problems.push(
              `${name}: needs 里第 ${index} 条 extension（${pluginName}）声明了 sources: builtin，但这份 opencli 清单里没有 ${pluginName} —— ` +
                `版本旧或安装不完整；升级 opencli 再发布`,
            );
          }
        } else if (builtIn !== undefined && installed === undefined && (plugin?.sources ?? []).length === 0) {
          problems.push(
            `${name}: needs 里第 ${index} 条 extension（${pluginName}）是 opencli 自带站点，但没写 sources —— ` +
              `不写来源时工作台只认已装插件，会一直显示「已装插件里没有 ${pluginName}」和「这个模块没有声明安装方式」。` +
              `做法：声明它由运行时自带，写 sources: [{ "kind": "builtin" }]`,
          );
        }
        if (builtIn === undefined && installed === undefined) return;
        const known = new Set([...(builtIn ?? []), ...(installed ?? [])]);
        const missing = declared.filter((one) => !known.has(one));
        if (missing.length === 0) return;
        const knownList = [...known].sort();
        problems.push(
          `${name}: needs 里第 ${index} 条 extension（${pluginName}）声明的命令 ${missing.join(' / ')} 在插件里找不到 —— ` +
            `插件实际包含这些：${knownList.slice(0, 8).join(' / ')}${knownList.length > 8 ? ' …' : ''}。` +
            `命令名写错时，用户端的"缺少命令"状态永远无法解除（用 \`opencli ${pluginName} --help\` 查看原名）`,
        );
      });

      const declaredPlugins = new Set(extensions.map((one) => text(one?.name)).filter((one) => one !== ''));
      if (declaredPlugins.size > 0) {
        for (const file of sourceFilesOf(pkg.dir)) {
          readFileSync(file, 'utf8')
            .split('\n')
            .forEach((line, index) => {
              for (const literal of pluginLiteralsOf(line)) {
                if (declaredPlugins.has(literal)) continue;
                problems.push(
                  `${name}: ${relative(pkg.dir, file)}:${index + 1} 里的插件名「${literal}」不在清单的 ` +
                    `needs（kind=extension）里（清单里是 ${[...declaredPlugins].join(' / ')}）—— 修改清单但未同步代码` +
                    '（或反之）会让工作台按错误的名称安装或探测该插件。插件名只有一个来源：' +
                    '能获取 deps.manifest 的地方应使用它；无法获取的地方至少与清单保持一致',
                );
              }
            });
        }
      }

      const usesLibPort = sourceFilesOf(pkg.dir).some((file) =>
        /(?:\blibs\.load\b|\bworkflowFromLibs\b|\bLibReader\b)/.test(readFileSync(file, 'utf8')),
      );
      if (
        needs.some((need) => need?.kind === 'lib') &&
        !products.includes('libInstallCommand') &&
        !usesLibPort
      ) {
        problems.push(
          `${name}: 声明了 lib 类 need 却既没有使用 libInstallCommand，也没有使用 core 的 LibReader（libs.load）—— ` +
            `lib 未安装时用户只会看到"未安装"，没有可照做的安装命令`,
        );
      }
    }

    const configRows = designRowsOf(pkg.dir, 'config');
    const hostProduct = hostProductOf(pkg.dir);
    const wiredPrefs = /\bprefs\s*:/.test(hostProduct);
    const declaredPrefs = (configRows ?? []).some((one) => text(one?.['persistence']) === 'prefs');
    if (declaredPrefs && !wiredPrefs) {
      problems.push(
        `${name}: 设计表里有一行声明持久化（config[].persistence = 'prefs'），产物里却没有接入 prefs —— ` +
          '用户修改后刷新会回到默认值，等于没有保存。接入方式：mount 返回 `prefs: { resource, handle }`，handle 中使用 deps.store 写入',
      );
    }
    if (wiredPrefs && !declaredPrefs) {
      problems.push(
        `${name}: 产物里接入了 prefs（可以供用户配置），设计表的 config[] 里却没有一行 persistence = 'prefs' —— ` +
          '代码支持配置，但设计表未记录；后续阅读设计表的人无法得知刷新后是否保留',
      );
    }

    const design = readDesign(pkg.dir);
    const sites = manifest?.host.sites;
    const datasourceProblem = datasourceProblemOf(pkg.dir, design, sites);
    if (datasourceProblem !== undefined) problems.push(`${name}: ${datasourceProblem}`);
    const sitesProblem = sitesProblemOf(pkg.dir, sites);
    if (sitesProblem !== undefined) problems.push(`${name}: ${sitesProblem}`);

    const reads =
      design !== undefined && Array.isArray(design.reads) && design.reads.length > 0
        ? design.reads
        : design !== undefined && design.datasource !== undefined
          ? [design.datasource]
          : [];
    const writes =
      design !== undefined && Array.isArray(design.writes) && design.writes.length > 0
        ? design.writes
        : design !== undefined && design.write !== undefined
          ? [design.write]
          : [];
    const usedSites = new Set();
    const recipeRows = [...reads, ...writes];
    for (const read of recipeRows) {
      const recipe = read?.recipe;
      if (recipe === undefined || recipe === null) continue;
      const siteName = text(recipe?.site);
      if (siteName !== '') usedSites.add(siteName);
      const resolved = resolveRecipeOf(recipe, sites);
      if (!resolved.ok) {
        const hasOrigin = text(recipe?.origin) !== '';
        problems.push(
          siteName === '' && !hasOrigin
            ? `${name}: design.json 的配方要有 origin 或 site 至少一个`
            : `${name}: design.json 的配方指向了未声明的站点 ${siteName}（${resolved.problem.message}）`,
        );
        continue;
      }
      const problem = recipeProblemOf(resolved.value);
      if (problem !== undefined) {
        problems.push(`${name}: design.json 的配方不合法（${problem}）—— 运行 \`dsh-wb-module design check\` 查看具体项`);
      }
    }

    if (sites !== undefined) {
      let dynamicSites = false;
      for (const file of sourceFilesOf(pkg.dir)) {
        if (file.endsWith(join('src', 'sites.ts')) || file.endsWith(join('src', 'datasource.ts'))) continue;
        const source = withoutComments(readFileSync(file, 'utf8'));
        const mask = visibleMask(source);
        const code = blankStrings(source);
        const looksLikeRecipe = /\brequest\s*:|\bsteps\s*:/.test(code);
        const destructured = destructuredSiteNames(source, mask);
        if (dynamicSitesUsed(code, destructured.dynamic)) dynamicSites = true;
        const siteHits = [
          ...(looksLikeRecipe
            ? visibleHits(source, mask, /(?:['"]site['"]|\bsite)\s*:\s*['"]([a-z][a-z0-9-]*)['"]/g)
            : []),
          ...visibleHits(source, mask, /\bSITES\s*\.\s*([a-z][a-z0-9-]*)/g),
          ...visibleHits(source, mask, /\bSITES\s*\??\s*\[\s*['"]([a-z][a-z0-9-]*)['"]\s*\]/g),
          ...destructured.names,
        ];
        for (const siteName of siteHits) {
          usedSites.add(siteName);
          if (!Object.hasOwn(sites, siteName)) {
            problems.push(
              `${name}: ${relative(pkg.dir, file)} 里引用了未声明的站点 ${siteName}（静态扫描）—— ` +
                '在清单 dsh.workbench.host.sites 里补上，或改成已声明的站点',
            );
          }
        }
        const literalOrigin = [...source.matchAll(/\borigin\s*:\s*['"]https?:\/\//g)].some(
          (hit) => hit.index !== undefined && mask[hit.index] === 1,
        );
        if (literalOrigin) {
          warnings.push(
            `${name}: ${relative(pkg.dir, file)} 里出现字面 origin（静态扫描）—— 模块已有站点表，建议收进 host.sites`,
          );
        }
      }
      for (const siteName of Object.keys(sites)) {
        if (!usedSites.has(siteName) && !dynamicSites) {
          problems.push(
            `${name}: 站点表里的 ${siteName} 没有被任何配方 / 计划 / 源码引用 —— ` +
              '通常是探测后未使用或名称写错；不使用时从 host.sites 删除',
          );
        }
      }
      const rawOrigins = Array.isArray(dsh.workbench?.host?.origins) ? dsh.workbench.host.origins : [];
      if (rawOrigins.length > 0) {
        const normalized = new Set();
        for (const one of rawOrigins) {
          const origin = typeof one === 'string' ? one : '';
          let canonical;
          try {
            canonical = new URL(origin).origin;
          } catch {
            problems.push(`${name}: host.origins 里有一项不是合法 URL：${JSON.stringify(one)}`);
            continue;
          }
          if (canonical !== origin) {
            warnings.push(`${name}: host.origins 里的 ${JSON.stringify(one)} 会按 ${canonical} 规范化`);
          }
          if (normalized.has(canonical)) problems.push(`${name}: host.origins 里重复了 ${canonical}`);
          normalized.add(canonical);
        }
        const siteOrigins = new Set(Object.values(sites).map((site) => site.origin));
        for (const origin of normalized) {
          if (!siteOrigins.has(origin)) {
            warnings.push(
              `${name}: host.origins 里的 ${origin} 不属于任何站点 —— 建议补入 host.sites，或从 origins 删除`,
            );
          }
        }
      }
    }

    const capabilityRows = designRowsOf(pkg.dir, 'capabilities');
    if (capabilityRows !== undefined && manifest !== undefined) {
      const inDesign = capabilityRows.map((one) => text(one?.name)).filter((one) => one !== '');
      const inDeclaration = manifest.tools.map((tool) => tool.name);
      for (const name0 of inDesign.filter((one) => !inDeclaration.includes(one))) {
        problems.push(
          `${name}: design.json 的能力行里有「${name0}」，清单的 tools[] 里却没有它 —— ` +
            '能力只有清单这一个出货来源（安装预检 / 市场 / 工作台都读取它），设计记录写入了也不会生效：' +
            `要么补入 \`dsh.workbench.tools\`，要么从设计记录中删除`,
        );
      }
      for (const name0 of inDeclaration.filter((one) => !inDesign.includes(one))) {
        problems.push(
          `${name}: 清单的 tools[] 里声明了「${name0}」，design.json 的能力行里却没有它 —— ` +
            '设计记录是供人阅读的部分（用途、是否需要批准，`design render` 据此生成 DEVELOPING.md）：' +
            `要么在 design.json 的 capabilities[] 里为「${name0}」补一行，要么从清单中删除`,
        );
      }
    }

    if (created.length > 0 || mounted?.longTasks !== undefined) {
      const registry = mounted?.longTasks;
      if (registry !== undefined) {
        const missing = LONG_TASK_METHODS.filter((method) => typeof registry[method] !== 'function');
        if (missing.length > 0) {
          problems.push(
            `${name}: 长任务注册表缺少方法 ${missing.join(' / ')} —— 工作台据此为该单元生成 /runs 路由（停止 / 已处理 / 回执三个按钮也据此发送），` +
              `kit 的 useLongTask 与左栏会话行中的该 loading 指示点、左栏底部的长任务列表读取的也是它（后者使用 \`live()\` / \`recent()\`；注册表用 ` +
              `@dsh-workbench/shared/host 的 createLongTaskRegistry 建）`,
          );
        }
      }
      for (const options of created) {
        if (text(options?.key) === '') {
          problems.push(`${name}: longTasks.create 未提供 key —— 一个单元可以有多项长时间运行的任务，key 是它们的名称`);
        }
        if (typeof options?.run !== 'function') {
          problems.push(`${name}: longTasks.create({key:'${String(options?.key ?? '')}'}) 未提供 run —— 它运行什么`);
        }
        if (typeof options?.view !== 'function') {
          problems.push(
            `${name}: longTasks.create({key:'${String(options?.key ?? '')}'}) 未提供 view —— 卡片上该行需要渲染的快照没有来源`,
          );
        }
        if (typeof options?.run === 'function' && options?.plan === undefined) {
          warnings.push(
            `${name}: longTasks.create({key:'${String(options?.key ?? '')}'}) 自己有 run 但没给 plan —— ` +
              '这一趟算不出进度（行上没有进度条）：按流程的步骤给一次 plan（{ steps } 或 { total }），' +
              '步数由工作台从步骤事件自己数，run 里不用报 done',
          );
        }
      }
      const clientText = existsSync(join(pkg.dir, 'client.js'))
        ? readFileSync(join(pkg.dir, 'client.js'), 'utf8')
        : '';
      if (!LONG_TASK_RENDERERS.some((one) => clientText.includes(one))) {
        problems.push(
          `${name}: 注册了长任务，但客户端产物里没有 ${LONG_TASK_RENDERERS.join(' / ')}（kit 里那套）—— ` +
            `用户点击后只会看到"无反应"，看不到进行中 / 等待处理 / 需要登录 / 已停止 / 已完成 / 出错`,
        );
      }
    }

    if (mounted !== undefined) {
      const factsOf = mounted.factsOf;
      if (factsOf !== undefined && typeof factsOf !== 'function') {
        problems.push(`${name}: factsOf 不是函数 —— 工作台调用时会立即抛出异常`);
      } else if (typeof factsOf === 'function') {
        let claimed;
        try {
          claimed = factsOf({ source: '__contract_probe__', args: {}, result: undefined });
        } catch {
          claimed = undefined;
        }
        const ok =
          claimed === undefined ||
          (Array.isArray(claimed) && claimed.every((one) => text(one) !== ''));
        if (!ok) {
          problems.push(
            `${name}: factsOf 要么回 undefined（这次跟面板无关）、要么回一串非空的事实名 —— ` +
              `现在返回的是 ${JSON.stringify(claimed)}（事实名用 factOfRoute('<unit>/<路由>') 生成，不要自行拼接）`,
          );
        }
      }

      const context = mounted.context;
      if (context !== undefined) {
        const kinds = context.kinds;
        if (!Array.isArray(kinds) || kinds.length === 0 || kinds.some((one) => text(one) === '')) {
          problems.push(
            `${name}: context.kinds 应为非空的类别名列表 —— agent 引用该面板格时，识别哪几类由它决定`,
          );
        }
        if (typeof context.render !== 'function') {
          problems.push(`${name}: context.render 不是函数 —— agent 引用该面板格时没有代码将其渲染为可读文本`);
        }
      }

      const warmReads = mounted.warmReads;
      if (warmReads !== undefined) {
        if (typeof warmReads !== 'function') {
          problems.push(`${name}: warmReads 不是函数`);
        } else {
          let reads;
          try {
            reads = warmReads();
          } catch {
            reads = undefined;
          }
          const ok =
            Array.isArray(reads) &&
            reads.every(
              (one) => Array.isArray(one) && one.length > 0 && one.every((part) => text(part) !== ''),
            );
          if (!ok) {
            problems.push(
              `${name}: warmReads() 应返回 [['<unit>', '<target>']] 形式的列表 —— 现在返回的是 ${JSON.stringify(reads)}`,
            );
          }
        }
      }
    }

    const writeTools = (manifest?.tools ?? []).filter((one) => one?.writes === true);
    if (writeTools.length > 0) {
      if (mounted === undefined) {
        if (mountError === undefined) {
          problems.push(
            `${name}: 清单里有写入工具，但宿主面无法挂载（apply / mount 抛出异常）—— ` +
              `无法验证这条审批口径，请先修复挂载依赖（模块自己的 smoke 也按此方式挂载）`,
          );
        }
        continue;
      }
      let clientFace;
      if (!existsSync(join(pkg.dir, 'client.js'))) {
        problems.push(
          `${name}: 没有客户端产物 client.js —— 写工具的审批详情在浏览器侧，无法检查 approval.tools / approval.plan`,
        );
      } else {
        try {
          clientFace = loadRegisteredClientFace(join(pkg.dir, 'client.js'));
        } catch (error) {
          problems.push(
            `${name}: 客户端产物无法加载：${error instanceof Error ? error.message : String(error)} —— ` +
              '写工具的审批详情在浏览器侧，无法检查 approval.tools / approval.plan',
          );
        }
      }
      const approval = clientFace?.approval;
      if (clientFace !== undefined && (typeof approval !== 'object' || approval === null)) {
        problems.push(
          `${name}: 客户端产物没有 approval 面 —— 写工具的审批详情没有认领者，审批屏只会画空白；` +
            '在 UnitClientFace 上补 approval: { tools, plan }',
        );
      }
      if (approval?.render !== undefined && typeof approval.render !== 'function') {
        problems.push(`${name}: approval.render 必须是函数 —— 它不是函数时四行表仍然可用，但自定义详情永远不会生效`);
      }
      const planT = (key) => text(clientFace?.messages?.zh?.[key]) || key;
      const registered = new Map(tools.map((tool) => [text(tool?.name), tool]));
      const readOnProbe = [];
      for (const tool of writeTools) {
        const probe = probeCallOf(registered.get(tool.name));
        const call = { name: tool.name, arguments: probe.arguments, workspace: null };
        const cannotShape = probe.shaped
          ? ''
          : `（registerTools() 没注册出 ${tool.name} 的 parameters，判据只能用空参数探 —— ` +
            `你的判断依赖参数的话，注册时把 parameters 那个 JSON Schema 一起交出来）`;
        const claimed = Array.isArray(approval?.tools) && approval.tools.includes(tool.name);
        if (!claimed) {
          problems.push(
            `${name}: 写工具 ${tool.name} 没有在客户端 approval.tools 里认领 —— ` +
              '审批详情按工具名找认领者；没有认领时只剩工作台的兜底，模块说不出这次改什么',
          );
        }
        const plan = approval?.plan;
        if (typeof plan !== 'function') {
          problems.push(
            `${name}: 写工具 ${tool.name} 缺少 approval.plan —— ` +
              '审批详情至少要有 object / change / target / impact 四行；plan 是必填的数据来源，render 不能替代它',
          );
        }
        if (typeof mounted.needsApproval !== 'function') {
          problems.push(
            `${name}: 工具 ${tool.name} 的清单里写着 writes:true，但 mount() 的返回值里没有 needsApproval —— ` +
              `工作台每次调用前都会询问它"这次是否需要批准"，缺少它时只有"没有明确口径"，**每次调用都会被立即拒绝**。` +
              `做法：mount() 返回的对象里加 needsApproval(call)，认出这把工具再给 verdict：` +
              `{ kind: 'read' }（这次不用问）或 { kind: 'ask', reason, question: {zh,en}, fallback: {zh,en} }（要问，且问得清）`,
          );
          continue;
        }
        let verdict;
        try {
          verdict = mounted.needsApproval(call);
        } catch (error) {
          problems.push(
            `${name}: 工具 ${tool.name} 的 needsApproval 在合成调用 ${JSON.stringify(call.arguments)} 上抛出异常 —— ${String(error)}`,
          );
          continue;
        }

        const read = verdict?.kind === 'read';

        const deny = verdict?.kind === 'deny' && text(verdict.reason) !== '';
        const ask =
          verdict?.kind === 'ask' &&
          text(verdict.reason) !== '' &&
          text(verdict.question?.zh) !== '' &&
          text(verdict.question?.en) !== '' &&
          text(verdict.fallback?.zh) !== '' &&
          text(verdict.fallback?.en) !== '';
        if (!read && !deny && !ask) {
          problems.push(
            `${name}: 工具 ${tool.name} 的清单里写着 writes:true，但 needsApproval 对合成调用 ` +
              `${JSON.stringify(call.arguments)} 没给出合法口径 —— ` +
              `要么 { kind: 'read' }（这件事不用询问），要么 { kind: 'deny', reason }（本次操作无法执行，` +
              `理由原样交给 agent），要么 { kind: 'ask', reason, question: {zh,en}, ` +
              `fallback: {zh,en} }（需要询问，且询问清楚）。其他返回值会被工作台立即 deny${cannotShape}`,
          );
          continue;
        }

        if (read || deny) {
          readOnProbe.push(tool.name);
          continue;
        }
        const headlineFloor = headlineFloorProblemsOf(name, tool.name, verdict);
        const headlineOk = headlineFloor.length === 0;
        problems.push(...headlineFloor);
        if (typeof plan === 'function') {
          let planFacts;
          let planThrew = false;
          try {
            planFacts = plan({ tool: tool.name, args: call.arguments }, planT);
          } catch (error) {
            planThrew = true;
            problems.push(
              `${name}: 写工具 ${tool.name} 的 approval.plan 在合成调用 ${JSON.stringify(call.arguments)} 上抛出异常 —— ${String(error)}`,
            );
          }
          if (!planThrew) {
            if (planFacts !== null && typeof planFacts?.then === 'function') {
              problems.push(
                `${name}: 写工具 ${tool.name} 的 approval.plan 返回了 Promise —— plan 必须是同步纯函数：审批详情座不等待网络`,
              );
            } else {
              problems.push(...planProblemsOf(name, tool.name, planFacts));
            }
          }
        }
        let facts;
        try {
          facts = await mounted.approvalDetail?.(call);
        } catch {
          facts = undefined;
        }
        const described =
          facts !== undefined &&
          ('blocked' in facts
            ? text(facts.blocked) !== ''
            : text(facts.zh) !== '' && text(facts.en) !== '');
        problems.push(...headlineProblemsOf(name, tool.name, verdict, facts));

        const longArgs = budgetProbeOf(registered.get(tool.name));
        if (longArgs !== undefined) {
          const longCall = { ...call, arguments: longArgs };
          let longVerdict;
          try {
            longVerdict = mounted.needsApproval(longCall);
          } catch {
            longVerdict = undefined;
          }
          if (longVerdict?.kind === 'ask') {
            let longFacts;
            try {
              longFacts = await mounted.approvalDetail?.(longCall);
            } catch {
              longFacts = undefined;
            }
            problems.push(
              ...headlineProblemsOf(
                name,
                tool.name,
                longVerdict,
                longFacts,
                '（把自由文本字段填上真实长度之后）',
                LONG_SCALE,
              ),
            );
          }
        }
        if ((facts === undefined || 'blocked' in facts) && !headlineOk) {
          headlineNotes.push(
            `${name}: 写工具 ${tool.name} 的 approvalDetail 在合成调用上没有明细（需要实际生成计划或预览后才有）—— ` +
              `头行预算仅验证到问句与回退句部分；明细那一句请作者按「一句话、≤${HEAD_BUDGETS.detail} 字」自行检查：` +
              `超出时就把长内容放入 approval.render 该格`,
          );
        }
        if (!described && !headlineOk) {
          problems.push(
            `${name}: 写工具 ${tool.name} 的 needsApproval 对合成调用回了 ask（需要批准），` +
              `但既没有 headline，approvalDetail 也没有说明"本次会发生什么"（zh/en 或 {blocked}）—— ` +
              `审批屏上用户只能看到一句通用问句，看不到会影响什么${cannotShape}`,
          );
        }
      }
      if (readOnProbe.length > 0) {
        probeNotes.push(
          `写工具 ${readOnProbe.join(' / ')} 按合成调用返回了"这次不用询问"（kind: 'read' 或 'deny'）—— ` +
            `判据只能验证到这一步：它是否属于"参数中带 confirm 才实际写入" / "本次操作确实无法执行"这类**合法**口径，` +
            `合成调用无法体现（必填项给的是占位值，不是真实写入参数）。请作者自行确认一次：` +
            `实际调用是否会 ask、ask 时 headline 是否具体、plan 的四行是否说清`,
        );
      }
    }
  }

  const scoped = scopeNote(options.scope);
  const unitList = [...unitOwners]
    .filter(([, owners]) => options.scope === undefined || owners.some((one) => options.scope.has(one)))
    .map(([unit, owners]) => `${unit} ← ${owners.join(' / ')}`)
    .join(' · ');

  const shellPkg = packages.find((pkg) => pkg.manifest.name === SHELL);
  if (shellPkg !== undefined) {
    const suspects = [join(shellPkg.dir, 'package.json')];
    const srcDir = join(shellPkg.dir, 'src');
    if (existsSync(srcDir)) {
      const walk = (dir) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const full = join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (/\.tsx?$/.test(entry.name)) suspects.push(full);
        }
      };
      walk(srcDir);
    }
    for (const file of suspects) {
      const text = readFileSync(file, 'utf8');
      const hit = /(?:@[a-z0-9-]+\/)?dsh-workbench-module-[a-z0-9-]+/.exec(text);
      if (hit !== null) {
        problems.push(
          `${SHELL}: ${relative(ROOT, file)} 里点名了模块包 ${hit[0]} —— ` +
            `工作台不得认识任何模块（那等于把"中央清单"搬进工作台）；模块通过服务名挂载`,
        );
      }
    }
  }

  problems.push(...buildSupplyIndex(supplyDeclarations).problems);

  if (problems.length > 0) {
    const notes = [
      `${declared} 个带 dsh 声明的包，其中 ${modules} 个模块`,
      ...(scoped === '' ? [] : [scoped]),
      ...probeNotes,
      ...headlineNotes,
    ];

    const bare = [...unresolvedIn].filter(barePackage);
    if (bare.length > 0) {
      notes.push(
        `上述 ${bare.length} 个包处于**孤立**状态：上层没有 pnpm-workspace.yaml，自身也没有 node_modules —— ` +
          `那几条 inject/external 正是因为找不到任何同伴包，才无法解析到依赖图中。`,
      );
    }
    return { status: 'fail', notes: [...notes, ...warnings.map((one) => `（警告）${one}`)], problems };
  }

  return {
    status: 'pass',
    notes: [
      `${declared} 个带 dsh 声明的包（${modules} 个模块）· bundle 落点存在 · ` +
        `inject/external 都能解析到依赖图 · 单元 id 唯一 · 面文件与 peer 均存在 · 各自带有接线自检`,
      ...(scoped === '' ? [] : [scoped]),
      '（测试不在此处运行：状态级内容在模块自己的 vitest 中 —— 请自行运行四个脚本）',
      `单元：${unitList}`,
      ...probeNotes,
      ...headlineNotes,
      ...warnings.map((one) => `（警告）${one}`),
    ],
    problems: [],
  };
}
