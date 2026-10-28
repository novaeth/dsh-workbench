import { describe, expect, it } from 'vitest';
import type { InstallFailure } from '@dsh-workbench/shared';
import { installError } from './market-install-error';

function failure(over: Partial<InstallFailure> = {}): InstallFailure {
  return {
    kind: 'permission',
    command: 'npm i --prefix /x/libs opencli-workflow@1.1.24 --cache /x/npm-cache',
    exitCode: 255,
    output: 'npm error code EACCES\nnpm error path /x/libs',
    path: '/x',
    mode: '755',
    owner: { uid: 0, gid: 0 },
    current: { uid: 502, gid: 20 },
    fix: { kind: 'chown', path: '/x', uid: 502, gid: 20 },
    ...over,
  };
}

describe('installError（失败往上抛时带什么）', () => {
  it('人话 + 退出码 + 原文尾巴，结构化现场原样带上', () => {
    const error = installError(failure());

    expect(error.message).toContain('没有写入权限');
    expect(error.message).toContain('退出码 255');
    expect(error.message).toContain('EACCES');
    expect(error.detail).toContain('npm error path');
    expect(error.failure).toMatchObject({ kind: 'permission', path: '/x' });
  });

  it('装之前就拦下的（没有退出码）→ 不印一个假退出码', () => {
    const error = installError(failure({ exitCode: null, output: '' }));

    expect(error.message).not.toContain('退出码');
    expect(error.message).toBe('没有写入权限');
  });

  it('盘满说有盘满，不说没权限', () => {
    const error = installError(failure({ kind: 'disk-full', fix: { kind: 'space', path: '/x' } }));

    expect(error.message).toContain('磁盘满了');
  });
});
