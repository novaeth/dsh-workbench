import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isolatedOpencliPathOf, opencliCommandOf } from '../command.js';

const roots: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-opencli-'));
  roots.push(dir);
  return dir;
}

const ctx = { get: () => undefined } as never;

function workbenchOf(home: string): string {
  vi.stubEnv('DSH_WORKBENCH_HOME', path.join(home, 'workbench'));
  return path.join(home, 'workbench');
}

function stableOf(workbench: string): string {
  return path.join(workbench, 'opencli', 'bin', process.platform === 'win32' ? 'opencli.cmd' : 'opencli');
}

function installed(workbench: string): string {
  const stable = stableOf(workbench);
  fs.mkdirSync(path.dirname(stable), { recursive: true });
  fs.writeFileSync(stable, '');
  return stable;
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of roots.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('opencliCommandOf', () => {
  it('隔离运行时在：给稳定路径（不依赖 PATH），源记 isolated', () => {
    const workbench = workbenchOf(tempDir());
    const stable = installed(workbench);
    expect(opencliCommandOf(ctx)).toEqual({
      command: stable,
      source: 'isolated',
      isolated: stable,
    });
  });

  it('隔离运行时不在：退 PATH 上的 opencli，但把"该在哪"照实报出来', () => {
    const workbench = workbenchOf(tempDir());
    expect(opencliCommandOf(ctx)).toEqual({
      command: 'opencli',
      source: 'path',
      isolated: stableOf(workbench),
    });
  });

  it('环境变量在：它赢（启动器给的显式覆盖，也管改名后的 profile）', () => {
    const workbench = workbenchOf(tempDir());
    const stable = installed(workbench);
    vi.stubEnv('DSH_WORKBENCH_OPENCLI', '/opt/custom/opencli');
    expect(opencliCommandOf(ctx)).toEqual({
      command: '/opt/custom/opencli',
      source: 'env',
      isolated: stable,
    });
  });

  it('环境变量是空串：等于没设（不能把空命令交给执行缝）', () => {
    workbenchOf(tempDir());
    vi.stubEnv('DSH_WORKBENCH_OPENCLI', '');
    expect(opencliCommandOf(ctx).source).toBe('path');
  });

  it('环境变量没设、隔离运行时也没装：**不会**拿 PATH 上那个冒充隔离份', () => {
    workbenchOf(tempDir());
    const resolution = opencliCommandOf(ctx);
    expect(resolution.command).toBe('opencli');
    expect(resolution.source).not.toBe('isolated');
  });
});

describe('isolatedOpencliPathOf', () => {
  it('候选路径由运行时根推出（跟着 DSH_WORKBENCH_HOME 走，不再依赖 dshHomePath 服务）', () => {
    const workbench = workbenchOf(tempDir());
    expect(isolatedOpencliPathOf(ctx)).toBe(stableOf(workbench));
  });
});
