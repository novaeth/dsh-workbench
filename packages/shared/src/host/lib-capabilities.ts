/**
 * 跨平台库的「能力 → 首选实现」表：外壳 arch 的 S68 与 DIY 模块的 `source` 判据共用这一份，
 * 避免两边各写一张表后漂开。
 *
 * 能力名是「做什么」，`preferred` 是「用什么」；两者不是同一个层级（类似 datetime → dayjs）。
 * 手写轮子的指纹只认最常见的直连写法；`importsPreferred()` 负责判断这个文件是否已经在用首选库。
 */
export interface LibCapability {
  readonly capability: string;
  readonly preferred: string;
  readonly pattern: RegExp;
  readonly why: string;
}

/** 手写轮子的硬指纹；按能力名稳定排序，方便两边报告与测试对照。 */
export const LIB_CAPABILITIES: readonly LibCapability[] = [
  {
    capability: 'process-spawn',
    preferred: 'execa',
    pattern: /from\s+['"]node:child_process['"]/,
    why: '自己起进程要用 execa；同步/跨平台差异交给它',
  },
  {
    capability: 'cli-locate',
    preferred: 'which',
    pattern: /\bprocess\.env\.(?:PATH|PATHEXT)\b/,
    why: '自己扫 PATH/PATHEXT 要用 which（它处理 PATHEXT 与 Path 大小写）',
  },
  {
    capability: 'file-lock',
    preferred: 'proper-lockfile',
    pattern: /\bprocess\.kill\([^)]*,\s*0\)|flag:\s*['"]wx['"]/,
    why: '自己抢文件锁要用 proper-lockfile（stale / 重试 / 跨平台）',
  },
  {
    capability: 'atomic-state',
    preferred: 'write-file-atomic',
    pattern: /writeFileSync\([^)]*\.(?:sync\.json|self-update\.json)/,
    why: '自己直写状态文件要用 write-file-atomic（防写一半）',
  },
];

/**
 * 这个文件是否已经 import 了某个首选库（静态或动态 import 都算）。
 * @param source 文件全文。
 * @param preferred 首选库包名。
 * @returns 有 import 就 `true`。
 */
export function importsPreferred(source: string, preferred: string): boolean {
  const escaped = preferred.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:from\\s*|import\\s*\\(\\s*)['"]${escaped}['"]`).test(source);
}
