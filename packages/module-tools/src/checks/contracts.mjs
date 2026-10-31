import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  buildSupplyIndex,
  createHostKit,
  hostSurface,
  readDeclaration,
  recipeProblemOf,
} from '@dsh-workbench/shared/host';
import {
  DECLARED_TOOLS_FILE,
  declaredToolsProblemOf,
  declaredToolsWithoutKey,
  declaredToolsApplies,
} from '../declared-tools.mjs';
import { discoverPackages, workspaceRootOf } from '../discover.mjs';
import { readDesign } from '../design.mjs';
import { datasourceProblemOf } from '../datasource-file.mjs';
import { SEED_SHORT } from '../seed.mjs';

const ROOT = process.env.DSH_WB_ROOT ?? fileURLToPath(new URL('../../../../', import.meta.url));

const SEED = SEED_SHORT;

const PLATFORMS = new Set(['web']);

const UNIT_ID = /^[a-z][a-z0-9-]*$/;

const SHELL = '@dsh-workbench/core';

export const title = '模块契约';

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
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

const OPENCLI_CATALOG_ENV = 'DSH_WB_OPENCLI_CATALOG';
const OPENCLI_NPM_PACKAGE = '@jackwener/opencli';

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

function catalogBySite() {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(catalogPathOf(), 'utf8'));
  } catch {
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
        stop: () => false,
        onChange: () => () => {},
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
    error: { code: 'invalid-request', message: 'gate: 没有注入 DataReader（模块只能走 deps.data 读数据）' },
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

const LONG_TASK_METHODS = ['start', 'snapshot', 'active', 'current', 'live', 'stop', 'onChange'];

const LONG_TASK_RENDERERS = ['useLongTask', 'LongTaskRow', 'longTaskDot'];

function placeholderOf(schema) {
  if (typeof schema !== 'object' || schema === null) return null;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  if (schema.type === 'string') return 'probe';
  if (schema.type === 'number' || schema.type === 'integer') return 1;
  if (schema.type === 'boolean') return true;
  if (schema.type === 'array') return [];
  if (schema.type === 'object') return {};
  return null;
}

function probeCallOf(tool) {
  const schema = tool?.parameters;
  if (typeof schema !== 'object' || schema === null) {
    return { arguments: {}, shaped: false };
  }
  const properties = typeof schema.properties === 'object' && schema.properties !== null ? schema.properties : {};
  const required = Array.isArray(schema.required) ? schema.required : [];
  const args = {};
  for (const key of required) args[key] = placeholderOf(properties[key]);
  if (Object.prototype.hasOwnProperty.call(properties, 'confirm')) args.confirm = true;
  return { arguments: args, shaped: true };
}

export const HEAD_BUDGETS = { detail: 20, question: 40, fallback: 40 };

const EN_RATIO = 3;

const LONG_SCALE = 3;

const FREE_TEXT = /message|note|reason|body|text|content|comment|title|description|summary/i;
const LONG_TEXT = '这里是一段真实长度的正文用来量头行预算不要把这种内容放进标题里'.repeat(2);
const LONG_ID = '真实长度的名字十二个字';

function budgetProbeOf(tool) {
  const schema = tool?.parameters;
  if (typeof schema !== 'object' || schema === null) return undefined;
  const properties = typeof schema.properties === 'object' && schema.properties !== null ? schema.properties : {};
  const args = {};
  for (const [key, prop] of Object.entries(properties)) {
    if (key === 'confirm') {
      args.confirm = true;
      continue;
    }
    if (Array.isArray(prop?.enum) && prop.enum.length > 0) args[key] = prop.enum[0];
    else if (prop?.type === 'string') args[key] = FREE_TEXT.test(key) ? LONG_TEXT : LONG_ID;
    else if (prop?.type === 'number' || prop?.type === 'integer') args[key] = 1;
    else if (prop?.type === 'boolean') args[key] = true;
    else if (prop?.type === 'array') args[key] = [];
    else if (prop?.type === 'object') args[key] = {};
  }
  return args;
}

function headlineProblemsOf(name, toolName, verdict, facts, when = '', scale = 1) {
  const problems = [];
  const blocked = facts !== undefined && 'blocked' in facts;
  const hasDetail = facts !== undefined && !blocked;
  const segments = [
    ['明细（approvalDetail）', 'detail', hasDetail ? text(facts.zh) : '', hasDetail ? text(facts.en) : ''],
    ['问句（question）', 'question', text(verdict?.question?.zh), text(verdict?.question?.en)],
    ['兜底句（fallback）', 'fallback', text(verdict?.fallback?.zh), text(verdict?.fallback?.en)],
  ];
  for (const [label, key, zh, en] of segments) {
    if (zh === '' && en === '') continue;
    if (/\n|\r/.test(zh) || /\n|\r/.test(en)) {
      problems.push(
        `${name}: 写工具 ${toolName} 的${label}${when}里有换行 —— 审批头行是纯文本、没有 white-space，` +
          `换行会被塌成空格，屏幕上就是一坨。压成一句，长内容放 approval.render（卡上那一格详情）`,
      );
    }
    const cap = HEAD_BUDGETS[key] * scale;
    const enCap = Math.round(cap * EN_RATIO);
    if (zh.length > cap) {
      problems.push(
        `${name}: 写工具 ${toolName} 的${label}${when}太长（${zh.length} 字 > 预算 ${cap} 字）：「${zh}」—— ` +
          `头行三段各有预算（明细 ≤${HEAD_BUDGETS.detail} / 问句 ≤${HEAD_BUDGETS.question} / ` +
          `兜底句 ≤${HEAD_BUDGETS.fallback} 字），其余（列表 / 正文 / 多字段 / 可变长内容）放进 approval.render 那一格`,
      );
    }
    if (en.length > enCap) {
      problems.push(
        `${name}: 写工具 ${toolName} 的${label}${when}（英文）太长（${en.length} 字符 > 预算 ${enCap}）：「${en}」—— ` +
          `英文侧按中文的 ${EN_RATIO} 倍算，超了同样挪进 approval.render`,
      );
    }
  }
  return problems;
}

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
      `清单是工具面的**唯一**来源（外壳按它算收窄、市场按它画花名册）：` +
      `漏声明 = 那个工具不会被收起也不会进花名册；多声明 = 花名册里有个永远不存在的工具`,
  ];
}

