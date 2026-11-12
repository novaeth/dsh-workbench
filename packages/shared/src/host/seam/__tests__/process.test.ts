import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, describe, expect, it } from 'vitest';
import { createNodeProcessHost } from '../process.js';

const SCRATCH = mkdtempSync(join(tmpdir(), 'dsh-wb-process-'));

afterAll(() => {
  rmSync(SCRATCH, { recursive: true, force: true });
});

describe('createNodeProcessHost', () => {
  it('★ win32：killTree 起 taskkill /pid <pid> /T /F；它失败时回退杀直接子进程', async () => {
    const spawned: Array<{ file: string; args: readonly string[] }> = [];
    const host = createNodeProcessHost({
      platform: 'win32',
      systemRoot: 'C:\\Windows',
      spawnTaskkill: (file, args, onFailure) => {
        spawned.push({ file, args });
        onFailure();
      },
    });
    const child = host.spawn({
      file: process.execPath,
      args: ['-e', 'setTimeout(() => {}, 20000)'],
      env: {},
      detached: false,
      killTree: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    const exited = new Promise<void>((resolve) => child.onExit(() => resolve()));
    child.killTree?.('SIGKILL');
    await exited;
    expect(spawned).toEqual([
      { file: 'C:\\Windows\\System32\\taskkill.exe', args: ['/pid', String(child.pid), '/T', '/F'] },
    ]);
  }, 20_000);

  it('★ win32：拿不到 Windows 目录就不起 taskkill，直接杀子进程收尾', async () => {
    const spawned: Array<{ file: string; args: readonly string[] }> = [];
    const host = createNodeProcessHost({
      platform: 'win32',
      systemRoot: '/usr',
      spawnTaskkill: (file, args) => spawned.push({ file, args }),
    });
    const child = host.spawn({
      file: process.execPath,
      args: ['-e', 'setTimeout(() => {}, 20000)'],
      env: {},
      detached: false,
      killTree: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    const exited = new Promise<void>((resolve) => child.onExit(() => resolve()));
    child.killTree?.('SIGKILL');
    await exited;
    expect(spawned).toEqual([]);
  }, 20_000);
});

describe.skipIf(process.platform === 'win32')('POSIX 进程组', () => {
  it('★ killTree 终止整组：直接子进程之外的孙进程也不写了', async () => {
    const beat = join(SCRATCH, 'process-host-beat.txt');
    writeFileSync(beat, '');
    const js = `const fs=require('fs');fs.appendFileSync(${JSON.stringify(beat)},'x');setInterval(()=>fs.appendFileSync(${JSON.stringify(beat)},'x'),60);setTimeout(()=>process.exit(0),20000);`;
    const host = createNodeProcessHost();
    const child = host.spawn({
      file: 'bash',
      args: ['-c', `${process.execPath} -e ${JSON.stringify(js)} ; exit 0`],
      env: {},
      detached: false,
      killTree: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    await delay(400);
    expect(statSync(beat).size).toBeGreaterThan(0);
    const exited = new Promise<void>((resolve) => child.onExit(() => resolve()));
    child.killTree?.('SIGKILL');
    await exited;
    await delay(2_000);
    const stopped = statSync(beat).size;
    await delay(500);
    expect(statSync(beat).size).toBe(stopped);
  }, 20_000);
});
