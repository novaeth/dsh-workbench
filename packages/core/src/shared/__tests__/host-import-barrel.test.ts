import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';


const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENTRY = join(srcRoot, 'app', 'host.ts');
const CLIENT_BARREL = '@dsh-workbench/shared';

function resolveRelative(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(srcRoot, spec.slice(2)) : join(dirname(from), spec);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')];
  for (const candidate of candidates) {
    try {
      readFileSync(candidate, 'utf8');
      return candidate;
    } catch {
    }
  }
  return null;
}

function hostGraph(): string[] {
  const seen = new Set<string>();
  const queue = [ENTRY];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/from\s+'([^']+)'/g)) {
      const spec = match[1] as string;
      if (!spec.startsWith('.') && !spec.startsWith('@/')) continue;
      const next = resolveRelative(file, spec);
      if (next !== null) queue.push(next);
    }
  }
  return [...seen];
}

function clientBarrelRefs(text: string): string[] {
  const bad: string[] = [];
  for (const match of text.matchAll(/import\s+(type\s+)?([^'"]*?)from\s+'([^']+)'/g)) {
    const isTypeOnly = match[1] !== undefined;
    const clause = (match[2] ?? '').trim();
    const spec = match[3] as string;
    if (spec !== CLIENT_BARREL) continue;
    if (isTypeOnly) continue;
    const bindings = clause
      .replace(/[{}]/g, '')
      .split(',')
      .map((one) => one.trim())
      .filter((one) => one !== '');
    if (bindings.length > 0 && bindings.every((one) => one.startsWith('type '))) continue;
    bad.push(`import ${clause} from '${spec}'`);
  }
  return bad;
}

describe('宿主那一半：只许从 host barrel 引运行时', () => {
  it('★★ 从宿主入口可达的每个文件，都不许引客户端 barrel 的运行时', () => {
    const files = hostGraph();
    const offenders: string[] = [];
    for (const file of files) {
      for (const ref of clientBarrelRefs(readFileSync(file, 'utf8'))) {
        offenders.push(`${relative(srcRoot, file)}: ${ref}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('★ 这条判据自己在干活：可达图不是空的、盖得到关键宿主文件，也知道什么算违规', () => {
    expect(hostGraph().length).toBeGreaterThan(10);
    expect(hostGraph()).toContain(join(srcRoot, 'modules', 'panels', 'model', 'diy-page.ts'));
    expect(clientBarrelRefs(`import { boardFactOf } from '${CLIENT_BARREL}';`)).toHaveLength(1);
    expect(clientBarrelRefs(`import type { DebugState } from '${CLIENT_BARREL}';`)).toHaveLength(0);
    expect(clientBarrelRefs(`import { type A, type B } from '${CLIENT_BARREL}';`)).toHaveLength(0);
    expect(clientBarrelRefs(`import { boardFactOf } from '${CLIENT_BARREL}/host';`)).toHaveLength(0);
  });
});
