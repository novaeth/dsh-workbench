import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import type { PostResource, RouteHandler } from './http.js';
import { quoteShellArg } from './shell-text.js';
import type {
  ProfileCreateApplied,
  ProfileCreateProfile,
  ProfileCreateSnapshot,
} from '../contract/protocol/profile-create.js';
import { PROFILE_CREATE_RESOURCE } from '../contract/protocol/profile-create.js';

const PROFILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const BUNDLE = '@dsh-workbench/core';

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
  };
  if (!PROFILE_NAME.test(profile)) return { ok: false, text: '新工作台的名字不合法：只用字母、数字、点、下划线或短横线' };
  if (source === '') return { ok: false, text: '先选一个来源 profile' };
  if (source === profile) return { ok: false, text: '来源不能是新工作台自己' };
  const profilesDir = join(deps.home, 'profiles');
  if (!profileNames(profilesDir).includes(source)) return { ok: false, text: `没有这个 profile：${source}` };
  if (existsSync(join(profilesDir, profile))) return { ok: false, text: `已经有一个叫 ${profile} 的 profile` };
  const targetHome = join(deps.home, profile);
  if (existsSync(targetHome)) return { ok: false, text: `运行时目录已经存在：${targetHome}` };
  const env = {
    DSH_HOME: deps.home,
    DSH_WORKBENCH_HOME: targetHome,
    WORKBENCH_PROFILE: profile,
    WORKBENCH_SOURCE_PROFILE: source,
    WB_CLONE: '1',
    WB_COPY_SETTINGS: flags.settings ? '1' : '0',
  };
  const setup = deps.runSetup;
  if (setup === undefined) {
    return { ok: false, text: '这台机器上没有装工作台的脚本入口，建不了新的工作台。' };
  }
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
