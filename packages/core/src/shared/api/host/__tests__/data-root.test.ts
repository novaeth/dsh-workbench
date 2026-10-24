import { afterEach, describe, expect, it, vi } from 'vitest';
import { dshHome, workbenchRoot, workspacesRoot } from '@dsh-workbench/shared/host';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('数据根', () => {
  it('$DSH_HOME 决定一切；workbench / workspaces 依次挂下去', () => {
    vi.stubEnv('DSH_HOME', '/tmp/some-dsh-home');
    expect(dshHome()).toBe('/tmp/some-dsh-home');
    expect(workbenchRoot()).toBe('/tmp/some-dsh-home/workbench');
    expect(workspacesRoot()).toBe('/tmp/some-dsh-home/workbench/workspaces');
  });

  it('没设 / 设成空白 → 退回 $HOME/.dsh（与 dsh 和 wrapper 的 `${DSH_HOME:-…}` 一致）', () => {
    vi.stubEnv('DSH_HOME', '   ');
    vi.stubEnv('HOME', '/tmp/some-home');
    expect(dshHome()).toBe('/tmp/some-home/.dsh');
    expect(workbenchRoot()).toBe('/tmp/some-home/.dsh/workbench');
  });

  it('DSH_WORKBENCH_HOME 优先于默认的 workbench 数据根（新 profile 各用各的）', () => {
    vi.stubEnv('DSH_HOME', '/tmp/some-dsh-home');
    vi.stubEnv('DSH_WORKBENCH_HOME', '/tmp/some-dsh-home/workbench-2');
    expect(workbenchRoot()).toBe('/tmp/some-dsh-home/workbench-2');
    expect(workspacesRoot()).toBe('/tmp/some-dsh-home/workbench-2/workspaces');
  });
});
