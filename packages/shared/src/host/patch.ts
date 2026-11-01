import { writeTextFile } from './fs-write.js';
import { patchBlocks, type PatchBlock } from './patch-blocks.js';

export { patchBlocks, type PatchBlock };

/** 把 patch 文本写回原文件：原子写，保留已有权限位（新文件 0644）。 */
export function writePatchFile(path: string, text: string): void {
  writeTextFile(path, text, { mode: 'keep' });
}
