import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import { flagValue, flagsOf } from '../check-flags.mjs';
import { discoverModulePackages } from '../discover.mjs';
import {
  PRIMITIVES_SPECIFIER,
  installedPrimitives,
  pinnedPrimitivesVersion,
  surfaceOf,
} from '../primitives-surface.mjs';
import { BROWSER_SEED_SPECIFIERS, SEED_SPECIFIERS } from '../seed.mjs';
import { shellClientPathOf, shellKitOf } from './shell-artifact.mjs';

const IMPORT = /from\s*'([^']+)'|import\s*\(?\s*'([^']+)'/g;
const SEED = new Set(SEED_SPECIFIERS);
const SHELL = '@dsh-workbench/core';

const SUMMARY_PER_BUCKET = 12;
const BUCKETS = [
  ['components', 'components'],
  ['icons', 'icons'],
  ['hooks', 'hooks'],
  ['lib', 'lib'],
];

function declares(declared, specifier) {
  if (declared.has(specifier)) return true;
  const short = specifier.replace(/^@deepseek-ai\/(dsh-client-)?/, '');
  return declared.has(short);
}

function sourceFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      sourceFiles(full, acc);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

export const title = 'dsh 原语只从模块表拿';

function primitivesFrom(modulePackages) {
  for (const pkg of modulePackages) {
    const found = installedPrimitives(pkg.dir);
    if (found !== undefined) return { ...found, from: pkg.dir };
  }
  const here = installedPrimitives(process.cwd());
  return here === undefined ? undefined : { ...here, from: process.cwd() };
}

function shellManifestOf(from) {
  try {
    return createRequire(join(from, 'package.json')).resolve(`${SHELL}/package.json`);
  } catch {
    return undefined;
  }
}

function kitMembersOf(from) {
  const client = shellClientPathOf(from);
  if (client === undefined || !existsSync(client)) return new Map();
  try {
    const kit = shellKitOf(client);
    const members = new Map();
    for (const [bucket, value] of Object.entries(kit)) {
      if (typeof value !== 'object' || value === null) continue;
      for (const name of Object.keys(value)) if (!members.has(name)) members.set(name, bucket);
    }
    return members;
  } catch {
    return new Map();
  }
}

function truncated(names, all) {
  if (all || names.length <= SUMMARY_PER_BUCKET) return names.join(', ');
  return `${names.slice(0, SUMMARY_PER_BUCKET).join(', ')} …（还有 ${names.length - SUMMARY_PER_BUCKET} 个，加 --all 看全表）`;
}

function faceOf(modulePackages) {
  const flags = flagsOf();
  const all = flags.includes('--all');
  const from = primitivesFrom(modulePackages) ?? { from: process.cwd() };
  const shellManifest = shellManifestOf(from.from);
  const pinned = shellManifest === undefined ? undefined : pinnedPrimitivesVersion(shellManifest);
  const shellVersion = shellManifest === undefined ? undefined : versionOf(shellManifest);

  const declaredLines = [];
  const modules = [];
  for (const pkg of modulePackages) {
    const declared = pkg.manifest.devDependencies?.[PRIMITIVES_SPECIFIER];
    modules.push({ name: pkg.manifest.name, declared: declared ?? null });
    if (declared !== undefined) declaredLines.push(`${pkg.manifest.name} → ${declared}`);
  }
  const drift =
    pinned === undefined ? [] : modules.filter((one) => one.declared !== null && one.declared !== pinned);
  const moduleLine =
    declaredLines.length > 0
      ? `模块声明：${declaredLines.join(' ｜ ')}` +
        (drift.length > 0
          ? ` ⚠️ 与外壳钉的 ${pinned} 不一致（只提醒，不判红；对齐它的写法见下面那段）`
          : '')
      : '模块声明：（还没有模块声明它 —— 模板生成的骨架默认带这一行）';

  const installed = installedPrimitives(from.from);
  if (installed === undefined) {
    const want = pinned ?? '<外壳钉的那版>';
    const notes = [
      `这份工程里没装 ${PRIMITIVES_SPECIFIER} —— 列不出清单。`,
      `  它在 @deepseek-ai/dsh-client-ui-primitives 那个包的 lib/types/**/*.d.ts 里（源码不随包发布）。`,
      `  在模块清单里加这一行：`,
      `    "devDependencies": { "${PRIMITIVES_SPECIFIER}": "${want}" }`,
      `  模板默认带这一行；加完在 dsh.client.external 里也声明 "${PRIMITIVES_SPECIFIER}"（两处都要）。`,
    ];
    if (pinned !== undefined) notes.push(`  外壳（${SHELL}${shellVersion === undefined ? '' : `@${shellVersion}`}）钉的是 ${pinned} —— 对齐它。`);
    return { notes, payload: { installed: null, pinned: pinned ?? null, modules, snippet: devDependencySnippet(want) } };
  }

  let surface;
  try {
    surface = surfaceOf(join(installed.dir, 'lib', 'types'));
  } catch (error) {
    return {
      notes: [
        `装了 ${PRIMITIVES_SPECIFIER}@${installed.version}，但读不出类型面：${error instanceof Error ? error.message : String(error)}`,
        `  上游可能换了 emit 形状 —— 先打开 ${join(installed.dir, 'lib', 'types', 'index.d.ts')} 看一眼，再改 ../primitives-surface.mjs`,
      ],
      payload: { installed: { version: installed.version, dir: installed.dir }, pinned: pinned ?? null, modules, error: String(error) },
    };
  }

  const kit = from.from === undefined ? new Map() : kitMembersOf(from.from);
  const covered = [];
  const only = { components: [], icons: [], hooks: [], lib: [] };
  for (const [bucket] of BUCKETS) {
    for (const name of surface[bucket]) {
      if (kit.has(name)) covered.push({ name, bucket: kit.get(name) });
      else only[bucket].push(name);
    }
  }
  covered.sort((a, b) => a.name.localeCompare(b.name));

  const notes = ['这份装机包的 dsh 原语面（kit 里没有的才用它）：'];
  notes.push(`  装机：${installed.version}`);
  notes.push(`  类型面（绝对路径）：${join(installed.dir, 'lib', 'types')} （某个名字的文件：--files | grep <名字>）`);
  notes.push(
    pinned === undefined
      ? `  外壳钉的：读不到（${shellManifest ?? '找不到 @dsh-workbench/core 的 manifest'}）`
      : `  外壳钉的：${pinned}${shellVersion === undefined ? '' : `（${SHELL}@${shellVersion} 的 devDependencies）`}${pinned === installed.version ? '' : ' ⚠️ 与装机那份不一致'}`,
  );
  notes.push(`  ${moduleLine}`);
  const one = flagValue(flags, '--file');
  if (one !== undefined) {
    const file = surface.files[one];
    notes.push(
      file === undefined
        ? `  --file ${one}：不在这份清单里（用 --files | grep ${one} 找找近似的名字）`
        : `  --file ${one}：${file} （打开看它的 JSDoc 与 prop：sed -n '1,60p' 那一份）`,
    );
  }
  if (flags.includes('--files')) {
    notes.push(
      `  名字 → 类型文件（绝对路径，全表约 ${Object.keys(surface.files).length} 条、会被 tool-result-pruner 裁中间：用 --files | grep <名字> 取一件）`,
    );
    const iconsFile = surface.files[surface.icons[0]];
    for (const [bucket] of BUCKETS) {
      const names = only[bucket];
      if (names.length === 0) continue;
      if (bucket === 'icons') {
        notes.push(`    ${bucket}(${names.length})：全部在 ${iconsFile ?? '？'}`);
        continue;
      }
      for (const name of names) notes.push(`    ${name} → ${surface.files[name] ?? '？'}`);
    }
  } else if (one === undefined) {
    notes.push(
      covered.length === 0
        ? '  kit 里已有（优先用 kit）：（这份外壳的 kit 里没有同名的，下面这些都得引原语）'
        : `  kit 里已有（优先用 kit，别重复引原语）：${truncated(covered.map((one) => `${one.name}(${one.bucket})`), all)}`,
    );
    notes.push(`  只有原语有（用之前先在 dsh.client.external 里声明 "${PRIMITIVES_SPECIFIER}"）：`);
    for (const [bucket] of BUCKETS) {
      const names = only[bucket];
      if (names.length === 0) continue;
      notes.push(`    ${bucket}(${names.length})：${truncated(names, all)}`);
    }
  }
  if (one === undefined) {
    notes.push('  package.json 两处这样写：');
    notes.push(`    "dsh": { "client": { "external": [ …, "${PRIMITIVES_SPECIFIER}" ] } }`);
    notes.push(`    "devDependencies": { "${PRIMITIVES_SPECIFIER}": "${pinned ?? installed.version}" }${pinned !== undefined && pinned !== installed.version ? '  ← 与外壳对齐的那版' : ''}`);
  }

  return {
    notes,
    payload: {
      installed: { version: installed.version, dir: installed.dir },
      roots: { primitives: join(installed.dir, 'lib', 'types') },
      files: surface.files,
      pinned: pinned ?? null,
      shellVersion: shellVersion ?? null,
      modules,
      kitCovered: covered,
      onlyPrimitives: only,
      counts: { total: surface.total, ...Object.fromEntries(BUCKETS.map(([bucket]) => [bucket, only[bucket].length])) },
      snippet: devDependencySnippet(pinned ?? installed.version),
    },
  };
}

function devDependencySnippet(version) {
  return {
    external: PRIMITIVES_SPECIFIER,
    devDependency: { name: PRIMITIVES_SPECIFIER, version },
  };
}

function versionOf(manifestPath) {
  try {
    const version = JSON.parse(readFileSync(manifestPath, 'utf8')).version;
    return typeof version === 'string' ? version : undefined;
  } catch {
    return undefined;
  }
}

export async function run() {
  const modulePackages = discoverModulePackages({ root: process.cwd() });
  const face = process.env.DSH_WB_ONLY === 'primitives'
    ? faceOf(modulePackages)
    : { notes: ['（想知道 dsh 原语里有什么：dsh-wb-module check --only primitives）'], payload: undefined };
  const problems = [];
  let modulesUsingPrimitives = 0;
  let modulesUsingReactOnly = 0;
  let modulesTouchingSeeds = 0;

  for (const pkg of modulePackages) {
    const name = pkg.manifest.name;
    const declared = new Set(pkg.manifest.dsh?.client?.external ?? []);
    const used = new Map();

    for (const file of sourceFiles(join(pkg.dir, 'src'))) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(IMPORT)) {
        const specifier = match[1] ?? match[2];
        if (specifier === undefined || !SEED.has(specifier)) continue;
        if (!used.has(specifier)) used.set(specifier, relative(pkg.dir, file));
      }
    }
    if (used.size === 0) continue;
    modulesTouchingSeeds += 1;
    const dshSeeds = [...used.keys()].filter((specifier) => BROWSER_SEED_SPECIFIERS.includes(specifier));
    if (dshSeeds.length === 0) modulesUsingReactOnly += 1;
    else modulesUsingPrimitives += 1;

    const needsDeclaration = new Set(BROWSER_SEED_SPECIFIERS);
    for (const [specifier, where] of used) {
      if (needsDeclaration.has(specifier) && !declares(declared, specifier)) {
        problems.push(
          `${name}: ${where} 用了 ${specifier}，但 package.json 的 dsh.client.external 里没声明它 —— ` +
            `漏声明会被构建内联进来（第二份实例）。加上 "${specifier}"`,
        );
      }
    }

    const client = join(pkg.dir, 'client.js');
    if (!existsSync(client)) {
      problems.push(`${name}: 源码用了 dsh 的种子词，但没有 client.js —— 先跑 dsh-wb-module build`);
    } else {
      const text = readFileSync(client, 'utf8');
      for (const [specifier, where] of used) {
        if (!text.includes(`require(${JSON.stringify(specifier)})`)) {
          problems.push(
            `${name}: ${where} 用了 ${specifier}，但产物 client.js 里没有 require("${specifier}") —— ` +
              `它被**内联**进产物了（第二份实例）。检查 dsh.client.external 与构建用的 module-tools 版本`,
          );
        }
      }
    }

    const host = join(pkg.dir, 'dist', 'host.js');
    if (existsSync(host)) {
      const text = readFileSync(host, 'utf8');
      for (const specifier of BROWSER_SEED_SPECIFIERS) {
        if (text.includes(`"${specifier}"`)) {
          problems.push(
            `${name}: 宿主产物 dist/host.js 里出现了 ${specifier} —— 那些包只在浏览器侧存在，` +
              `宿主侧引用它就是起来那一刻炸`,
          );
        }
      }
    }
  }

  const payload = face.payload === undefined ? {} : { payload: face.payload };

  if (problems.length > 0) {
    return { status: 'fail', notes: face.notes, problems, ...payload };
  }
  if (modulePackages.length === 0) {
    return {
      status: 'skip',
      notes: ['没有模块包（没有声明 dsh.workbench 的包）—— 没有 dsh 原语的声明与产物可对', ...face.notes],
      problems: [],
      ...payload,
    };
  }
  if (modulesTouchingSeeds === 0) {
    return {
      status: 'skip',
      notes: [
        '没有模块用到平台种子词（react / react-dom / dsh 的浏览器包）—— 没有可对照的声明与产物',
        ...face.notes,
      ],
      problems: [],
      ...payload,
    };
  }
  return {
    status: 'pass',
    notes: [
      `${modulesUsingPrimitives} 个模块在用 dsh 的包（都声明了 external、产物里都是 ` +
        `require、宿主产物里没有它们）· 另有 ${modulesUsingReactOnly} 个模块只用到 react/react-dom`,
      ...face.notes,
    ],
    problems: [],
    ...payload,
  };
}
