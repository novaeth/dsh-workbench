import { existsSync, mkdirSync, mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureLibsOpencliPeer } from './runtime-links.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('ensureLibsOpencliPeer', () => {
  it('★ 运行时那份 opencli 在 → 链到 libs，libs 里的命令才 import 得到它', () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-peer-'));
    vi.stubEnv('DSH_WORKBENCH_HOME', root);
    mkdirSync(join(root, 'opencli/toolchain/node_modules/@jackwener/opencli'), { recursive: true });

    expect(ensureLibsOpencliPeer()).toBe(true);
    const link = join(root, 'opencli/libs/node_modules/@jackwener/opencli');
    expect(existsSync(link)).toBe(true);
    expect(realpathSync(link)).toContain('toolchain/node_modules/@jackwener/opencli');
    expect(ensureLibsOpencliPeer()).toBe(false);
  });

  it('运行时还没装 opencli → 不建空链接（等它装好再说）', () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-peer-'));
    vi.stubEnv('DSH_WORKBENCH_HOME', root);

    expect(ensureLibsOpencliPeer()).toBe(false);
    expect(existsSync(join(root, 'opencli/libs/node_modules/@jackwener/opencli'))).toBe(false);
  });
});
