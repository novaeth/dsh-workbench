import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { shippedAdapterSetSpec } from '@/shared/api/host/shipped-adapter-set';

const roots: string[] = [];

function packageAt(manifest: unknown): string {
  const root = mkdtempSync(join(tmpdir(), 'wb-adapter-set-'));
  roots.push(root);
  mkdirSync(join(root, 'src', 'app'), { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify(manifest), 'utf8');
  return pathToFileURL(join(root, 'src', 'app', 'host.ts')).href;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('shippedAdapterSetSpec', () => {
  it('★ 读 package.json 的 workbench.adapterSet（外壳装哪份适配器集合只写一处）', () => {
    expect(shippedAdapterSetSpec(packageAt({ workbench: { adapterSet: ' @dsh-workbench/adapters-default ' } }))).toBe(
      '@dsh-workbench/adapters-default',
    );
  });

  it('没写或写空时直接报错（不留一个静默的默认值）', () => {
    expect(() => shippedAdapterSetSpec(packageAt({ workbench: {} }))).toThrow('workbench.adapterSet');
    expect(() => shippedAdapterSetSpec(packageAt({ workbench: { adapterSet: '  ' } }))).toThrow('workbench.adapterSet');
  });
});
