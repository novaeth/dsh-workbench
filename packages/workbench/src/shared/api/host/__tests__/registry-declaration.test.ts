import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DshShell } from '@dsh-workbench/shared';
import { declarationRefusalOf, pathDeclarationOf, registryDeclarationOf } from '../registry-declaration';

function fakeShell(stdout: string, exitCode = 0) {
  const calls: string[] = [];
  const shell = {
    resolve: (spec: unknown) => {
      calls.push(commandOf(spec));
      return spec;
    },
    execute: async () => ({
      result: async () => ({
        exitCode,
        timedOut: false,
        aborted: false,
        stdout: { text: stdout, truncated: false },
        stderr: { text: '', truncated: false },
      }),
    }),
  } as unknown as DshShell;
  return { shell, calls };
}

function commandOf(spec: unknown): string {
  return typeof spec === 'object' && spec !== null ? String((spec as { command?: unknown }).command ?? '') : '';
}

describe('registryDeclarationOf', () => {
  it('把 registry 上那份 dsh.workbench 读回来（装之前就能读到）', async () => {
    const { shell, calls } = fakeShell(
      JSON.stringify({ workbench: { apiVersion: 1, unit: 'demo', card: null, tools: [], host: { inject: [] } } }),
    );

    const raw = await registryDeclarationOf({ shell, name: '@t/module-a', registry: 'https://r.test/' });

    expect(raw).toEqual({ apiVersion: 1, unit: 'demo', card: null, tools: [], host: { inject: [] } });
    expect(calls[0]).toContain('npm view');
    expect(calls[0]).toContain('@t/module-a');
    expect(calls[0]).toContain('dsh');
  });

  it('★ 命令失败就**放行**（fail-open）：网络抖动不许变成"装不了"', async () => {
    const { shell } = fakeShell('npm ERR! network', 1);

    const raw = await registryDeclarationOf({ shell, name: '@t/module-b', registry: 'https://r.test/' });

    expect(raw).toBeUndefined();
    expect(declarationRefusalOf('@t/module-b', raw)).toEqual([]);
  });

  it('★ 输出不是 JSON 也放行（同上：拿不到就不拦）', async () => {
    const { shell } = fakeShell('<html>503</html>');

    expect(await registryDeclarationOf({ shell, name: '@t/module-c', registry: 'https://r.test/' })).toBeUndefined();
  });

  it('没有 dsh 字段 → 不拦（市场装的不一定都是工作台模块）', async () => {
    const { shell } = fakeShell('{}');

    const raw = await registryDeclarationOf({ shell, name: '@t/module-d', registry: 'https://r.test/' });

    expect(raw).toBeUndefined();
    expect(declarationRefusalOf('@t/module-d', raw)).toEqual([]);
  });

  it('★ 声明读不了 → 点名（这就是装机前该拦下来的那件事）', () => {
    const problems = declarationRefusalOf('@t/module-e', { unit: 'e' });

    expect(problems.join(' ')).toMatch(/apiVersion/);
  });

  it('缓存：同一个包问一次就够；force 才重问', async () => {
    const first = fakeShell(JSON.stringify({ workbench: { apiVersion: 1 } }));
    await registryDeclarationOf({ shell: first.shell, name: '@t/module-f', registry: 'https://r.test/' });
    await registryDeclarationOf({ shell: first.shell, name: '@t/module-f', registry: 'https://r.test/' });

    expect(first.calls).toHaveLength(1);

    const again = fakeShell(JSON.stringify({ workbench: { apiVersion: 1 } }));
    await registryDeclarationOf({ shell: again.shell, name: '@t/module-f', registry: 'https://r.test/', force: true });

    expect(again.calls).toHaveLength(1);
  });
});

describe('pathDeclarationOf', () => {
  function localDir(body: unknown): { dir: string; cleanup: () => void } {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-decl-'));
    if (body !== undefined) {
      fs.writeFileSync(
        path.join(dir, 'package.json'),
        typeof body === 'string' ? body : JSON.stringify(body),
        'utf8',
      );
    }
    return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
  }

  it('把本地目录那份 dsh.workbench 读回来（file: / link: 前缀与 spec 同形）', () => {
    const { dir, cleanup } = localDir({ name: '@t/local', dsh: { workbench: { apiVersion: 1, unit: 'local' } } });
    try {
      expect(pathDeclarationOf(dir)).toEqual({ apiVersion: 1, unit: 'local' });
      expect(pathDeclarationOf(`file:${dir}`)).toEqual({ apiVersion: 1, unit: 'local' });
      expect(pathDeclarationOf(`link:${dir}`)).toEqual({ apiVersion: 1, unit: 'local' });
    } finally {
      cleanup();
    }
  });

  it('没有 dsh / 没有 dsh.workbench → undefined（不拦普通 dsh 包的根据）', () => {
    const bare = localDir({ name: '@t/plain' });
    const noWorkbench = localDir({ name: '@t/bundle', dsh: { bundle: {} } });
    try {
      expect(pathDeclarationOf(bare.dir)).toBeUndefined();
      expect(pathDeclarationOf(noWorkbench.dir)).toBeUndefined();
    } finally {
      bare.cleanup();
      noWorkbench.cleanup();
    }
  });

  it('★ 读不动就放行：文件不在 / 不是 JSON / 不是对象（fail-open）', () => {
    const missing = localDir(undefined);
    const broken = localDir('{ not json');
    const scalar = localDir('"just a string"');
    try {
      expect(pathDeclarationOf(missing.dir)).toBeUndefined();
      expect(pathDeclarationOf(broken.dir)).toBeUndefined();
      expect(pathDeclarationOf(scalar.dir)).toBeUndefined();
    } finally {
      missing.cleanup();
      broken.cleanup();
      scalar.cleanup();
    }
  });

  it('★ 相对路径不查本地：不往进程 cwd 找（dsh 自己就拒相对路径，见 parseInstallSpec）', () => {
    const { dir, cleanup } = localDir({ name: '@t/rel', dsh: { workbench: { unit: 'rel' } } });
    try {
      expect(pathDeclarationOf(dir)).toEqual({ unit: 'rel' });
      expect(pathDeclarationOf(path.relative(process.cwd(), dir))).toBeUndefined();
    } finally {
      cleanup();
    }
  });
});
