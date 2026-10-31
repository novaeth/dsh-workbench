import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { flagValue, flagsOf } from '../check-flags.mjs';
import { discoverModulePackages } from '../discover.mjs';
import { memberFilesOf } from '../shell-type-files.mjs';
import { shellClientPathOf, shellKitOf } from './shell-artifact.mjs';

const SHELL = '@dsh-workbench/core';
const KIT_SPECIFIER = '@dsh-workbench/core/client';

export const title = '外壳 kit 面';

function kitUsageOf(text) {
  const bindings = new Set();
  const BINDING = /(?:var|const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:__toESM\(\s*)?require\(\s*["']@dsh-workbench\/core\/client["']\s*\)/g;
  for (const match of text.matchAll(BINDING)) bindings.add(match[1]);
  if (bindings.size === 0) {

    for (const match of text.matchAll(/([A-Za-z_$][\w$]*)\.kit\./g)) bindings.add(match[1]);
  }

  const used = new Map();
  const add = (bucket, member) => {
    if (bucket === undefined || member === undefined || member === '') return;
    if (!used.has(bucket)) used.set(bucket, new Set());
    used.get(bucket).add(member);
  };
  for (const id of bindings) {
    const dotted = new RegExp(`\\b${id}\\.kit\\.([a-z]+)\\.([A-Za-z0-9_$]+)`, 'g');
    for (const match of text.matchAll(dotted)) add(match[1], match[2]);
    const destructured = new RegExp(`\\{([^{}]*)\\}\\s*=\\s*${id}\\.kit\\.([a-z]+)\\s*;`, 'g');
    for (const match of text.matchAll(destructured)) {
      for (const raw of match[1].split(',')) {
        const name = raw.split(':')[0].trim();
        if (name !== '') add(match[2], name);
      }
    }
  }
  return used;
}

function floorOf(range) {
  if (typeof range !== 'string') return undefined;
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(range);
  if (match === null) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function below(a, b) {
  for (let at = 0; at < 3; at += 1) {
    if (a[at] !== b[at]) return a[at] < b[at];
  }
  return false;
}

function faceNotes(asked, shells) {
  const faceShell = shells[shells.length - 1] ?? shellClientPathOf(process.cwd());
  if (!asked) {
    return { notes: ['（想知道这份外壳的 kit 里有什么：dsh-wb-module check --only kit）'] };
  }
  if (faceShell === undefined || !existsSync(faceShell)) {
    return { notes: ['（没找到外壳的 client.js，列不出 kit 面：先确认 node_modules 里装着 @dsh-workbench/core）'] };
  }
  try {
    const kit = shellKitOf(faceShell);
    const buckets = Object.keys(kit)
      .filter((bucket) => typeof kit[bucket] === 'object' && kit[bucket] !== null)
      .sort();
    if (buckets.length === 0) {
      return { notes: [`（${faceShell} 里没取出 kit：外壳版本可能太旧）`] };
    }
    const every = new Map();
    for (const bucket of buckets) {
      for (const name of Object.keys(kit[bucket])) every.set(name, (every.get(name) ?? 0) + 1);
    }
    const flags = flagsOf();
    const one = flagValue(flags, '--file');
    const { roots, files, missing } = memberFilesOf(faceShell, [...every.keys()]);
    const rootLine =
      Object.entries(roots).length === 0
        ? '  类型面：读不到（外壳包里没有 dist/types，@dsh-workbench/shared 也没装）'
        : `  类型面（绝对路径）：${Object.entries(roots).map(([pkg, dir]) => `${pkg} → ${dir}`).join(' ｜ ')}` +
          ` （某个名字的文件：--file <名字>，或 --files | grep <名字>）`;

    const notes = [`这份外壳（${faceShell}）的 kit 面 —— 只能用这些，别自己造：`, rootLine];
    if (one !== undefined) {
      const file = files.get(one);
      notes.push(
        file === undefined
          ? `  --file ${one}：不在这份清单里（用 --files | grep ${one} 找找近似的名字）`
          : `  --file ${one}：${file} （打开看它的 JSDoc 与 prop：sed -n '1,60p' 那一份）`,
      );
    }
    if (flags.includes('--files')) {
      notes.push(
        `  名字 → 类型文件（绝对路径，全表 ${every.size} 条、会被 tool-result-pruner 裁中间：用 --files | grep <名字> 取一件）`,
      );
      for (const name of [...every.keys()].sort()) {
        notes.push(`    ${name} → ${files.get(name) ?? '（没扫到，见上面那两棵根）'}`);
      }
      if (missing.length > 0) notes.push(`  ${missing.length} 个没扫到：${missing.join('、')}`);
    } else if (one === undefined) {
      for (const bucket of buckets) {
        const names = Object.keys(kit[bucket]);
        const only = names.filter((name) => every.get(name) === 1).sort();
        notes.push(`  ${bucket}(${names.length})：${only.length === 0 ? '（全部来自下面的共用面）' : only.join(', ')}`);
      }
      const shared = [...every.entries()].filter(([, count]) => count > 1).map(([name]) => name).sort();
      notes.push(`  共用面(${shared.length})：每个桶里都有 —— ${shared.join(', ')}`);
    }
    return {
      notes,
      payload: {
        shell: faceShell,
        roots,
        buckets: Object.fromEntries(buckets.map((bucket) => [bucket, Object.keys(kit[bucket])])),
        files: Object.fromEntries([...every.keys()].sort().map((name) => [name, files.get(name) ?? null])),
        missing,
      },
    };
  } catch (error) {
    return { notes: [`（取不出这份外壳的 kit 面：${error instanceof Error ? error.message : String(error)}）`] };
  }
}

export async function run() {
  const problems = [];
  let inspected = 0;
  let noArtifact = 0;
  let noShell = 0;
  const override = process.env.DSH_WB_CORE_CLIENT;
  const shells = [];
  const modulePackages = discoverModulePackages({ root: process.cwd() });

  for (const pkg of modulePackages) {
    const name = pkg.manifest.name;
    const client = join(pkg.dir, 'client.js');
    if (!existsSync(client)) {
      noArtifact += 1;
      continue;
    }
    inspected += 1;
    const text = readFileSync(client, 'utf8');
    const used = kitUsageOf(text);
    const uses = used.size > 0 ? text.includes(KIT_SPECIFIER) : false;

    if (uses) {
      const shellClient = shellClientPathOf(pkg.dir);
      if (shellClient === undefined || !existsSync(shellClient)) {
        noShell += 1;
      } else {
        let kit;
        try {
          kit = shellKitOf(shellClient);
        } catch (error) {
          problems.push(
            `${name}: 取不出这份外壳的 kit（${shellClient}）—— ${error instanceof Error ? error.message : String(error)}。` +
              `执行产物是这份判据唯一可信的取数方式；看不懂就别放着不管`,
          );
          kit = undefined;
        }
        if (kit !== undefined) {
          if (!shells.includes(shellClient)) shells.push(shellClient);
          const missing = [];
          for (const [bucket, members] of used) {
            for (const member of [...members].sort()) {
              if (kit[bucket]?.[member] === undefined) missing.push(`kit.${bucket}.${member}`);
            }
          }
          if (missing.length > 0) {
            problems.push(
              `${name}: 产物用了这份外壳（${shellClient}）里没有的 ${missing.join('、')} —— ` +
                `顶层解构不会抛（拿到 undefined），卡片首帧渲染才炸 "Element type is invalid"；` +
                `外壳会把这张卡收进错误态（只炸这一张，但用户看到的是错误页而不是你的卡）。` +
                `要么去掉/换掉这些成员，要么把 peer 下限提到真正需要的那版`,
            );
          }
        }
      }
    }

    const peerFloor = floorOf(pkg.manifest.peerDependencies?.[SHELL]);
    const devFloor = floorOf(pkg.manifest.devDependencies?.[SHELL]);
    if (peerFloor !== undefined && devFloor !== undefined && below(peerFloor, devFloor) && override === undefined) {
      problems.push(
        `${name}: peer 下限 ${pkg.manifest.peerDependencies[SHELL]} 比 devDependency ${pkg.manifest.devDependencies[SHELL]} 还旧 —— ` +
          `你对用户承诺的那版外壳，产物从没对着验过。把 peer 下限提到与 devDependency 同档；` +
          `确实要支持更旧的外壳，就用 DSH_WB_CORE_CLIENT=<那版外壳的 client.js> 跑一遍 check --only kit 证明面够用`,
      );
    }
  }

  const asked = process.env.DSH_WB_ONLY === 'kit';
  const face = faceNotes(asked, shells);
  const payload = face.payload === undefined ? {} : { payload: face.payload };

  if (problems.length > 0) {

    const extra = face.payload === undefined ? {} : { payload: { ...face.payload, problems } };
    return { status: 'fail', notes: [], problems, ...extra };
  }

  if (inspected === 0) {
    const why =
      modulePackages.length === 0
        ? '没有模块包（没有声明 dsh.workbench 的包）—— 没有产物可对'
        : `${noArtifact} 个还没建产物（跳过）`;
    return { status: 'skip', notes: [why, ...face.notes], problems: [], ...payload };
  }

  const notes = [
    `${inspected} 个模块的产物对过外壳 kit 面`,
    override === undefined ? '（按各自装的那份外壳）' : `（DSH_WB_CORE_CLIENT=${override}）`,
  ];
  if (noArtifact > 0) notes.push(`${noArtifact} 个还没建产物（跳过）`);
  if (noShell > 0) notes.push(`${noShell} 个没装外壳（跳过面差）`);
  return { status: 'pass', notes: [...notes, ...face.notes], problems: [], ...payload };
}
