import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const wrapper = fileURLToPath(new URL('../../bin/opencli-isolated.mjs', import.meta.url));
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('opencli 隔离包装器（Node，不依赖 bash）', () => {
  it('★ 跑 opencli 的 main，并把它关进隔离 HOME/cache', () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-opencli-wrap-'));
    roots.push(root);
    const main = join(
      root,
      'workbench',
      'opencli',
      'toolchain',
      'node_modules',
      '@jackwener',
      'opencli',
      'dist',
      'src',
      'main.js',
    );
    mkdirSync(dirname(main), { recursive: true });
    writeFileSync(
      main,
      "process.stdout.write(JSON.stringify({args:process.argv.slice(2),home:process.env.HOME,cache:process.env.npm_config_cache,defaultApp:process.defaultApp}));\n",
      'utf8',
    );

    const out = execFileSync(process.execPath, [wrapper, 'plugin', 'list'], {
      encoding: 'utf8',
      env: { ...process.env, DSH_HOME: root, HOME: join(root, 'real-home') },
    });

    const seen = JSON.parse(out) as { args: string[]; home: string; cache: string; defaultApp?: boolean };
    expect(seen.args).toEqual(['plugin', 'list']);
    expect(seen.home).toBe(join(root, 'workbench', 'opencli', 'home'));
    expect(seen.cache).toBe(join(root, 'workbench', 'opencli', 'npm-cache'));
  });

  it('★ 子进程带 defaultApp：Desktop 的 node shim 是 Electron-as-node，commander 否则把 main.js 当子命令', () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-opencli-wrap-'));
    roots.push(root);
    const main = join(
      root,
      'workbench',
      'opencli',
      'toolchain',
      'node_modules',
      '@jackwener',
      'opencli',
      'dist',
      'src',
      'main.js',
    );
    mkdirSync(dirname(main), { recursive: true });
    writeFileSync(main, 'process.stdout.write(String(process.defaultApp));\n', 'utf8');

    const out = execFileSync(process.execPath, [wrapper, 'doctor'], {
      encoding: 'utf8',
      env: { ...process.env, DSH_HOME: root, HOME: join(root, 'real-home') },
    });

    expect(out).toBe('true');
  });
});
