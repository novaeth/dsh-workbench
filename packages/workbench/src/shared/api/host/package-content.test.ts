import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { DshShell } from '@dsh-workbench/shared';
import { withPackageDir } from './package-content';

function fakeShell(options: { readonly view?: string; readonly files?: Readonly<Record<string, string>>; readonly packFails?: boolean }): {
  shell: DshShell;
  commands: string[];
  touched: () => string[];
} {
  const commands: string[] = [];
  const touched = new Set<string>();
  const shell = {
    resolve: (request: { readonly command: string }) => {
      commands.push(request.command);
      return request;
    },
    execute: async (spec: { readonly command?: string }) => {
      const command = String(spec?.command ?? '');
      let exitCode = 0;
      let stdout = options.view ?? '';
      const packTo = /--pack-destination '([^']+)'/.exec(command)?.[1];
      const unpackTo = /-C '([^']+)'/.exec(command)?.[1];
      if (packTo !== undefined) {
        touched.add(packTo);
        if (options.packFails === true) {
          exitCode = 1;
        } else {
          fs.writeFileSync(path.join(packTo, 'demo-1.0.0.tgz'), 'tgz');
          stdout = '[{"filename":"demo-1.0.0.tgz"}]';
        }
      } else if (unpackTo !== undefined) {
        touched.add(unpackTo);
        for (const [name, body] of Object.entries(options.files ?? {})) {
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
  return { shell, commands, touched: () => [...touched] };
}

function expectAllGone(touched: readonly string[]): void {
  expect(touched.length).toBeGreaterThan(0);
  for (const dir of touched) expect(fs.existsSync(dir), dir).toBe(false);
}

let local = '';

afterEach(() => {
  if (local !== '') fs.rmSync(local, { recursive: true, force: true });
  local = '';
});

describe('把要判的那个包弄到本地看一眼', () => {
  it('本地绝对路径 → 就是那个目录（不多下、也不删）', async () => {
    local = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-local-'));
    fs.writeFileSync(path.join(local, 'package.json'), '{"name":"@t/local"}', 'utf8');
    const { shell, commands } = fakeShell({});

    const seen = await withPackageDir({ shell, spec: `file:${local}` }, (dir) => dir);

    expect(seen).toBe(local);
    expect(commands).toEqual([]);
    expect(fs.existsSync(local)).toBe(true);
  });

  it('源上的包 → 下下来解开，看的是解出来的那份，看完把临时目录收干净', async () => {
    const { shell, commands, touched } = fakeShell({
      files: { 'package.json': '{"name":"@t/demo"}', 'opencli-plugin.json': '{"name":"demo"}', 'list.js': 'x' },
    });

    const seen = await withPackageDir({ shell, spec: '@t/demo@1.0.0', registry: 'https://r.example/' }, (dir) => ({
      dir,
      names: fs.readdirSync(dir).sort(),
    }));

    expect(seen?.names).toEqual(['list.js', 'opencli-plugin.json', 'package.json']);
    expect(commands[0]).toContain("npm pack '@t/demo@1.0.0'");
    expect(commands[0]).toContain("--registry 'https://r.example/'");
    expect(commands[1]).toContain('tar -xzf');
    expect(fs.existsSync(seen?.dir ?? '')).toBe(false);
    expectAllGone(touched());
  });

  it('★ 看不完也把临时目录收干净（finally）：npm pack 失败 / 解出来的东西不对', async () => {
    const failing = fakeShell({ packFails: true });
    const empty = fakeShell({});

    expect(await withPackageDir({ shell: failing.shell, spec: '@t/demo' }, (dir) => dir)).toBeUndefined();
    expect(await withPackageDir({ shell: empty.shell, spec: '@t/demo' }, (dir) => dir)).toBeUndefined();
    expectAllGone([...failing.touched(), ...empty.touched()]);
  });

  it('★ 不发明下载预检：git / tarball 的 spec 不去拉（口径同 ADR-0038）', async () => {
    const { shell, commands } = fakeShell({});

    for (const spec of ['github:o/r', 'https://example.test/a.tgz', 'git@x:r.git']) {
      expect(await withPackageDir({ shell, spec }, (dir) => dir), spec).toBeUndefined();
    }
    expect(commands).toEqual([]);
  });

  it('没有执行缝 → 不去猜内容，直说判不了', async () => {
    expect(await withPackageDir({ spec: '@t/demo' }, (dir) => dir)).toBeUndefined();
  });
});
