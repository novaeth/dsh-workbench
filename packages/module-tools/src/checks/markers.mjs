import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { discoverPackages } from '../discover.mjs';

const MARKERS_ENV = 'DSH_WB_INTERNAL_MARKERS';

const BUILT_IN = [
  ['私有 npm 源', /[a-z0-9-]+\.pkg\.[a-z0-9-]+\.(?:net|com|cn)/i],
  ['私网 IP', /\b(?:10\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}\b/],
  ['内部域名后缀', /\.(?:internal|corp|local)(?:[/:?#]|$)/i],
];

const SKIP = new Set(['node_modules', 'dist', 'coverage', '.git', '.turbo']);

const OWN_SCOPE = '@dsh-workbench/';

const isOurs = (pkg) =>
  pkg.manifest.dsh?.workbench !== void 0 ||
  String(pkg.manifest.name ?? '').startsWith(OWN_SCOPE);

function configured() {
  const raw = process.env[MARKERS_ENV];
  if (raw === undefined || raw.trim() === '') return { markers: [], problems: [] };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { markers: [], problems: [`${MARKERS_ENV} 不是合法 JSON`] };
  }
  if (!Array.isArray(parsed)) {
    return { markers: [], problems: [`${MARKERS_ENV} 必须是数组：每项 [名字, 正则源码]`] };
  }
  const markers = [];
  const problems = [];
  for (const [index, entry] of parsed.entries()) {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || typeof entry[1] !== 'string') {
      problems.push(`${MARKERS_ENV}[${index}] 必须是 [名字, 正则源码]`);
      continue;
    }
    try {
      markers.push([entry[0], new RegExp(entry[1], 'i')]);
    } catch {
      problems.push(`${MARKERS_ENV}[${index}] 的正则源码编译不了：${entry[1]}`);
    }
  }
  return { markers, problems };
}

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

export const title = '公开包无内部标识';

export async function run() {
  const { markers: extra, problems: configProblems } = configured();
  if (configProblems.length > 0) {
    return {
      status: 'fail',
      notes: [`（${MARKERS_ENV} 的形状不对，这一轮没有扫）`],
      problems: configProblems,
    };
  }
  const markers = [...BUILT_IN, ...extra];
  const publicPackages = discoverPackages({ root: process.cwd() }).filter(
    (pkg) => isOurs(pkg) && pkg.manifest.publishConfig?.access === 'public',
  );
  const problems = [];
  for (const pkg of publicPackages) {
    for (const file of walk(pkg.dir)) {
      let text;
      try {
        text = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      text.split('\n').forEach((line, index) => {
        for (const [label, pattern] of markers) {
          if (pattern.test(line)) {
            problems.push(`${pkg.manifest.name}: ${relative(pkg.dir, file)}:${index + 1} 命中${label} —— ${line.trim().slice(0, 120)}`);
          }
        }
      });
    }
  }

  if (problems.length > 0) {
    return {
      status: 'fail',
      notes: ['（发布前扫一遍：内网源地址、内网域名、企业内部名都不该出现在公网包里）'],
      problems,
    };
  }
  if (publicPackages.length === 0) {
    return {
      status: 'skip',
      notes: [`没有要发出去的公开包（${OWN_SCOPE}* 名下、或声明了 dsh.workbench 的，且 access=public）—— 没有包要扫`],
      problems: [],
    };
  }
  return {
    status: 'pass',
    notes: [
      `${publicPackages.length} 个 access=public 的包扫过` +
        (extra.length === 0 ? `（组织特有标识由 ${MARKERS_ENV} 提供；这次没设）` : `（另有 ${extra.length} 条来自 ${MARKERS_ENV}）`),
    ],
    problems: [],
  };
}
