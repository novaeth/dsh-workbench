import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execaSync } from 'execa';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const CORE = '@dsh-workbench/core';
const DEFAULT_FROM = '1.2.3-beta.4';

function out(line) {
  process.stdout.write(`${line}\n`);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function unquoted(value) {
  const quote = value.charAt(0);
  if (value.length >= 2 && (quote === '"' || quote === "'") && value.endsWith(quote)) {
    return value.slice(1, -1).trim();
  }
  return value;
}

function registryOf(profileDir) {
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

function targetBeta(profileDir) {
  const registry = registryOf(profileDir);
  if (registry === undefined) return '读不到（profile 的 .npmrc 里没有 registry）';
  try {
    const run = execaSync('npm', ['view', CORE, 'dist-tags.beta', '--registry', registry], { reject: false });
    const version = (run.stdout ?? '').trim();
    return run.exitCode === 0 && version !== '' ? version : '读不到';
  } catch {
    return '读不到';
  }
}

function distModule(...parts) {
  const file = join(ROOT, 'packages', ...parts);
  if (!existsSync(file)) fail(`dist 里没有 ${file} —— 先在仓根 build 一次再来跑`);
  return import(pathToFileURL(file).href);
}

function installCommandOf(step) {
  if (step === undefined) fail('selfUpdateStepsOf 里没有 install 这一步');
  return { file: step.file, args: [...step.args], env: { ...step.env }, cwd: step.cwd };
}

async function main() {
  const askedHome = process.argv[2]?.trim() ?? '';
  const dshHome = askedHome === '' ? join(homedir(), '.dsh') : askedHome;
  if (dshHome === join(homedir(), '.dsh') && !(process.env.CI === 'true' || process.env.DSH_SMOKE_ALLOW_REAL_HOME === '1')) {
    fail('这一版是给 CI 用的：要往真实 ~/.dsh 里铺，得显式带上 DSH_SMOKE_ALLOW_REAL_HOME=1');
  }
  const profile = process.argv[3]?.trim() ?? '';
  if (profile === '') fail('第二个参数要给 profile 名（桌面 smoke 里是 desktop）');
  const from = process.argv[4]?.trim() || DEFAULT_FROM;
  process.env.DSH_HOME = dshHome;
  if ((process.env.DSH_WORKBENCH_HOME ?? '').trim() === '') {
    process.env.DSH_WORKBENCH_HOME = join(dshHome, 'workbench');
  }
  const profileDir = join(dshHome, 'profiles', profile);
  if (!existsSync(join(profileDir, 'package.json'))) fail(`没有这个 profile：${profileDir}`);

  const versions = await distModule('adapter-probe', 'dist', 'version-dir.js');
  const steps = await distModule('adapter-probe', 'dist', 'self-update-steps.js');
  const plan = await distModule('adapter-probe', 'dist', 'self-update-plan.js');
  const bundles = await distModule('shared', 'dist', 'host', 'profile-bundles.js');
  const files = await distModule('shared', 'dist', 'host', 'fs-write.js');

  const paths = plan.selfUpdatePaths();
  const packages = plan.SELF_UPDATE_PACKAGES;
  const project = versions.versionProjectFiles({ profileDir, versionsDir: paths.versionsDir, version: from, packages });
  const versionDir = project.dir;

  if (versions.versionSelfCheck({ versionDir, version: from, packages })) {
    out(`版本目录已经装好，跳过安装：${versionDir}`);
  } else {
    const built = steps.selfUpdateStepsOf({ dshHome, profile, pkg: CORE, from, to: from, pinned: false }, paths);
    const command = installCommandOf(built.steps.find((step) => step.kind === 'install'));
    out(`真装 ${from} → ${versionDir}`);
    const result = await versions.installVersionDir({
      project,
      version: from,
      command: 'install',
      deps: {
        run: async (_command) => {
          try {
            const run = execaSync(command.file, command.args, {
              cwd: command.cwd,
              env: { ...process.env, ...command.env },
              reject: false,
              all: true,
            });
            return { ok: run.exitCode === 0, detail: run.all ?? `${run.stdout ?? ''}${run.stderr ?? ''}` };
          } catch (error) {
            return { ok: false, detail: String(error) };
          }
        },
        log: (message) => out(message),
      },
      packages,
    });
    if (!result.ok) {
      const tail = result.detail.trimEnd().split('\n').slice(-40).join('\n');
      fail(`装 ${from} 没成：\n${tail}`);
    }
    out(result.detail);
  }
  if (!versions.versionSelfCheck({ versionDir, version: from, packages })) {
    fail(`版本目录自检没过（包或客户端产物不全）：${versionDir}`);
  }

  const links = versions.versionLinksOf({ profileDir, versionDir, packages });
  versions.flipProfileLinks(links);
  versions.writeProfileLinks({ profileDir, links });
  const bundleCheck = bundles.ensureProfileBundle(profileDir, CORE);
  if (!bundleCheck.selected) {
    fail(`dsh.profile.bundles 里没法确认 ${CORE}（${bundleCheck.refusal ?? 'unknown'}）`);
  }

  const settingsFile = join(paths.dir, 'settings.json');
  let settings;
  try {
    settings = JSON.parse(readFileSync(settingsFile, 'utf8'));
  } catch {
    settings = {};
  }
  const kept = typeof settings === 'object' && settings !== null && !Array.isArray(settings) ? settings : {};
  files.writeJsonFile(settingsFile, { ...kept, includePrerelease: true });

  files.writeJsonFile(
    paths.marker,
    plan.selfUpdateMarker({ dshHome, profile, pkg: CORE, from, to: from, pinned: false }, 'ok', from, new Date().toISOString()),
  );

  out(`profile=${profile}`);
  out(`version=${from}`);
  out(`versionDir=${versionDir}`);
  out(`links=${String(links.length)}`);
  out(`settings=${settingsFile}`);
  out(`marker=${paths.marker}`);
  out(`目标 beta=${targetBeta(profileDir)}`);
}

await main();
