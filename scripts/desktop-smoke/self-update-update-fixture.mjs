import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { distModule, distTag, plantCopiedVersion } from './self-update-version-tree.mjs';

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

async function main() {
  const askedHome = process.argv[2]?.trim() ?? '';
  const dshHome = askedHome === '' ? join(homedir(), '.dsh') : askedHome;
  if (!isAbsolute(dshHome)) {
    fail(`第一个参数要给 DSH_HOME 的绝对路径（拿到的是 ${JSON.stringify(askedHome)}）—— 空参数会被当成相对路径`);
  }
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

  const plan = await distModule(ROOT, 'adapter-probe', 'dist', 'self-update-plan.js');
  const bundles = await distModule(ROOT, 'shared', 'dist', 'host', 'profile-bundles.js');
  const files = await distModule(ROOT, 'shared', 'dist', 'host', 'fs-write.js');
  const packages = plan.SELF_UPDATE_PACKAGES;
  const newest = distTag(profileDir, CORE, 'beta');

  let planted;
  try {
    planted = await plantCopiedVersion({
      root: ROOT,
      dshHome,
      profile,
      version: from,
      newest,
      packages,
      core: CORE,
      log: out,
    });
  } catch (error) {
    fail(String(error?.message ?? error));
  }
  const { versions, paths, versionDir } = planted;

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
  out(`目标=${newest}`);
}

await main();
