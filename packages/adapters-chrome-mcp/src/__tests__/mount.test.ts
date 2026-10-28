import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { adapterContractGaps, loadAdapterSet } from '@dsh-workbench/shared/host';
import { CHROME_MCP_ADAPTER_SET_ID } from '../index.js';

const roots: string[] = [];
const packageRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function profileWithSet(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wb-mcp-profile-'));
  roots.push(dir);
  const scope = join(dir, 'node_modules', '@dsh-workbench');
  mkdirSync(scope, { recursive: true });
  symlinkSync(packageRoot, join(scope, 'adapters-chrome-mcp'), 'dir');
  return dir;
}

describe('只改配置一行就能挂上这份集合', () => {
  it('按包名从 profile 装载，装出来的 id 就是它自己', async () => {
    const loaded = await loadAdapterSet(
      { get: (key: string) => (key === 'profileContext' ? { dir: profileWithSet() } : undefined) } as never,
      CHROME_MCP_ADAPTER_SET_ID,
    );
    expect(loaded.ok, loaded.ok ? '' : `${loaded.failure}: ${loaded.detail}`).toBe(true);
    if (loaded.ok) expect(loaded.set.id).toBe(CHROME_MCP_ADAPTER_SET_ID);
  });

  it('装载出来的集合直接过契约（不需要外壳为它改一行）', async () => {
    const ctx = { get: (key: string) => (key === 'profileContext' ? { dir: profileWithSet() } : undefined) } as never;
    const loaded = await loadAdapterSet(ctx, CHROME_MCP_ADAPTER_SET_ID);
    if (!loaded.ok) throw new Error(`${loaded.failure}: ${loaded.detail}`);
    expect(adapterContractGaps(loaded.set, ctx)).toEqual([]);
  });
});
