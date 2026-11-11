import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execaSync } from 'execa';

const FALLBACK_REGISTRY = 'https://registry.npmjs.org/';

function unquoted(value) {
  const quote = value.charAt(0);
  if (value.length >= 2 && (quote === '"' || quote === "'") && value.endsWith(quote)) {
    return value.slice(1, -1).trim();
  }
  return value;
}

export function registryOf(profileDir) {
  let text;
  try {
    text = readFileSync(join(profileDir, '.npmrc'), 'utf8');
  } catch {
    return undefined;
  }
  let fallback;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = unquoted(trimmed.slice(separator + 1).trim());
    if (value === '') continue;
    if (key === '@dsh-workbench:registry') return value;
    if (key === 'registry') fallback = value;
  }
  return fallback;
}

export function npmDefaultRegistry() {
  const run = execaSync('npm', ['config', 'get', 'registry'], { reject: false });
  const registry = (run.stdout ?? '').trim();
  if (run.exitCode === 0 && registry !== '') return registry;
  return FALLBACK_REGISTRY;
}

export function registryOfOrDefault(profileDir) {
  return registryOf(profileDir) ?? npmDefaultRegistry();
}

export function distTag(profileDir, core, tag) {
  const registry = registryOfOrDefault(profileDir);
  const run = execaSync('npm', ['view', core, `dist-tags.${tag}`, '--registry', registry], { reject: false });
  const version = (run.stdout ?? '').trim();
  if (run.exitCode !== 0 || version === '') {
    throw new Error(`读不到 ${core} 的 ${tag} dist-tag（registry ${registry}）`);
  }
  return version;
}

export async function distModule(root, ...parts) {
  const file = join(root, 'packages', ...parts);
  if (!existsSync(file)) throw new Error(`dist 里没有 ${file} —— 先在仓根 build 一次再来跑`);
  return import(pathToFileURL(file).href);
}

export function rewriteVersions(versionDir, version, packages) {
  for (const name of packages) {
    const manifest = join(versionDir, 'node_modules', name, 'package.json');
    if (!existsSync(manifest)) throw new Error(`安装树里没有 ${name}：${manifest}`);
    const raw = JSON.parse(readFileSync(manifest, 'utf8'));
    writeFileSync(manifest, `${JSON.stringify({ ...raw, version }, null, 2)}\n`);
  }
}

async function installNewest({ root, dshHome, profile, version, packages, core, log }) {
  const versions = await distModule(root, 'adapter-probe', 'dist', 'version-dir.js');
  const steps = await distModule(root, 'adapter-probe', 'dist', 'self-update-steps.js');
  const plan = await distModule(root, 'adapter-probe', 'dist', 'self-update-plan.js');
  const paths = plan.selfUpdatePaths();
  const profileDir = join(dshHome, 'profiles', profile);
  const newestDir = join(paths.versionsDir, version);
  if (versions.versionSelfCheck({ versionDir: newestDir, version, packages })) {
    log(`最新版已经装好，跳过安装：${newestDir}`);
    return { versions, paths, profileDir, newestDir };
  }
  const project = versions.versionProjectFiles({ profileDir, versionsDir: paths.versionsDir, version, packages });
  const built = steps.selfUpdateStepsOf({ dshHome, profile, pkg: core, from: version, to: version, pinned: false }, paths);
  const install = built.steps.find((step) => step.kind === 'install');
  if (install === undefined) throw new Error('selfUpdateStepsOf 里没有 install 这一步');
  log(`真装最新版 ${version} → ${newestDir}`);
  const result = await versions.installVersionDir({
    project,
    version,
    command: 'install',
    deps: {
      run: async () => {
        try {
          const run = execaSync(install.file, [...install.args], {
            cwd: install.cwd,
            env: { ...process.env, ...install.env },
            reject: false,
            all: true,
          });
          return { ok: run.exitCode === 0, detail: run.all ?? `${run.stdout ?? ''}${run.stderr ?? ''}` };
        } catch (error) {
          return { ok: false, detail: String(error) };
        }
      },
      log,
    },
    packages,
  });
  if (!result.ok) {
    throw new Error(`装最新版 ${version} 没成：\n${result.detail.trimEnd().split('\n').slice(-40).join('\n')}`);
  }
  log(result.detail.trimEnd().split('\n').slice(-6).join('\n'));
  if (!versions.versionSelfCheck({ versionDir: newestDir, version, packages })) {
    throw new Error(`最新版自检没过（包或客户端产物不全）：${newestDir}`);
  }
  return { versions, paths, profileDir, newestDir };
}

export async function plantCopiedVersion(input) {
  const { root, dshHome, profile, version, newest, packages, core, log } = input;
  if (version === newest) throw new Error(`起点版号 ${version} 不能等于最新版 ${newest}`);
  const { versions, paths, profileDir, newestDir } = await installNewest({
    root,
    dshHome,
    profile,
    version: newest,
    packages,
    core,
    log,
  });
  const versionDir = join(paths.versionsDir, version);
  rmSync(versionDir, { recursive: true, force: true });
  cpSync(newestDir, versionDir, { recursive: true, dereference: true });
  rewriteVersions(versionDir, version, packages);
  if (!versions.versionSelfCheck({ versionDir, version, packages })) {
    throw new Error(`版本目录自检没过（包或客户端产物不全）：${versionDir}`);
  }
  log(`版本 ${version}：内容取自 ${newest} 的安装树（版本号改写），${join(versionDir, 'node_modules')}`);
  return { versions, paths, profileDir, versionDir, newestDir, newest };
}
