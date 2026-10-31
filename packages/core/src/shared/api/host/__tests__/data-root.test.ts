import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dshHome, workbenchRoot, workspacesRoot } from '@dsh-workbench/shared/host';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('数据根', () => {
  it('$DSH_HOME 决定一切；workbench / workspaces 依次挂下去', () => {
    const home = '/tmp/some-dsh-home';
    vi.stubEnv('DSH_HOME', home);
    expect(dshHome()).toBe(home);
    expect(workbenchRoot()).toBe(join(home, 'workbench'));
    expect(workspacesRoot()).toBe(join(home, 'workbench', 'workspaces'));
  });

  it('没设 / 设成空白 → 退回 用户主目录/.dsh（与 dsh 和 wrapper 的 `${DSH_HOME:-…}` 一致）', () => {
    const home = '/tmp/some-home';
    vi.stubEnv('DSH_HOME', '   ');
    vi.stubEnv('HOME', home);
    vi.stubEnv('USERPROFILE', home);
    expect(dshHome()).toBe(join(home, '.dsh'));
    expect(workbenchRoot()).toBe(join(home, '.dsh', 'workbench'));
  });

  it('DSH_WORKBENCH_HOME 优先于默认的 workbench 数据根（新 profile 各用各的）', () => {
    const home = '/tmp/some-dsh-home';
    const other = join(home, 'workbench-2');
    vi.stubEnv('DSH_HOME', home);
    vi.stubEnv('DSH_WORKBENCH_HOME', other);
    expect(workbenchRoot()).toBe(other);
    expect(workspacesRoot()).toBe(join(other, 'workspaces'));
  });
});
