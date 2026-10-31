import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';

function manifestOf(dir) {
  const file = join(dir, 'package.json');
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

function stripComment(line) {
  const at = line.indexOf('#');
  return at === -1 ? line : line.slice(0, at);
}

function unquote(value) {
  return value.trim().replace(/^['"]|['"]$/g, '').trim();
}

function flowPatterns(text) {
  const inner = text.trim().replace(/^\[/, '').replace(/\]$/, '');
  if (inner.trim() === '') return [];
  return inner
    .split(',')
    .map(unquote)
    .filter((one) => one !== '');
}

function patternsFromYaml(text) {
  const lines = text.split(/\r?\n/);
  const patterns = [];
  let state = 'idle';
  for (const raw of lines) {
    const line = stripComment(raw);
    if (line.trim() === '') continue;
    if (state === 'idle') {
      const match = /^packages\s*:\s*(.*)$/.exec(line);
      if (match === null) continue;
      const rest = match[1].trim();
      if (rest.startsWith('[')) {
        const flow = flowPatterns(rest);
        patterns.push(...flow);
        return { declared: true, patterns, empty: flow.length === 0 };
      }
      if (rest !== '') return { declared: true, patterns: flowPatterns(rest) };
      state = 'block';
      continue;
    }
    const item = /^\s*-\s*(.+?)\s*$/.exec(line);
    if (item !== null) {
      const value = unquote(item[1]);
      if (value !== '') patterns.push(value);
      continue;
    }
    return { declared: true, patterns };
  }
  return state === 'block' ? { declared: true, patterns } : { declared: false, patterns: [] };
}

function patternsOf(root) {
  const yaml = join(root, 'pnpm-workspace.yaml');
  if (existsSync(yaml)) {
    const parsed = patternsFromYaml(readFileSync(yaml, 'utf8'));
    if (parsed.declared) {
      if (parsed.patterns.length === 0 && parsed.empty !== true) {
        throw new Error(
          `pnpm-workspace.yaml 里有 packages 但没有解析出任何条目：${yaml} —— ` +
            '支持缩进/不缩进的块列表、行内数组与 ! 排除；花括号、字符类等写法请改成显式目录',
        );
      }
      return parsed;
    }
  }
  const manifest = manifestOf(root);
  const workspaces = manifest?.workspaces;
  if (Array.isArray(workspaces)) {
    return { declared: true, patterns: workspaces.filter((one) => typeof one === 'string') };
  }
  if (workspaces !== null && typeof workspaces === 'object' && Array.isArray(workspaces.packages)) {
    return { declared: true, patterns: workspaces.packages.filter((one) => typeof one === 'string') };
  }
  return { declared: false, patterns: [] };
}

export function workspaceRootOf(start) {
  if (process.env.DSH_WB_ROOT) return process.env.DSH_WB_ROOT;
  let dir = start;
  let legacy;
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const manifest = manifestOf(dir);
    if (manifest !== undefined) {
      const workspaces = manifest.workspaces;
      if (Array.isArray(workspaces) || (workspaces !== null && typeof workspaces === 'object')) return dir;
    }
    if (legacy === undefined && existsSync(join(dir, 'packages'))) legacy = dir;
    const parent = dirname(dir);
    if (parent === dir) return legacy ?? start;
    dir = parent;
  }
}

function isDir(dir) {
  try {
    return statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

function segmentMatches(name, segment) {
  if (/[{}[\]()|+@!]/.test(segment)) {
    throw new Error(`工作区 glob 里这个写法暂不支持：${segment}（改成 *、** 或显式目录）`);
  }
  const pattern = segment
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]');
  return new RegExp(`^${pattern}$`).test(name);
}

function childDirs(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.name !== 'node_modules' && !entry.name.startsWith('.'))
      .map((entry) => join(dir, entry.name))
      .filter((child) => isDir(child));
  } catch {
    return [];
  }
}

function walkDirs(dir, out) {
  out.push(dir);
  for (const child of childDirs(dir)) walkDirs(child, out);
  return out;
}

function expandPattern(root, pattern) {
  if (/[{}[\]()|+]/.test(pattern)) {
    throw new Error(`工作区 glob 里这个写法暂不支持：${pattern}（改成 *、** 或显式目录）`);
  }
  const parts = pattern.replace(/\\/g, '/').split('/').filter((one) => one !== '' && one !== '.');
  let current = [root];
  for (const part of parts) {
    const next = [];
    for (const base of current) {
      if (part === '**') {
        walkDirs(base, next);
        continue;
      }
      if (part.includes('*') || part.includes('?')) {
        for (const child of childDirs(base)) {
          if (segmentMatches(basename(child), part)) next.push(child);
        }
        continue;
      }
      const exact = join(base, part);
      if (isDir(exact)) next.push(exact);
    }
    current = next;
  }
  return current;
}

const cache = new Map();

function legacyPackages(root) {
  return childDirs(join(root, 'packages'));
}

export function discoverPackages({ root = process.cwd() } = {}) {
  const workspace = workspaceRootOf(root);
  const parsed = patternsOf(workspace);
  const positive = parsed.patterns.filter((one) => !one.startsWith('!'));
  const negative = parsed.patterns.filter((one) => one.startsWith('!')).map((one) => one.slice(1));
  const key = [workspace, root, parsed.patterns.join('|')].join('\0');
  const cached = cache.get(key);
  if (cached !== undefined) return cached.map((pkg) => ({ ...pkg }));

  const dirs = [];
  const push = (dir) => {
    if (existsSync(dir)) dirs.push(dir);
  };
  if (!parsed.declared) {
    for (const dir of legacyPackages(workspace)) push(dir);
  } else {
    const excluded = new Set();
    for (const pattern of negative) {
      for (const dir of expandPattern(workspace, pattern)) excluded.add(realpathSync(dir));
    }
    for (const pattern of positive) {
      for (const dir of expandPattern(workspace, pattern)) {
        if (excluded.has(realpathSync(dir))) continue;
        push(dir);
      }
    }
  }
  const isolated = process.env.DSH_WB_ROOT?.trim();
  const inside = isolated === undefined || isolated === '' || resolve(root).startsWith(resolve(workspace) + sep);
  if (inside) push(root);
  push(workspace);

  const seen = new Set();
  const found = [];
  for (const dir of dirs) {
    const resolved = existsSync(dir) ? realpathSync(dir) : dir;
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    const manifest = manifestOf(dir);
    if (manifest === undefined || typeof manifest.name !== 'string') continue;
    found.push({ dir, manifest });
  }
  cache.set(key, found);
  return found.map((pkg) => ({ ...pkg }));
}

export function discoverModulePackages(options = {}) {
  return discoverPackages(options).filter((pkg) => pkg.manifest.dsh?.workbench !== undefined);
}
