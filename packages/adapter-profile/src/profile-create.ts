import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { execa } from 'execa';
import type { PostResource, RouteHandler } from '@dsh-workbench/shared/host';
import { quoteShellArg } from '@dsh-workbench/shared/host';
import type {
  ProfileCreateApplied,
  ProfileCreateProfile,
  ProfileCreateSnapshot,
} from '@dsh-workbench/shared/contract/protocol/profile-create';
import { PROFILE_CREATE_RESOURCE } from '@dsh-workbench/shared/contract/protocol/profile-create';

const PROFILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const BUNDLE = '@dsh-workbench/core';
const SETUP_TIMEOUT_MS = 10 * 60 * 1000;

export interface ProfileCreateDeps {
  readonly home: string;
  readonly self: string;
  readonly packageRoot: string;
  readonly runSetup?: ((env: Readonly<Record<string, string>>) => Promise<{ ok: boolean; log: string }>) | undefined;
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function profileNames(profilesDir: string): readonly string[] {
  try {
    return readdirSync(profilesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .map((entry) => entry.name)
      .filter((name) => existsSync(join(profilesDir, name, 'package.json')))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

export function profileCreateSnapshot(deps: ProfileCreateDeps): ProfileCreateSnapshot {
  const profiles: ProfileCreateProfile[] = profileNames(join(deps.home, 'profiles')).map((name) => ({
    name,
    current: name === deps.self,
    readable: true,
  }));
  return { current: deps.self, profiles };
}

export function profileCreateHandler(deps: ProfileCreateDeps): RouteHandler {
  return () => ({ ok: true, ...profileCreateSnapshot(deps) });
}

function inside(base: string, path: string): boolean {
  const root = resolve(base);
  const target = resolve(path);
  return target === root ? false : target.startsWith(`${root}${sep}`);
}

async function defaultRunSetup(
  packageRoot: string,
  env: Readonly<Record<string, string>>,
): Promise<{ ok: boolean; log: string }> {
  const bin = join(packageRoot, 'bin', 'dsh-workbench');
  let log = '';
  const collect = (chunk: Buffer): void => {
    log = `${log}${chunk.toString('utf8')}`.slice(-20_000);
  };
  try {
    const child = execa('bash', [bin, 'setup'], {
      cwd: packageRoot,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: SETUP_TIMEOUT_MS,
      reject: false,
      windowsHide: true,
    });
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);
    const result = await child;
    if (result.timedOut) return { ok: false, log: `${log}\n创建超时` };
    return { ok: result.exitCode === 0, log };
  } catch (error) {
    return { ok: false, log: `${log}\n${error instanceof Error ? error.message : String(error)}` };
  }
}

export async function profileCreateApply(
  deps: ProfileCreateDeps,
  payload: unknown,
): Promise<ProfileCreateApplied | { ok: false; text: string }> {
  const body = typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
  const profile = textOf(body['profile']).trim();
  const source = textOf(body['source']).trim();
  const copy = typeof body['copy'] === 'object' && body['copy'] !== null ? (body['copy'] as Record<string, unknown>) : {};
  const flags = {
    settings: copy['settings'] === true,
    plugins: copy['plugins'] === true,
    projects: copy['projects'] === true,
    sessions: copy['sessions'] === true,
  };
  if (!PROFILE_NAME.test(profile)) return { ok: false, text: '新工作台的名字不合法：只用字母、数字、点、下划线或短横线' };
  if (source === '') return { ok: false, text: '先选一个来源 profile' };
  if (source === profile) return { ok: false, text: '来源不能是新工作台自己' };
  const profilesDir = join(deps.home, 'profiles');
  if (!profileNames(profilesDir).includes(source)) return { ok: false, text: `没有这个 profile：${source}` };
  if (existsSync(join(profilesDir, profile))) return { ok: false, text: `已经有一个叫 ${profile} 的 profile` };
  const targetHome = join(deps.home, profile);
  if (existsSync(targetHome)) return { ok: false, text: `数据目录已经存在：${targetHome}` };
  const sourceCandidate = join(deps.home, source);
  const sourcePatch = (() => {
    try {
      return readFileSync(join(profilesDir, source, 'cordis.patch.yml'), 'utf8');
    } catch {
      return '';
    }
  })();
  const sourceHasIsolation = /id:\s*session-persistence-jsonl/.test(sourcePatch);
  const sourceHome = !sourceHasIsolation
    ? deps.home
    : sourcePatch.includes('DSH_WORKBENCH_HOME') && source !== 'workbench'
      ? sourceCandidate
      : join(deps.home, 'workbench');
  const env = {
    DSH_HOME: deps.home,
    DSH_WORKBENCH_HOME: targetHome,
    WORKBENCH_PROFILE: profile,
    WORKBENCH_SOURCE_PROFILE: source,
    WB_CLONE: '1',
    WB_SOURCE_HOME: sourceHome,
    WB_COPY_SETTINGS: flags.settings ? '1' : '0',
    WB_COPY_PLUGINS: flags.plugins ? '1' : '0',
    WB_COPY_PROJECTS: flags.projects ? '1' : '0',
    WB_COPY_SESSIONS: flags.sessions ? '1' : '0',
  };
  const setup = deps.runSetup ?? ((next) => defaultRunSetup(deps.packageRoot, next));
  const cleanup = (): void => {
    try {
      if (inside(profilesDir, join(profilesDir, profile))) rmSync(join(profilesDir, profile), { recursive: true, force: true });
      if (inside(deps.home, targetHome)) rmSync(targetHome, { recursive: true, force: true });
    } catch {
      return;
    }
  };
  const result = await setup(env);
  if (!result.ok) {
    cleanup();
    return { ok: false, text: `创建失败：${result.log.trim().slice(-1200) || 'setup 没给出原因'}` };
  }
  try {
    const manifest = JSON.parse(readFileSync(join(profilesDir, profile, 'package.json'), 'utf8')) as {
      dsh?: { profile?: { bundles?: unknown } };
    };
    const bundles = manifest.dsh?.profile?.bundles;
    if (!Array.isArray(bundles) || !bundles.includes(BUNDLE)) {
      cleanup();
      return { ok: false, text: 'profile 建好了，但工作台 bundle 没被选中；先跑一次 setup 修好它' };
    }
  } catch (error) {
    cleanup();
    return { ok: false, text: `profile 建好了，但读不了清单：${error instanceof Error ? error.message : String(error)}` };
  }
  const copied = Object.entries(flags)
    .filter(([, on]) => on)
    .map(([name]) => name);
  const bin = join(deps.packageRoot, 'bin', 'dsh-workbench');
  return {
    ok: true,
    profile,
    source,
    home: targetHome,
    command: `WORKBENCH_PROFILE=${quoteShellArg(profile)} ${quoteShellArg(bin)}`,
    copied,
  };
}

export function profileCreateAction(deps: ProfileCreateDeps): PostResource {
  return {
    resource: PROFILE_CREATE_RESOURCE,
    handle: (payload: unknown) => profileCreateApply(deps, payload),
  };
}
