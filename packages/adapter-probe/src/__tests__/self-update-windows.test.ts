import dayjs from 'dayjs';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  planSelfUpdate,
  selfUpdateNodeScript,
  selfUpdatePaths,
  type SelfUpdateCli,
  type SelfUpdateRequest,
} from '../index.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const home = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'wb-self-update-win-'));
  roots.push(root);
  return root;
};

const request = (over: Partial<SelfUpdateRequest> = {}): SelfUpdateRequest => ({
  dshHome: '/tmp/dsh-home',
  profile: 'workbench',
  pkg: '@dsh-workbench/core',
  from: '0.2.6',
  to: '0.2.7',
  pinned: true,
  ...over,
});

describe('Windows 自更新（Node，不依赖 bash）', () => {
  it('★ win32 脚本落点是 .mjs，plan 用当前 node 起它', () => {
    const paths = selfUpdatePaths('/tmp/dsh-home', 'win32');
    expect(paths.script).toBe(join('/tmp/dsh-home', 'workbench', 'self-update.mjs'));

    const plan = planSelfUpdate(
      request({ dshHome: '/tmp/dsh-home' }),
      dayjs('2026-10-23T00:00:00.000Z').toDate(),
      undefined,
      'win32',
    );
    expect(plan.paths.script.endsWith('.mjs')).toBe(true);
    expect(plan.command.file).toBe(process.execPath);
    expect(plan.command.args).toEqual([plan.paths.script]);
    expect(plan.command.env.ELECTRON_RUN_AS_NODE === '1' || process.versions.electron === undefined).toBe(true);
  });

  it('★ 生成的 Node 脚本语法可执行，且不再出现 bash', () => {
    const root = home();
    const requestValue = request({ dshHome: root });
    const paths = selfUpdatePaths(root, 'win32');
    const script = selfUpdateNodeScript(requestValue, paths);
    const file = join(root, 'self-update.mjs');
    writeFileSync(file, script, 'utf8');

    const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    expect(check.status, check.stderr).toBe(0);
    expect(script).not.toContain('#!/usr/bin/env bash');
    expect(script).toContain('spawnSync');
  });

  it('★ 找不到 CLI 时先写 failed，不硬装', () => {
    const root = home();
    const paths = selfUpdatePaths(root, 'win32');
    mkdirSync(paths.dir, { recursive: true });
    const cli: SelfUpdateCli = { file: join(root, 'missing-cli'), args: [], env: {} };
    writeFileSync(
      join(root, 'self-update.mjs'),
      selfUpdateNodeScript(request({ dshHome: root }), paths, cli),
      'utf8',
    );

    const run = spawnSync(process.execPath, [join(root, 'self-update.mjs')], {
      encoding: 'utf8',
      env: { ...process.env, DSH_HOME: root },
    });
    expect(run.status).toBe(1);
    expect(JSON.parse(readFileSync(paths.marker, 'utf8')).state).toBe('failed');
    expect(readFileSync(paths.log, 'utf8')).toContain('找不到 Desktop 的 dsh');
  });

  it('★ Node 自更新真跑：换到新版、marker=ok，没有 remove', () => {
    const root = home();
    const profile = 'workbench';
    const pkg = '@dsh-workbench/core';
    const installed = join(root, 'profiles', profile, 'node_modules', '@dsh-workbench', 'core', 'package.json');
    mkdirSync(dirname(installed), { recursive: true });
    writeFileSync(installed, JSON.stringify({ version: '0.2.6' }), 'utf8');

    const fakeCli = join(root, 'fake-cli.mjs');
    writeFileSync(
      fakeCli,
      [
        "import { mkdirSync, writeFileSync } from 'node:fs';",
        "import { dirname, join } from 'node:path';",
        'const args = process.argv.slice(2);',
        "const profile = args[args.indexOf('--profile') + 1];",
        'const spec = args[args.length - 1];',
        "const version = spec.split('@').pop();",
        "const file = join(process.env.DSH_HOME, 'profiles', profile, 'node_modules', '@dsh-workbench', 'core', 'package.json');",
        'mkdirSync(dirname(file), { recursive: true });',
        'writeFileSync(file, JSON.stringify({ version }));',
        '',
      ].join('\n'),
      'utf8',
    );

    const cli: SelfUpdateCli = { file: process.execPath, args: [fakeCli], env: {} };
    const requestValue = request({ dshHome: root, profile, pkg });
    const paths = selfUpdatePaths(root, 'win32');
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(join(root, 'self-update.mjs'), selfUpdateNodeScript(requestValue, paths, cli), 'utf8');

    const run = spawnSync(process.execPath, [join(root, 'self-update.mjs')], {
      encoding: 'utf8',
      env: { ...process.env, DSH_HOME: root },
    });
    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(readFileSync(installed, 'utf8')).version).toBe('0.2.7');
    expect(JSON.parse(readFileSync(paths.marker, 'utf8')).state).toBe('ok');
    expect(readFileSync(paths.log, 'utf8')).not.toMatch(/remove/);
  });
});
