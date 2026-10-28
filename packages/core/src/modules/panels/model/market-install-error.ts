import type { InstallFailure } from '@dsh-workbench/shared';
import { WorkbenchDataError, tailLines } from '@dsh-workbench/shared/host';

const INSTALL_PROBLEM = {
  permission: '没有写入权限',
  'disk-full': '磁盘满了',
  sandbox: '被系统拦住了',
  unknown: '命令失败',
} as const;

export function installError(failure: InstallFailure): WorkbenchDataError {
  const tail = tailLines(failure.output, 6);
  const stamp = failure.exitCode === null ? '' : `（退出码 ${failure.exitCode}）`;
  return new WorkbenchDataError(
    'install-failed',
    `${INSTALL_PROBLEM[failure.kind]}${stamp}${tail === '' ? '' : `：${tail}`}`,
    { detail: failure.output, failure },
  );
}
