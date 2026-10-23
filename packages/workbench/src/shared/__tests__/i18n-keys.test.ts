import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { zh } from '@dsh-workbench/shared';

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      out.push(...sourceFiles(full));
      continue;
    }
    if (!/\.tsx?$/.test(entry.name)) continue;
    if (/\.test\.tsx?$/.test(entry.name)) continue;
    out.push(full);
  }
  return out;
}

const KEY_LIKE = /^[a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)*$/;

function keysUsedIn(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const keys: string[] = [];

  for (const match of text.matchAll(/\bt\(\s*/g)) {
    const start = match.index + match[0].length;
    let depth = 1;
    let index = start;
    while (index < text.length && depth > 0) {
      const char = text[index];
      if (char === '(') depth += 1;
      else if (char === ')') depth -= 1;
      index += 1;
    }
    const args = text.slice(start, Math.max(start, index - 1));

    for (const literal of args.matchAll(/'([^'\\]*)'|"([^"\\]*)"/g)) {
      const value = literal[1] ?? literal[2] ?? '';
      if (KEY_LIKE.test(value)) keys.push(value);
    }
  }
  return keys;
}

async function suiteContributedKeys(): Promise<string[]> {
  const modulesDir = join(srcRoot, 'modules');
  if (!existsSync(modulesDir)) return [];
  const keys: string[] = [];
  for (const entry of readdirSync(modulesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = join(modulesDir, entry.name, 'messages.ts');
    if (!existsSync(file)) continue;
    const module = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
    const messages = Object.values(module).find(
      (value): value is { zh: Record<string, string> } =>
        typeof value === 'object' && value !== null && 'zh' in value,
    );
    if (messages === undefined) continue;
    keys.push(...Object.keys(messages.zh));
  }
  return keys;
}

describe('文案键', () => {
  it('代码里用到的每个键都在字典里（漏键会显示成字面量）', async () => {
    const dictionary = new Set([...Object.keys(zh), ...(await suiteContributedKeys())]);
    const missing: string[] = [];

    for (const file of sourceFiles(srcRoot)) {
      for (const key of keysUsedIn(file)) {
        if (!dictionary.has(key)) missing.push(`${relative(srcRoot, file)} → ${key}`);
      }
    }

    expect([...new Set(missing)].sort()).toEqual([]);
  });

  it('扫到了足够多的文件（防止正则失效后"全绿"）', () => {
    const files = sourceFiles(srcRoot);
    expect(files.length).toBeGreaterThan(10);
    const withKeys = files.filter((file) => keysUsedIn(file).length > 0);
    expect(withKeys.length).toBeGreaterThan(3);
  });
});
