import { homedir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dshHome, workbenchRoot, workspacesRoot } from '../data-root.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('dshHome', () => {
  it('★ DSH_HOME 优先', () => {
    vi.stubEnv('DSH_HOME', '/tmp/explicit-home');

    expect(dshHome()).toBe('/tmp/explicit-home');
  });

  it('★ 没配 DSH_HOME 时交给系统的用户主目录，不自己拼 HOME', () => {
    vi.stubEnv('DSH_HOME', '');
    vi.stubEnv('HOME', '');

    expect(dshHome()).toBe(join(homedir(), '.dsh'));
    expect(dshHome()).not.toBe('/.dsh');
  });

  it('★ 无论 HOME 怎么写，数据根都跟着系统的用户主目录走', () => {
    vi.stubEnv('DSH_HOME', '');
    vi.stubEnv('HOME', '/tmp/posix-only-home');

    expect(dshHome()).toBe(join(homedir(), '.dsh'));
  });

  it('★ workbenchRoot 与 workspacesRoot 都挂在数据根下面', () => {
    vi.stubEnv('DSH_HOME', '/tmp/root');
    vi.stubEnv('DSH_WORKBENCH_HOME', '');

    expect(workbenchRoot()).toBe(join('/tmp/root', 'workbench'));
    expect(workspacesRoot()).toBe(join('/tmp/root', 'workbench', 'workspaces'));
  });

  it('DSH_WORKBENCH_HOME 能单独指定运行时根', () => {
    vi.stubEnv('DSH_HOME', '/tmp/root');
    vi.stubEnv('DSH_WORKBENCH_HOME', '/tmp/runtime');

    expect(workbenchRoot()).toBe('/tmp/runtime');
    expect(workspacesRoot()).toBe(join('/tmp/runtime', 'workspaces'));
  });
});
