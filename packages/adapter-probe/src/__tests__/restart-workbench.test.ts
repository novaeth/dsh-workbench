import { describe, expect, it } from 'vitest';
import { createSeam } from '@dsh-workbench/shared/host';
import { createFakeProcesses, createFakeShell } from '@dsh-workbench/shared/testing';
import { restartCommand, restartWorkbench } from '../restart-workbench.js';
import type { SelfUpdateProcess } from '../self-update-cli.js';

const POSIX_PROC: SelfUpdateProcess = {
  execPath: '/usr/bin/node',
  argv: ['/usr/bin/node', '/opt/dsh/bin/dsh-workbench'],
  versions: { node: '24.0.0' },
};

const DESKTOP_PROC: SelfUpdateProcess = {
  execPath: '/app/Electron',
  argv: ['/app/Electron', '/app/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/index.js'],
  versions: { electron: '44.7.0' },
};

function seamOf() {
  const processes = createFakeProcesses([{}]);
  const seam = createSeam({ shell: createFakeShell([{}]), processes: processes.host, allowHost: true });
  return { processes, seam };
}

describe('立即重启：先起新的，起成了才退出自己', () => {
  it('★ 同一份自己再起一份（argv 原样带上），然后才退出', () => {
    const { processes, seam } = seamOf();
    const order: string[] = [];
    const result = restartWorkbench({
      seam,
      proc: POSIX_PROC,
      busy: false,
      exit: () => order.push('exit'),
      onError: (message) => order.push(`err:${message}`),
    });

    expect(result.started).toBe(true);
    expect(processes.calls).toHaveLength(1);
    expect(processes.calls[0]).toMatchObject({
      file: '/usr/bin/node',
      args: ['/opt/dsh/bin/dsh-workbench'],
    });
    expect(order).toEqual(['exit']);
  });

  it('★ 没有执行缝：起不来就不退出自己（先关了自己 = 再也回不来）', () => {
    let exited = false;
    const errors: string[] = [];
    const result = restartWorkbench({
      proc: POSIX_PROC,
      busy: false,
      exit: () => {
        exited = true;
      },
      onError: (message) => errors.push(message),
    });

    expect(result.started).toBe(false);
    expect(result.refusal).toBe('no-seam');
    expect(exited).toBe(false);
    expect(errors.join('\n')).toContain('重启没跑起来');
  });

  it('★ 换版还在跑（marker running / queued）→ 拒绝：一个进程都不起，也不退出', () => {
    const { processes, seam } = seamOf();
    let exited = false;
    const result = restartWorkbench({
      seam,
      proc: POSIX_PROC,
      busy: true,
      exit: () => {
        exited = true;
      },
    });

    expect(result).toMatchObject({ started: false, refusal: 'update-running' });
    expect(processes.calls).toHaveLength(0);
    expect(exited).toBe(false);
  });

  it('★ Desktop 上不代用户杀进程：拒绝，并说清要他做什么', () => {
    const { processes, seam } = seamOf();
    const result = restartWorkbench({ seam, proc: DESKTOP_PROC, busy: false });

    expect(result).toMatchObject({ started: false, refusal: 'desktop-manual' });
    expect(processes.calls).toHaveLength(0);
  });

  it('拿不到入口（argv 里没有那个脚本）→ no-entry，不乱起', () => {
    const { processes, seam } = seamOf();
    const result = restartWorkbench({
      seam,
      proc: { execPath: '/usr/bin/node', argv: ['/usr/bin/node'], versions: { node: '24.0.0' } },
      busy: false,
    });

    expect(result).toMatchObject({ started: false, refusal: 'no-entry' });
    expect(processes.calls).toHaveLength(0);
  });

  it('那条命令：同一份 argv + 日志落在工作台目录里', () => {
    const command = restartCommand(POSIX_PROC);
    expect(command).toMatchObject({ file: '/usr/bin/node', args: ['/opt/dsh/bin/dsh-workbench'], env: {} });
    expect(command?.log.endsWith('restart.log')).toBe(true);
    expect(restartCommand({ execPath: '/usr/bin/node', argv: ['/usr/bin/node'], versions: {} })).toBeUndefined();
  });
});
