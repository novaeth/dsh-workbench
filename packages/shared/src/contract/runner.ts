/**
 * 一条运行时命令的执行器：同一形状的 `execFile('<runtime>', args)`，结果只留 stdout。
 */
export type LibRunner = (
  args: readonly string[],
) => Promise<{ readonly stdout: string }>;
