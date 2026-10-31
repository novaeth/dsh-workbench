import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { isolatedOpencliPathOf, opencliCommandOf } from '../command.js';

const roots: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-opencli-'));
  roots.push(dir);
  return dir;
}

function ctxOf(home: string | undefined): never {
  return {
    get: (key: string) =>
      key === 'dshHomePath' && home !== undefined ? (relative: string) => path.join(home, relative) : undefined,
  } as never;
}

function stableOf(home: string): string {
  return path.join(home, 'workbench', 'opencli', 'bin', process.platform === 'win32' ? 'opencli.cmd' : 'opencli');
}

function installed(home: string): string {
  const stable = stableOf(home);
  fs.mkdirSync(path.dirname(stable), { recursive: true });
  fs.writeFileSync(stable, '');
  return stable;
}

afterEach(() => {
  for (const dir of roots.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.DSH_WORKBENCH_OPENCLI;
});

describe('opencliCommandOf', () => {
  it('隔离运行时在：给稳定路径（不依赖 PATH），源记 isolated', () => {
    const home = tempDir();
    const stable = installed(home);
    expect(opencliCommandOf(ctxOf(home))).toEqual({
      command: stable,
      source: 'isolated',
      isolated: stable,
    });
  });

  it('隔离运行时不在：退 PATH 上的 opencli，但把"该在哪"照实报出来', () => {
    const home = tempDir();
    expect(opencliCommandOf(ctxOf(home))).toEqual({
      command: 'opencli',
      source: 'path',
      isolated: stableOf(home),
    });
  });

  it('没有 dshHomePath：退 PATH，且说不出候选路径', () => {
    expect(opencliCommandOf(ctxOf(undefined))).toEqual({
      command: 'opencli',
      source: 'path',
      isolated: null,
    });
  });

  it('环境变量在：它赢（启动器给的显式覆盖，也管改名后的 profile）', () => {
    const home = tempDir();
    const stable = installed(home);
    process.env.DSH_WORKBENCH_OPENCLI = '/opt/custom/opencli';
    expect(opencliCommandOf(ctxOf(home))).toEqual({
      command: '/opt/custom/opencli',
      source: 'env',
      isolated: stable,
    });
  });

  it('环境变量是空串：等于没设（不能把空命令交给执行缝）', () => {
    process.env.DSH_WORKBENCH_OPENCLI = '';
    expect(opencliCommandOf(ctxOf(tempDir())).source).toBe('path');
  });

  it('环境变量没设、隔离运行时也没装：**不会**拿 PATH 上那个冒充隔离份', () => {
    const resolution = opencliCommandOf(ctxOf(tempDir()));
    expect(resolution.command).toBe('opencli');
    expect(resolution.source).not.toBe('isolated');
  });
});

describe('isolatedOpencliPathOf', () => {
  it('给的是候选路径，存不存在都报（诊断要能区分"没配"和"没装"）', () => {
    const home = tempDir();
    expect(isolatedOpencliPathOf(ctxOf(home))).toBe(stableOf(home));
    expect(isolatedOpencliPathOf(ctxOf(undefined))).toBeNull();
  });
});
