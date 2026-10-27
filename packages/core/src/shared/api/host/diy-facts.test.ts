import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { moduleBuildFacts } from './diy-facts';

const roots: string[] = [];
function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-diy-facts-'));
  roots.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of roots.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function moduleDir(manifest: unknown): string {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest));
  return dir;
}

function write(file: string, at: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '');
  const when = new Date(at);
  fs.utimesSync(file, when, when);
}

const EXPORTS_MANIFEST = {
  exports: { '.': './dist/host.js', './client': './client.js' },
  dsh: {
    workbench: { unit: 'demo' },
    workbenchFaces: { host: 'src/host.ts', client: 'src/client.tsx' },
  },
};

describe('moduleBuildFacts', () => {
  it('产物取 exports（源码入口那一格不算产物）', () => {
    const dir = moduleDir(EXPORTS_MANIFEST);
    write(path.join(dir, 'dist', 'host.js'), '2026-01-01T10:00:00Z');
    write(path.join(dir, 'client.js'), '2026-01-01T10:00:00Z');
    write(path.join(dir, 'src', 'host.ts'), '2026-01-01T09:00:00Z');

    const facts = moduleBuildFacts(dir);
    expect(facts.artifacts.map((one) => one.path)).toEqual(['./dist/host.js', './client.js']);
    expect(facts.builtAll).toBe(true);
    expect(facts.stale).toBe(false);
  });

  it('少一个产物：builtAll=false，并且那一条的 at 是 null', () => {
    const dir = moduleDir(EXPORTS_MANIFEST);
    write(path.join(dir, 'dist', 'host.js'), '2026-01-01T10:00:00Z');

    const facts = moduleBuildFacts(dir);
    expect(facts.builtAll).toBe(false);
    expect(facts.artifacts.find((one) => one.path === './client.js')?.at).toBeNull();
  });

  it('源码比产物新：stale=true（这就是"改完没 build"）', () => {
    const dir = moduleDir(EXPORTS_MANIFEST);
    write(path.join(dir, 'dist', 'host.js'), '2026-01-01T10:00:00Z');
    write(path.join(dir, 'client.js'), '2026-01-01T10:00:00Z');
    write(path.join(dir, 'src', 'nested', 'host.ts'), '2026-01-01T12:00:00Z');

    expect(moduleBuildFacts(dir).stale).toBe(true);
  });

  it('没有 exports 就报不出产物（源码入口不是产物）', () => {
    const dir = moduleDir({
      dsh: {
        workbench: { unit: 'demo' },
        workbenchFaces: { host: 'src/host.ts', client: 'src/client.tsx' },
      },
    });
    write(path.join(dir, 'src', 'host.ts'), '2026-01-01T10:00:00Z');

    const facts = moduleBuildFacts(dir);
    expect(facts.artifacts).toEqual([]);
    expect(facts.builtAll).toBe(false);
  });

  it('读不动 package.json：空产物、不抛', () => {
    const dir = tempDir();
    const facts = moduleBuildFacts(dir);
    expect(facts.artifacts).toEqual([]);
    expect(facts.builtAll).toBe(false);
    expect(facts.stale).toBe(false);
  });
});
