import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OPENCLI_PIN } from '@dsh-workbench/shared/host';
import { isOpencliReady, opencliReadiness } from '../index.js';

function seedCopy(root: string, version: string, main: boolean): void {
  const dir = join(root, 'opencli', 'toolchain', 'node_modules', '@jackwener', 'opencli');
  mkdirSync(join(dir, 'dist', 'src'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: '@jackwener/opencli', version })}\n`, 'utf8');
  if (main) writeFileSync(join(dir, 'dist', 'src', 'main.js'), '', 'utf8');
}

const roots: string[] = [];

function homeOf(): string {
  const root = mkdtempSync(join(tmpdir(), 'opencli-ready-'));
  roots.push(root);
  vi.stubEnv('DSH_WORKBENCH_HOME', root);
  return root;
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('opencliReadiness', () => {
  it('副本不在 → 未就绪', () => {
    homeOf();
    const verdict = opencliReadiness();
    expect(verdict.ready).toBe(false);
    expect(verdict.detail).toContain('不在');
  });

  it('只有 package.json、没有 dist/src/main.js → 未就绪', () => {
    const root = homeOf();
    seedCopy(root, OPENCLI_PIN, false);
    const verdict = opencliReadiness();
    expect(verdict.ready).toBe(false);
    expect(verdict.detail).toContain('dist/src/main.js');
  });

  it('版本不是 pin → 未就绪，并说清差在哪', () => {
    const root = homeOf();
    seedCopy(root, '0.0.1', true);
    const verdict = opencliReadiness();
    expect(verdict.ready).toBe(false);
    expect(verdict.detail).toContain('0.0.1');
    expect(verdict.detail).toContain(OPENCLI_PIN);
  });

  it('清单、入口、版本都对 → 就绪', () => {
    const root = homeOf();
    seedCopy(root, OPENCLI_PIN, true);
    expect(isOpencliReady()).toBe(true);
    expect(opencliReadiness().detail).toBe(OPENCLI_PIN);
  });
});
