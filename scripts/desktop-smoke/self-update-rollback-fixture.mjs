import { copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';


const CORE = '@dsh-workbench/core';

function packageDirs(profileDir) {
  const scope = join(profileDir, 'node_modules', '@dsh-workbench');
  const extra = ['@pagoda-dsh-workbench'];
  const found = existsSync(scope) ? readdirSync(scope).map((name) => join(scope, name)) : [];
  return [...found, ...extra.map((owner) => join(profileDir, 'node_modules', owner))].filter((dir) => existsSync(dir));
}

export function profileWithWorkbench(home) {
  const root = join(home, 'profiles');
  if (!existsSync(root)) return undefined;
  for (const name of readdirSync(root)) {
    if (existsSync(join(root, name, 'node_modules', CORE, 'package.json'))) return name;
  }
  return undefined;
}

function repoPackageDirs(root) {
  if (root === undefined || !existsSync(root)) return [];
  const found = [];
  for (const entry of readdirSync(root)) {
    const manifest = join(root, entry, 'package.json');
    if (!existsSync(manifest)) continue;
    try {
      if (String(JSON.parse(readFileSync(manifest, 'utf8')).name ?? '').startsWith('@dsh-workbench/')) {
        found.push(join(root, entry));
      }
    } catch {
      continue;
    }
  }
  return found;
}

export function plantPreviousVersion(input) {
  const { home, profile, version, repoPackages } = input;
  const profileDir = join(home, 'profiles', profile);
  const versionDir = join(home, 'workbench', 'versions', version);
  mkdirSync(versionDir, { recursive: true });
  const fromProfile = packageDirs(profileDir);
  const installed = fromProfile.length > 0 ? fromProfile : repoPackageDirs(repoPackages);
  if (installed.length === 0) {
    const nodeModules = join(profileDir, 'node_modules');
    const seen = existsSync(nodeModules) ? readdirSync(nodeModules).join(', ') : '（没有 node_modules）';
    throw new Error(`profile 里没有装工作台：${profileDir}；node_modules 里有：${seen}`);
  }
  const closure = join(versionDir, 'node_modules');
  mkdirSync(closure, { recursive: true });
  const closureSource = existsSync(join(profileDir, 'node_modules'))
    ? join(profileDir, 'node_modules')
    : join(repoPackages ?? '', '..', 'node_modules');
  for (const entry of existsSync(closureSource) ? readdirSync(closureSource) : []) {
    if (entry === '@dsh-workbench' || entry === '.bin') continue;
    const from = join(closureSource, entry);
    const into = join(closure, entry);
    if (existsSync(into)) continue;
    if (lstatSync(from).isDirectory() || lstatSync(from).isSymbolicLink()) {
      symlinkSync(from, into, 'junction');
    } else {
      copyFileSync(from, into);
    }
  }
  for (const dir of installed) {
    const raw = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const name = String(raw.name);
    const into = join(versionDir, 'node_modules', name);
    cpSync(dir, into, {
      recursive: true,
      dereference: true,
      filter: (src) => src === dir || !src.slice(dir.length).split(sep).includes('node_modules'),
    });
    const manifest = join(into, 'package.json');
    if (!existsSync(manifest)) continue;
    writeFileSync(manifest, `${JSON.stringify({ ...raw, version }, null, 2)}\n`);
  }
  const currentOf = (dir) => {
    try {
      return String(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version ?? '');
    } catch {
      return '';
    }
  };
  const current = currentOf(join(profileDir, 'node_modules', CORE)) || currentOf(installed.find((dir) => currentOf(dir) !== '') ?? '');
  const marker = join(home, 'workbench', 'self-update.json');
  mkdirSync(dirname(marker), { recursive: true });
  writeFileSync(
    marker,
    `${JSON.stringify(
      {
        dshHome: home,
        profile,
        pkg: CORE,
        from: version,
        to: current,
        version: current,
        pinned: false,
        state: 'ok',
        at: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
  return { profileDir, versionDir, marker, packages: installed.length, current };
}

function realHomeOffer() {
  return process.env.CI === 'true' || process.env.DSH_SMOKE_ALLOW_REAL_HOME === '1';
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const home = process.argv[2] ?? join(homedir(), '.dsh');
  if (home === join(homedir(), '.dsh') && !realHomeOffer()) {
    throw new Error('这一版是给 CI 用的：要往真实 ~/.dsh 里铺，得显式带上 DSH_SMOKE_ALLOW_REAL_HOME=1');
  }
  const asked = process.argv[3]?.trim() ?? '';
  const profile = asked === '' ? profileWithWorkbench(home) : asked;
  if (profile === undefined) throw new Error(`没有哪个 profile 里装着工作台：${join(home, 'profiles')}`);
  const version = process.argv[4] ?? '0.0.0-previous';
  const repoPackages = process.argv[5];
  const planted = plantPreviousVersion({ home, profile, version, repoPackages });
  process.stdout.write(`profile=${profile}\n`);
  process.stdout.write(
    `已铺好上一版：${planted.versionDir}（${String(planted.packages)} 个包；现在是 ${planted.current}）\n`,
  );
}
