import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { unitTitleKey } from '../../contract/unit.js';
import { declarationOfPackage } from '../declaration.js';

const roots: string[] = [];

function packageAt(manifest: unknown, text?: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-declaration-'));
  roots.push(root);
  const at = path.join(root, 'package.json');
  fs.writeFileSync(at, text ?? JSON.stringify({ name: '@t/demo', dsh: { workbench: manifest } }), 'utf8');
  return at;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const DECLARED = {
  apiVersion: 3,
  unit: 'demo',
  title: { zh: '演示', en: 'Demo' },
  card: { order: 7 },
  tools: [{ name: 'workbench_demo_list', writes: false }],
  host: { inject: [] },
};

describe('模块作者写用例时读自己那份声明', () => {
  it('读出来的就是外壳会拿到的那份清单', () => {
    const manifest = declarationOfPackage('@t/demo', packageAt(DECLARED));

    expect(manifest.id).toBe('demo');
    expect(manifest.title).toEqual({ zh: '演示', en: 'Demo' });
    expect(manifest.titleKey).toBe(unitTitleKey('demo'));
    expect(manifest.card).toEqual({ order: 7 });
    expect(manifest.tools).toEqual([{ name: 'workbench_demo_list', writes: false }]);
  });

  it('★ 声明有毛病就当场抛，并把 problems 原样带出来（别让用例拿着半个清单继续跑）', () => {
    expect(() => declarationOfPackage('@t/demo', packageAt({ unit: 'demo' }))).toThrow(/apiVersion/);
    expect(() =>
      declarationOfPackage('@t/demo', packageAt({ ...DECLARED, faces: { host: 'src/host.ts' } })),
    ).toThrow(/faces/);
  });

  it('package.json 本身读不动时也说清是哪个文件（不是一句 JSON 语法错）', () => {
    expect(() => declarationOfPackage('@t/demo', packageAt({}, '{ 坏掉的'))).toThrow(/读不动/);
  });
});
