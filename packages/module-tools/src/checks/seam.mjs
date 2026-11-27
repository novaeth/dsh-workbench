import { readFileSync } from 'node:fs';
import { relative } from 'node:path';

import { discoverModulePackages } from '../support/discover.mjs';
import { scopedPackages } from '../support/scope.mjs';
import { reachableFrom } from './source.mjs';

export const title = '模块执行缝（写入域）';

const SCOPE_USE = /scope\s*:\s*['"](unit|workspace)['"]/g;

const RAW_SEAM = [
  { pattern: /\brunShell\b/, what: '用了原始 shell 的 runShell（导入或调用）' },
  { pattern: /\bshellOf\b/, what: '用了原始 shell 的 shellOf（导入或调用）' },
  {
    pattern: /ctx\s*\.\s*get\s*\(\s*['"`](shell|workbenchShell|seam)['"`]/,
    what: '从工作台服务里取了原始执行缝',
  },
  { pattern: /['"](?:node:)?child_process['"]/, what: '直接引了 child_process' },
  { pattern: /['"]execa['"]/, what: '直接引了 execa（模块不得自行启动进程）' },
  { pattern: /kind\s*:\s*['"]host['"]/, what: '请求了宿主写入域（模块只有 unit / workspace 两档）' },
];

const SEAM_FIX =
  '模块启动子进程只通过门面：mount(deps) 中的 `deps.seam.run({ scope: "unit" | "workspace", command })`，' +
  '清单中用 `dsh.workbench.host.writes` 声明需要哪几档（写法见 `@dsh-workbench/core` 的 ' +
  '`skills/workbench-module-diy/WIRING.md`）';

const WRITE_SCOPES = ['unit', 'workspace'];

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function rawSeamProblemsOf(name, rel, text) {
  const problems = [];
  for (const entry of RAW_SEAM) {
    const match = entry.pattern.exec(text);
    if (match === null) continue;
    problems.push(`${name}: ${rel}:${lineOf(text, match.index)} ${entry.what} —— ${SEAM_FIX}`);
  }
  return problems;
}

export function declaredWritesOf(workbench) {
  const host = isRecord(workbench) ? workbench.host : undefined;
  const writes = isRecord(host) ? host.writes : undefined;
  return new Set(Array.isArray(writes) ? writes.filter((scope) => WRITE_SCOPES.includes(scope)) : []);
}

export function declaredWritesProblemsOf(name, workbench) {
  const host = isRecord(workbench) ? workbench.host : undefined;
  if (!isRecord(host) || host.writes === undefined) return [];
  const writes = host.writes;
  if (!Array.isArray(writes)) {
    return [
      `${name}: dsh.workbench.host.writes 应为写入域列表（"unit" / "workspace"），` +
        `现在是 ${JSON.stringify(writes)}`,
    ];
  }
  const outside = writes.filter((scope) => !WRITE_SCOPES.includes(scope));
  if (outside.length === 0) return [];
  return [
    `${name}: dsh.workbench.host.writes 里有不认的写入域 ` +
      `${outside.map((scope) => JSON.stringify(scope)).join(' / ')} —— ` +
      '仅接受 "unit"（模块自己的数据目录，<运行时根>/units/<unit>）与 "workspace"（当前会话工作区）两档；' +
      '模块无法获取产品域与任意路径；不要写其他名称（不写 = 不提供执行缝门面）',
  ];
}

export function writesUseProblemsOf(name, rel, text, declared) {
  if (!/\bseam\b/.test(text)) return [];
  const problems = [];
  const seen = new Set();
  for (const match of text.matchAll(SCOPE_USE)) {
    const scope = match[1];
    if (seen.has(scope) || declared.has(scope)) continue;
    seen.add(scope);
    problems.push(
      `${name}: ${rel}:${lineOf(text, match.index)} 请求了 ${scope} 档，但清单 ` +
        `dsh.workbench.host.writes 没声明它 —— 工作台不会把门面交给这个模块（deps.seam 是 undefined）：` +
        `请在清单中补充 "writes": ["${scope}"]，或不要请求这一档`,
    );
  }
  return problems;
}

export async function run(options = {}) {
  const modulePackages = scopedPackages(discoverModulePackages({ root: process.cwd() }), options.scope);
  const problems = [];
  let scanned = 0;
  let scannedUnits = 0;
  let seamUnits = 0;

  for (const pkg of modulePackages) {
    const name = pkg.manifest.name;
    const workbench = pkg.manifest.dsh?.workbench;
    problems.push(...declaredWritesProblemsOf(name, workbench));
    const declared = declaredWritesOf(workbench);
    if (declared.size > 0) seamUnits += 1;
    const hostFace = pkg.manifest.dsh?.workbenchFaces?.host;
    if (typeof hostFace !== 'string') continue;
    const unit = typeof workbench?.unit === 'string' ? workbench.unit : '';
    scannedUnits += 1;
    for (const file of reachableFrom(pkg.dir, unit, hostFace)) {
      const text = readFileSync(file, 'utf8');
      const rel = relative(pkg.dir, file);
      scanned += 1;
      problems.push(...rawSeamProblemsOf(name, rel, text));
      problems.push(...writesUseProblemsOf(name, rel, text, declared));
    }
  }

  if (modulePackages.length === 0) {
    return {
      status: 'skip',
      notes: ['没有模块包（没有声明 dsh.workbench 的包）—— 没有执行缝用法需要检查'],
      problems: [],
    };
  }
  if (problems.length > 0) return { status: 'fail', notes: [], problems };
  return {
    status: 'pass',
    notes: [
      `${modulePackages.length} 个模块包 · ${scannedUnits} 个宿主面 · ${scanned} 个宿主侧源文件 · ` +
        `${seamUnits} 个模块声明了写入域（不直接取原始 shell / 不直接使用 child_process；` +
        '请求的写入域均在清单中）',
    ],
    problems: [],
  };
}
