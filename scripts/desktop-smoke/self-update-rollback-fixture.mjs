import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { distModule, distTag, plantCopiedVersion } from './self-update-version-tree.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const CORE = '@dsh-workbench/core';

function out(line) {
  process.stdout.write(`${line}\n`);
}

function profileWithWorkbench(home) {
  const root = join(home, 'profiles');
  if (!existsSync(root)) return undefined;
  for (const name of readdirSync(root)) {
    if (existsSync(join(root, name, 'node_modules', CORE, 'package.json'))) return name;
  }
  return undefined;
}

function currentVersionOf(profileDir) {
  try {
    return String(JSON.parse(readFileSync(join(profileDir, 'node_modules', CORE, 'package.json'), 'utf8')).version ?? '');
  } catch {
    return '';
  }
}

async function main() {
  const home = process.argv[2] ?? join(homedir(), '.dsh');
  if (home === join(homedir(), '.dsh') && !(process.env.CI === 'true' || process.env.DSH_SMOKE_ALLOW_REAL_HOME === '1')) {
    throw new Error('这一版是给 CI 用的：要往真实 ~/.dsh 里铺，得显式带上 DSH_SMOKE_ALLOW_REAL_HOME=1');
  }
  const profile = process.argv[3]?.trim() || profileWithWorkbench(home);
  if (profile === undefined) throw new Error(`没有哪个 profile 里装着工作台：${join(home, 'profiles')}`);
  const version = process.argv[4]?.trim() || '0.0.0-previous';
  process.env.DSH_HOME = home;
  if ((process.env.DSH_WORKBENCH_HOME ?? '').trim() === '') {
    process.env.DSH_WORKBENCH_HOME = join(home, 'workbench');
  }
  const profileDir = join(home, 'profiles', profile);
  const plan = await distModule(ROOT, 'adapter-probe', 'dist', 'self-update-plan.js');
  const packages = plan.SELF_UPDATE_PACKAGES;
  const newest = distTag(profileDir, CORE, 'beta');

  let planted;
  try {
    planted = await plantCopiedVersion({
      root: ROOT,
      dshHome: home,
      profile,
      version,
      newest,
      packages,
      core: CORE,
      log: out,
    });
  } catch (error) {
    throw new Error(String(error?.message ?? error), { cause: error });
  }

  const current = currentVersionOf(profileDir);
  const marker = join(home, 'workbench', 'self-update.json');
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
  out(`profile=${profile}`);
  out(`已铺好上一版：${planted.versionDir}（内容取自 ${newest}；现在是 ${current}）`);
  out(`marker=${dirname(marker)}`);
}

await main();
