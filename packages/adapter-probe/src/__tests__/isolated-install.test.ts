import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isOpencliReadyAt } from '@dsh-workbench/adapter-runtime';
import { OPENCLI_PIN } from '@dsh-workbench/shared/host';
import { cleanupToolchainSiblings, installIsolatedRuntime, rollbackToolchain } from '../isolated-install.js';
import type { IsolatedInstallDeps } from '../isolated-install.js';

const PREFIX = 'install ';
const STORE_ERROR = 'ERR_PNPM_UNEXPECTED_STORE  Expected store-dir /old/store, got /new/store';
const FETCH_ERROR = 'ERR_PNPM_FETCH_404  GET https://registry.npmjs.org/@jackwener%2Fopencli';
const OK_RUN = { ok: true, detail: '+ @jackwener/opencli' };

const roots: string[] = [];

function liveDir(): string {
  const root = mkdtempSync(join(tmpdir(), 'staged-install-'));
  roots.push(root);
  return join(root, 'toolchain');
}

function writeTree(dir: string, main = true): void {
  const pkg = join(dir, 'node_modules', '@jackwener', 'opencli');
  mkdirSync(join(pkg, 'dist', 'src'), { recursive: true });
  writeFileSync(join(pkg, 'package.json'), `${JSON.stringify({ name: '@jackwener/opencli', version: OPENCLI_PIN })}\n`);
  if (main) writeFileSync(join(pkg, 'dist', 'src', 'main.js'), '');
}

function depsOf(input: {
  live: string;
  results: readonly { ok: boolean; detail: string }[];
  writes?: readonly boolean[];
  ready?: (dir: string) => boolean;
}): {
  deps: IsolatedInstallDeps;
  run: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
} {
  let index = 0;
  const run = vi.fn(async (command: string) => {
    const dir = command.slice(PREFIX.length);
    const result = input.results[Math.min(index, input.results.length - 1)] ?? OK_RUN;
    const writes = input.writes?.[index] ?? result.ok;
    index += 1;
    if (writes) writeTree(dir);
    return result;
  });
  const log = vi.fn();
  return {
    deps: {
      liveDir: input.live,
      command: (dir) => `${PREFIX}${dir}`,
      run,
      ready: input.ready ?? ((dir) => isOpencliReadyAt(dir)),
      describe: (dir) => dir,
      log,
    },
    run,
    log,
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('installIsolatedRuntime（暂存 → 自检 → 原子换入）', () => {
  it('★ 装进暂存目录，自检和标记都通过后才换入；旧树留一份 prev', async () => {
    const live = liveDir();
    mkdirSync(live, { recursive: true });
    writeFileSync(join(live, 'old.txt'), 'old');
    const { deps } = depsOf({ live, results: [OK_RUN] });

    const result = await installIsolatedRuntime(deps);

    expect(result.ok).toBe(true);
    expect(result.reinstalled).toBe(false);
    expect(isOpencliReadyAt(live)).toBe(true);
    expect(existsSync(join(live, 'old.txt'))).toBe(false);
    const marker = JSON.parse(readFileSync(join(live, '.ready.json'), 'utf8')) as { pin: string; at: string };
    expect(marker.pin).toBe(OPENCLI_PIN);
    expect(Number.isNaN(Date.parse(marker.at))).toBe(false);
    const previous = readdirSync(dirname(live)).filter((entry) => entry.startsWith('toolchain.prev-'));
    expect(previous).toHaveLength(1);
    expect(existsSync(join(dirname(live), previous[0] ?? '', 'old.txt'))).toBe(true);
  });

  it('★ 装失败 → 旧树原样不动，暂存目录清掉', async () => {
    const live = liveDir();
    mkdirSync(live, { recursive: true });
    writeFileSync(join(live, 'old.txt'), 'old');
    const { deps } = depsOf({ live, results: [{ ok: false, detail: FETCH_ERROR }] });

    const result = await installIsolatedRuntime(deps);

    expect(result.ok).toBe(false);
    expect(readFileSync(join(live, 'old.txt'), 'utf8')).toBe('old');
    expect(isOpencliReadyAt(live)).toBe(false);
  });

  it('★ store mismatch 只清暂存目录的 node_modules，旧树不动', async () => {
    const live = liveDir();
    mkdirSync(join(live, 'node_modules'), { recursive: true });
    writeFileSync(join(live, 'node_modules', 'live.txt'), 'live');
    const { deps } = depsOf({
      live,
      results: [{ ok: false, detail: STORE_ERROR }, OK_RUN],
    });

    const result = await installIsolatedRuntime(deps);

    expect(result.ok).toBe(true);
    expect(result.reinstalled).toBe(true);
    expect(result.detail).toContain('暂存目录的 node_modules');
    const previous = readdirSync(dirname(live)).filter((entry) => entry.startsWith('toolchain.prev-'));
    expect(existsSync(join(dirname(live), previous[0] ?? '', 'node_modules', 'live.txt'))).toBe(true);
    expect(isOpencliReadyAt(live)).toBe(true);
  });

  it('★ 第二遍仍读不到 → ok=false，旧树保留', async () => {
    const live = liveDir();
    mkdirSync(live, { recursive: true });
    writeFileSync(join(live, 'old.txt'), 'old');
    const { deps } = depsOf({
      live,
      results: [{ ok: false, detail: STORE_ERROR }, OK_RUN],
      writes: [false, true],
      ready: () => false,
    });

    const result = await installIsolatedRuntime(deps);

    expect(result.ok).toBe(false);
    expect(readFileSync(join(live, 'old.txt'), 'utf8')).toBe('old');
  });
});

describe('rollbackToolchain', () => {
  it('★ 把最新 prev 换回 live，坏树丢掉', () => {
    const live = liveDir();
    mkdirSync(live, { recursive: true });
    writeFileSync(join(live, 'broken.txt'), 'broken');
    mkdirSync(`${live}.prev-1`, { recursive: true });
    writeFileSync(`${live}.prev-1/old.txt`, 'old');

    expect(rollbackToolchain(live)).toBe(true);

    expect(existsSync(join(live, 'old.txt'))).toBe(true);
    expect(existsSync(join(live, 'broken.txt'))).toBe(false);
    expect(readdirSync(dirname(live)).filter((entry) => entry.startsWith('toolchain.broken-'))).toHaveLength(0);
  });

  it('没有 prev → false，不动 live', () => {
    const live = liveDir();
    mkdirSync(live, { recursive: true });
    writeFileSync(join(live, 'current.txt'), 'current');

    expect(rollbackToolchain(live)).toBe(false);
    expect(existsSync(join(live, 'current.txt'))).toBe(true);
  });
});

describe('cleanupToolchainSiblings', () => {
  it('清掉陈旧 staging 与旧 prev，只留最新一份 prev', () => {
    const live = liveDir();
    mkdirSync(live, { recursive: true });
    mkdirSync(`${live}.staging-a`, { recursive: true });
    mkdirSync(`${live}.prev-1`, { recursive: true });
    mkdirSync(`${live}.prev-2`, { recursive: true });

    cleanupToolchainSiblings(live);

    expect(existsSync(`${live}.staging-a`)).toBe(false);
    expect(existsSync(`${live}.prev-1`)).toBe(false);
    expect(existsSync(`${live}.prev-2`)).toBe(true);
  });
});
