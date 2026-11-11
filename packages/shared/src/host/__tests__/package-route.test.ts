import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { DshShell } from '../../api/dsh.js';
import { createSeam } from '../seam/run.js';
import { withPackageDir } from '../package-content.js';
import { createPackageRouter } from '../package-route.js';

const FILES = {
  'package.json': '{"name":"opencli-plugin-hello","version":"1.0.0"}',
  'opencli-plugin.json': '{"name":"hello","version":"1.0.0"}',
  'hello.js': 'x',
};

function shellThat(options: { readonly files?: Readonly<Record<string, string>>; readonly packFails?: boolean } = {}): {
  shell: DshShell;
  destinations: string[];
} {
  const destinations: string[] = [];
  const shell = {
    resolve: (request: unknown) => request,
    execute: async (spec: unknown) => {
      const command = String((spec as { command?: string }).command ?? '');
      const packTo = /--pack-destination '([^']+)'/.exec(command)?.[1];
      const unpackTo = /-C '([^']+)'/.exec(command)?.[1];
      let exitCode = 0;
      let stdout = '';
      if (packTo !== undefined) {
        destinations.push(packTo);
        if (options.packFails === true) {
          exitCode = 1;
        } else {
          fs.writeFileSync(path.join(packTo, 'opencli-plugin-hello-1.0.0.tgz'), 'tgz');
          stdout = '[{"filename":"opencli-plugin-hello-1.0.0.tgz"}]';
        }
      } else if (unpackTo !== undefined) {
        for (const [name, body] of Object.entries(options.files ?? FILES)) {
          const target = path.join(unpackTo, 'package', name);
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.writeFileSync(target, body, 'utf8');
        }
      } else {
        exitCode = 1;
      }
      return {
        result: async () => ({
          exitCode,
          timedOut: false,
          aborted: false,
          stdout: { text: exitCode === 0 ? stdout : '', truncated: false },
          stderr: { text: '', truncated: false },
        }),
      };
    },
  } as unknown as DshShell;
  return { shell, destinations };
}

const made: string[] = [];

function makeRoot(): { root: string; scratchRoot: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-package-route-'));
  made.push(root);
  return { root, scratchRoot: path.join(root, 'tmp') };
}

function seamUnder(root: string, shell: DshShell) {
  return createSeam({ shell, runtimeRoot: path.join(root, 'workbench') });
}

afterEach(() => {
  for (const root of made.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('把要判的那个包弄到本地看一眼（临时目录落点）', () => {
  it('★ 给了 scratchRoot 就在它下面解包，解完只收自己那一层', async () => {
    const { root, scratchRoot } = makeRoot();
    const { shell, destinations } = shellThat();

    const seen = await withPackageDir(
      { seam: seamUnder(root, shell), spec: 'opencli-plugin-hello', registry: 'https://registry.npmjs.org/', scratchRoot },
      (dir) => dir,
    );

    expect(destinations).toHaveLength(1);
    expect(destinations[0]?.startsWith(`${scratchRoot}${path.sep}`)).toBe(true);
    expect(seen?.startsWith(`${scratchRoot}${path.sep}`)).toBe(true);
    expect(fs.existsSync(scratchRoot)).toBe(true);
    expect(fs.existsSync(destinations[0] ?? '')).toBe(false);
  });

  it('scratchRoot 不存在就先建出来，不用调用方先准备', async () => {
    const { root } = makeRoot();
    const scratchRoot = path.join(root, 'deep', 'tmp');
    const { shell, destinations } = shellThat();

    await withPackageDir({ seam: seamUnder(root, shell), spec: 'opencli-plugin-hello', scratchRoot }, (dir) => dir);

    expect(fs.existsSync(scratchRoot)).toBe(true);
    expect(destinations[0]?.startsWith(`${scratchRoot}${path.sep}`)).toBe(true);
  });

  it('解出来的那份能给调用方看全', async () => {
    const { root, scratchRoot } = makeRoot();
    const { shell } = shellThat();

    const seen = await withPackageDir(
      { seam: seamUnder(root, shell), spec: 'opencli-plugin-hello', scratchRoot },
      (dir) => fs.readdirSync(dir).sort(),
    );

    expect(seen).toEqual(['hello.js', 'opencli-plugin.json', 'package.json']);
  });
});

describe('源上的裸包名怎么判', () => {
  it('★ 解包落在 router 给的 scratchRoot 下，裸包名判成运行时插件并带出插件名', async () => {
    const { root, scratchRoot } = makeRoot();
    const { shell, destinations } = shellThat();
    const router = createPackageRouter({
      manifestFile: 'opencli-plugin.json',
      scratchRoot,
      dshLookup: async () => ({ readable: false, raw: undefined }),
    });

    const route = await router.packageRouteOf({
      spec: 'opencli-plugin-hello',
      seam: seamUnder(root, shell),
      registry: 'https://registry.npmjs.org/',
    });

    expect(route).toEqual({ kind: 'runtime-plugin', pkg: 'opencli-plugin-hello', pluginName: 'hello' });
    expect(destinations).toHaveLength(1);
    expect(destinations[0]?.startsWith(`${scratchRoot}${path.sep}`)).toBe(true);
    expect(fs.existsSync(destinations[0] ?? '')).toBe(false);
  });

  it('★ scratchRoot 每次调用现算，且认的是这个 seam 自己的 runtimeRoot（不看环境变量）', async () => {
    const { root } = makeRoot();
    const scratchRoot = path.join(root, 'workbench', 'tmp');
    const { shell, destinations } = shellThat();
    const asked: string[] = [];
    const router = createPackageRouter({
      manifestFile: 'opencli-plugin.json',
      scratchRoot: (seam) => {
        asked.push(String(seam.runtimeRoot));
        return seam.runtimeRoot === undefined ? undefined : path.join(seam.runtimeRoot, 'tmp');
      },
      dshLookup: async () => ({ readable: false, raw: undefined }),
    });

    const route = await router.packageRouteOf({
      spec: 'opencli-plugin-hello',
      seam: seamUnder(root, shell),
      registry: 'https://registry.npmjs.org/',
    });

    expect(route).toEqual({ kind: 'runtime-plugin', pkg: 'opencli-plugin-hello', pluginName: 'hello' });
    expect(asked).toEqual([path.join(root, 'workbench')]);
    expect(destinations[0]?.startsWith(`${scratchRoot}${path.sep}`)).toBe(true);
  });

  it('取不到包内容 → 判不出来（undefined），不当成 neither 甩给调用方', async () => {
    const { root, scratchRoot } = makeRoot();
    const { shell } = shellThat({ packFails: true });
    const router = createPackageRouter({
      manifestFile: 'opencli-plugin.json',
      scratchRoot,
      dshLookup: async () => ({ readable: false, raw: undefined }),
    });

    await expect(
      router.packageRouteOf({ spec: 'opencli-plugin-hello', seam: seamUnder(root, shell), registry: 'https://registry.npmjs.org/' }),
    ).resolves.toBeUndefined();
  });

  it('没有 seam 或 registry → 不去猜，直接判不出来', async () => {
    const { scratchRoot } = makeRoot();
    const router = createPackageRouter({ manifestFile: 'opencli-plugin.json', scratchRoot });

    await expect(router.packageRouteOf({ spec: 'opencli-plugin-hello' })).resolves.toBeUndefined();
  });
});