export async function run() {
  const packages = discoverPackages({ root: process.cwd() });
  const known = new Set(packages.map((pkg) => pkg.manifest.name));
  const problems = [];
  const warnings = [];
  const unresolvedIn = new Set();
  const units = new Map();
  const supplyDeclarations = [];

  const probeNotes = [];
  const headlineNotes = [];
  let declared = 0;
  let modules = 0;

  for (const pkg of packages) {
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
      problems.push(`${name}: dsh.workbench.unit 形状不对 —— ${JSON.stringify(unit)}（要小写连字符）`);
    } else if (units.has(unit)) {
      problems.push(
        `${name}: 单元 id ${JSON.stringify(unit)} 与 ${units.get(unit)} 撞了 —— ` +
          `两个包都声明同一个单元，装上去注册表当场抛（id 会进持久化配置）`,
      );
    } else {
      units.set(unit, name);
      const shellPkg = packages.find((item) => item.manifest.name === SHELL);
      if (shellPkg !== undefined && existsSync(join(shellPkg.dir, 'src/modules', unit, 'unit.ts'))) {
        problems.push(
          `${name}: 单元 ${JSON.stringify(unit)} 在外壳里还有一份（${SHELL}/src/modules/${unit}/）—— ` +
            `同一个单元不许两边都住：两份真相，装上模块注册表当场抛`,
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
            `清单里已经有 key，代码该引用生成物（\`DECLARED_TOOLS.<key>.name\`）：` +
            `名字只有清单一处写者，写两遍就会漂，而漂了没有任何编译错`,
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
            `（不在 dsh.workbench 协议里）：source 判据靠它们判"哪一半"，缺了它判不了` +
            `（\`dsh-wb-module migrate\` 会补默认的 ${face === 'host' ? 'src/host.ts' : 'src/client.tsx'}）`,
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
        `${name}: 它不是 private，却既没声明 publishConfig.access=public、也没有指向内网源的 registry —— ` +
          `发布目标必须显式写出来（公网 / 内网），否则等于把私有模块发到公共源`,
      );
    }

    if (pkg.manifest.peerDependencies?.[SHELL] === undefined) {
      problems.push(
        `${name}: 没有对 ${SHELL} 的 peer 依赖 —— 模块跑在外壳交出来的服务上，装的时候必须能说清版本`,
      );
    }

    for (const script of ['build', 'typecheck', 'test', 'selfcheck']) {
      if (pkg.manifest.scripts?.[script] === undefined) {
        problems.push(
          `${name}: 没有 ${script} 脚本 —— 模块包必须自带整套门禁：` +
            `外壳的 arch / 覆盖率 / 运行时边界都只扫自己的 src/，模块出包之后没人替它跑`,
        );
      }
    }

    const read = readDeclaration(name, dsh.workbench);
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
      supplyDeclarations.push({ id: manifest.id, needs: needs ?? [] });
    }

    if (manifest !== undefined) {
      if (face === undefined) {
        problems.push(
          `${name}: 声明了 ${manifest.tools.length} 个能力，但宿主面挂不起来（dist/host.js 缺、或 apply 抛了）` +
            `—— 声明的能力对不了账，先把面修好`,
        );
      } else if (mountError !== undefined) {
        problems.push(
          `${name}: 宿主面 mount(deps) 抛了 —— ${mountError}。` +
            `先修 mount 里用到的那份 deps（宿主交的服务）与初始化，能力才对得了账`,
        );
      } else {
        try {
          mounted?.registerTools();
        } catch (error) {
          problems.push(`${name}: registerTools() 抛了 —— ${String(error)}`);
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

      const catalog = catalogBySite();
      extensions.forEach((plugin, index) => {
        const pluginName = text(plugin?.name);
        const declared = (plugin?.commands ?? []).map((one) => text(one)).filter((one) => one !== '');
        if (pluginName === '' || declared.length === 0) return;
        const builtIn = catalog?.get(pluginName);
        const installed = pluginCommandsIn(pluginDirOf(pluginName));
        if (builtIn === undefined && installed === undefined) return;
        const known = new Set([...(builtIn ?? []), ...(installed ?? [])]);
        const missing = declared.filter((one) => !known.has(one));
        if (missing.length === 0) return;
        const knownList = [...known].sort();
        problems.push(
          `${name}: needs 里第 ${index} 条 extension（${pluginName}）声明的命令 ${missing.join(' / ')} 在插件里找不到 —— ` +
            `它真有这些：${knownList.slice(0, 8).join(' / ')}${knownList.length > 8 ? ' …' : ''}。` +
            `命令名写错的话，用户那边的"缺命令"永远补不上（用 \`opencli ${pluginName} --help\` 看原名）`,
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
                    `needs（kind=extension）里（清单里是 ${[...declaredPlugins].join(' / ')}）—— 改了清单没改代码` +
                    '（或反过来）会让外壳按错的名字去装 / 去探那个插件。插件名只有一处真相：' +
                    '能拿到 deps.manifest 的地方就用它，拿不到的地方至少与清单保持一致',
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
          `${name}: 声明了 lib 类 need 却既没用 libInstallCommand，也没走 core 的 LibReader（libs.load）—— ` +
            `lib 没装好时用户只看到"没装"，没有能照做的那条安装命令`,
        );
      }
    }

    const configRows = designRowsOf(pkg.dir, 'config');
    const hostProduct = hostProductOf(pkg.dir);
    const wiredPrefs = /\bprefs\s*:/.test(hostProduct);
    const declaredPrefs = (configRows ?? []).some((one) => text(one?.['persistence']) === 'prefs');
    if (declaredPrefs && !wiredPrefs) {
      problems.push(
        `${name}: 设计表里有一行写着"存起来"（config[].persistence = 'prefs'），产物里却没有接 prefs —— ` +
          '用户改完刷新就回到默认，等于没存。接法：mount 返回 `prefs: { resource, handle }`，handle 里用 deps.store 落盘',
      );
    }
    if (wiredPrefs && !declaredPrefs) {
      problems.push(
        `${name}: 产物里接了 prefs（能给用户配东西），设计表的 config[] 里却没有一行 persistence = 'prefs' —— ` +
          '代码里能配、表上没写，下一个读表的人就不知道它刷新还在',
      );
    }

    const design = readDesign(pkg.dir);
    const datasourceProblem = datasourceProblemOf(pkg.dir, design);
    if (datasourceProblem !== undefined) problems.push(`${name}: ${datasourceProblem}`);

    const reads =
      design !== undefined && Array.isArray(design.reads) && design.reads.length > 0
        ? design.reads
        : design !== undefined && design.datasource !== undefined
          ? [design.datasource]
          : [];
    for (const read of reads) {
      const recipe = read?.recipe;
      if (recipe === undefined) continue;
      const problem = recipeProblemOf(recipe);
      if (problem !== undefined) {
        problems.push(`${name}: design.json 的配方不合法（${problem}）—— 跑 \`dsh-wb-module design check\` 看点名`);
      }
    }

    const capabilityRows = designRowsOf(pkg.dir, 'capabilities');
    if (capabilityRows !== undefined && manifest !== undefined) {
      const inDesign = capabilityRows.map((one) => text(one?.name)).filter((one) => one !== '');
      const inDeclaration = manifest.tools.map((tool) => tool.name);
      for (const name0 of inDesign.filter((one) => !inDeclaration.includes(one))) {
        problems.push(
          `${name}: design.json 的能力行里有「${name0}」，清单的 tools[] 里却没有它 —— ` +
            '能力只有清单那一处能出货（装机预检 / 市场 / 外壳都读它），底稿写了也是一句空话：' +
            `要么把它补进 \`dsh.workbench.tools\`，要么从底稿里删掉`,
        );
      }
      for (const name0 of inDeclaration.filter((one) => !inDesign.includes(one))) {
        problems.push(
          `${name}: 清单的 tools[] 里声明了「${name0}」，design.json 的能力行里却没有它 —— ` +
            '底稿是给人读的那半（它干嘛、要不要点头，`design render` 拿它出 README）：' +
            `要么在 design.json 的 capabilities[] 里为「${name0}」补一行，要么把它从清单里删掉`,
        );
      }
    }

    if (created.length > 0 || mounted?.longTasks !== undefined) {
      const registry = mounted?.longTasks;
      if (registry !== undefined) {
        const missing = LONG_TASK_METHODS.filter((method) => typeof registry[method] !== 'function');
        if (missing.length > 0) {
          problems.push(
            `${name}: 长任务注册表缺方法 ${missing.join(' / ')} —— 外壳按它给这个单元投影出 /runs 路由（停止那颗钮也按它发），` +
              `kit 的 useLongTask 与左栏会话行那颗 loading 点读的也是它（后者走 \`live()\`；注册表用 ` +
              `@dsh-workbench/shared/host 的 createLongTaskRegistry 建）`,
          );
        }
      }
      for (const options of created) {
        if (text(options?.key) === '') {
          problems.push(`${name}: longTasks.create 没给 key —— 一个单元可以有好几件跑一会儿的事，key 是它们的名字`);
        }
        if (typeof options?.run !== 'function') {
          problems.push(`${name}: longTasks.create({key:'${String(options?.key ?? '')}'}) 没给 run —— 那它跑什么`);
        }
        if (typeof options?.view !== 'function') {
          problems.push(
            `${name}: longTasks.create({key:'${String(options?.key ?? '')}'}) 没给 view —— 卡片上那行要渲染的快照没处来`,
          );
        }
      }
      const clientText = existsSync(join(pkg.dir, 'client.js'))
        ? readFileSync(join(pkg.dir, 'client.js'), 'utf8')
        : '';
      if (!LONG_TASK_RENDERERS.some((one) => clientText.includes(one))) {
        problems.push(
          `${name}: 注册了长任务，但客户端产物里没有 ${LONG_TASK_RENDERERS.join(' / ')}（kit 里那套）—— ` +
            `用户点完只看得到"没反应"，看不到进行中 / 要登录 / 停下的 / 完成 / 出错`,
        );
      }
    }

    if (mounted !== undefined) {
      const factsOf = mounted.factsOf;
      if (factsOf !== undefined && typeof factsOf !== 'function') {
        problems.push(`${name}: factsOf 不是函数 —— 外壳调它的时候会当场抛`);
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
              `现在回的是 ${JSON.stringify(claimed)}（事实名用 factOfRoute('<unit>/<路由>') 起，别自己拼）`,
          );
        }
      }

      const context = mounted.context;
      if (context !== undefined) {
        const kinds = context.kinds;
        if (!Array.isArray(kinds) || kinds.length === 0 || kinds.some((one) => text(one) === '')) {
          problems.push(
            `${name}: context.kinds 要是非空的一串类别名 —— agent 引用你这一格时，认哪几类由它决定`,
          );
        }
        if (typeof context.render !== 'function') {
          problems.push(`${name}: context.render 不是函数 —— agent 引用你这一格时没人把它渲染成人话`);
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
              `${name}: warmReads() 要回一串 [['<unit>', '<target>']] —— 现在回的是 ${JSON.stringify(reads)}`,
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
            `${name}: 清单里有会写的工具，但宿主面挂不起来（apply / mount 抛了）—— ` +
              `这条审批口径验不了，先把挂载依赖修好（模块自己的 smoke 也是这么挂的）`,
          );
        }
        continue;
      }
      const registered = new Map(tools.map((tool) => [text(tool?.name), tool]));
      const readOnProbe = [];
      for (const tool of writeTools) {
        const probe = probeCallOf(registered.get(tool.name));
        const call = { name: tool.name, arguments: probe.arguments, workspace: null };
        const cannotShape = probe.shaped
          ? ''
          : `（registerTools() 没注册出 ${tool.name} 的 parameters，判据只能用空参数探 —— ` +
            `你的判断依赖参数的话，注册时把 parameters 那个 JSON Schema 一起交出来）`;
        if (typeof mounted.needsApproval !== 'function') {
          problems.push(
            `${name}: 工具 ${tool.name} 的清单里写着 writes:true，但 mount() 的返回值里没有 needsApproval —— ` +
              `外壳每次调用前都问它"这次要不要点头"，没有它就只有一句"没认领"，**每一次调用都当场被拒**。` +
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
            `${name}: 工具 ${tool.name} 的 needsApproval 在合成调用 ${JSON.stringify(call.arguments)} 上抛了 —— ${String(error)}`,
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
              `要么 { kind: 'read' }（这件事不用问），要么 { kind: 'deny', reason }（这一通根本跑不成，` +
              `理由原样交给 agent），要么 { kind: 'ask', reason, question: {zh,en}, ` +
              `fallback: {zh,en} }（要问，且问得清）。别的返回值外壳会当场 deny${cannotShape}`,
          );
          continue;
        }

        if (read || deny) {
          readOnProbe.push(tool.name);
          continue;
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
        if (facts === undefined || 'blocked' in facts) {
          headlineNotes.push(
            `${name}: 写工具 ${tool.name} 的 approvalDetail 在合成调用上没有明细（要真的计划/预览过才有）—— ` +
              `头行预算只验到问句与兜底句那一截；明细那一句作者自己按「一句话、≤${HEAD_BUDGETS.detail} 字」看一眼：` +
              `超了就把长内容放进 approval.render 那一格`,
          );
        }
        if (!described) {
          problems.push(
            `${name}: 写工具 ${tool.name} 的 needsApproval 对合成调用回了 ask（要点头），` +
              `但 approvalDetail 没说清"这次会发生什么"（zh/en 或 {blocked}）—— ` +
              `审批屏上用户只能看到一句通用问句，看不到会动什么${cannotShape}`,
          );
        }
      }
      if (readOnProbe.length > 0) {
        probeNotes.push(
          `写工具 ${readOnProbe.join(' / ')} 按合成调用回了"这次不用问"（kind: 'read' 或 'deny'）—— ` +
            `判据只能验到这一步：它是不是"参数里带 confirm 才真的写" / "这一通真跑不成"那种**合法**口径，` +
            `合成调用看不出来（必填项给的是占位值，不是真实写入参数）。作者自己确认一次：` +
            `真的调用会不会 ask、ask 时 approvalDetail 说没说清`,
        );
      }
    }
  }

  const unitList = [...units.entries()].map(([unit, name]) => `${unit} ← ${name}`).join(' · ');

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
            `外壳不许认识任何模块（那等于把"中央清单"搬进外壳）；模块靠服务名挂进来`,
        );
      }
    }
  }

  problems.push(...buildSupplyIndex(supplyDeclarations).problems);

  if (problems.length > 0) {
    const notes = [`${declared} 个带 dsh 声明的包，其中 ${modules} 个模块`, ...probeNotes, ...headlineNotes];

    const bare = [...unresolvedIn].filter(barePackage);
    if (bare.length > 0) {
      notes.push(
        `上面有 ${bare.length} 个包是**裸**的：它上面没有 pnpm-workspace.yaml、自己也没有 node_modules —— ` +
          `那几条 inject/external 正是因为找不到任何同伴包才落不到图里。` +
          `它上面既没有 pnpm-workspace.yaml、自己也没有 node_modules —— 所以找不到任何同伴包。`,
      );
    }
    return { status: 'fail', notes: [...notes, ...warnings.map((one) => `（警告）${one}`)], problems };
  }

  return {
    status: 'pass',
    notes: [
      `${declared} 个带 dsh 声明的包（${modules} 个模块）· bundle 落点存在 · ` +
        `inject/external 都能落到图里 · 单元 id 唯一 · 面文件与 peer 都在 · 各有接线自检`,
      '（test 不在这儿跑：状态级的东西在模块自己的 vitest 里 —— 四个脚本自己跑一遍）',
      `单元：${unitList}`,
      ...probeNotes,
      ...headlineNotes,
      ...warnings.map((one) => `（警告）${one}`),
    ],
    problems: [],
  };
}
