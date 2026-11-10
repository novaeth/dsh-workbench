import { nowIso, removePath, workbenchHostLock, writeJsonFile } from '@dsh-workbench/shared/host';

export function holdHostLock(onProblem: (message: string) => void): () => void {
  const lock = workbenchHostLock();
  try {
    writeJsonFile(lock, { pid: process.pid, at: nowIso() }, { mkdir: true });
  } catch (error: unknown) {
    onProblem(`宿主锁没写上（自更新会少一道闸）：${String(error)}`);
  }
  return () => {
    try {
      removePath(lock);
    } catch (error: unknown) {
      onProblem(`宿主锁没删掉（下次更新会当它还在跑）：${String(error)}`);
    }
  };
}
