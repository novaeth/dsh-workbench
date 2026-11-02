import { appendFileSync, chmodSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import writeFileAtomic from 'write-file-atomic';

export type WriteMode = number | 'keep';

export interface WriteFileOptions {
  readonly atomic?: boolean | undefined;
  readonly mkdir?: boolean | undefined;
  readonly fsync?: boolean | undefined;
  readonly mode?: WriteMode | undefined;
}

function modeOf(path: string, mode: WriteMode | undefined): number {
  if (typeof mode === 'number') return mode;
  try {
    return statSync(path).mode & 0o777;
  } catch {
    return 0o644;
  }
}

function prepareOf(path: string, options: WriteFileOptions): number {
  if (options.mkdir !== false) mkdirSync(dirname(path), { recursive: true });
  return modeOf(path, options.mode);
}

function atomicOptionsOf(mode: number, options: WriteFileOptions): { mode: number; fsync?: boolean } {
  return options.fsync === true ? { mode, fsync: true } : { mode };
}

/**
 * 把文本写进文件；默认原子写（temp + rename）、目录不存在就建、已有文件保留原权限。
 * @param path 目标文件；父目录按 `mkdir` 决定是否创建。
 * @param text 文本内容。
 * @param options 原子/目录/权限/fsync；`mode` 默认 `'keep'`（新文件 0644）。
 */
export function writeTextFile(path: string, text: string, options: WriteFileOptions = {}): void {
  const mode = prepareOf(path, options);
  if (options.atomic === false) {
    writeFileSync(path, text, { mode });
    return;
  }
  writeFileAtomic.sync(path, text, atomicOptionsOf(mode, options));
}

/**
 * 往文件末尾追加文本；文件或目录不存在就建。追加不是原子写，只给「日志/采集」这类只增不改的流。
 * @param path 目标文件。
 * @param text 追加内容。
 */
export function appendTextFile(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, text, { mode: modeOf(path, 'keep') });
}

/**
 * `writeTextFile` 的异步版；语义与默认值相同。
 * @param path 目标文件。
 * @param text 文本内容。
 * @param options 原子/目录/权限/fsync。
 * @returns 落盘完成。
 */
export async function writeTextFileAsync(path: string, text: string, options: WriteFileOptions = {}): Promise<void> {
  const mode = prepareOf(path, options);
  if (options.atomic === false) {
    writeFileSync(path, text, { mode });
    return;
  }
  await writeFileAtomic(path, text, atomicOptionsOf(mode, options));
}

/**
 * 把二进制写进文件；语义与默认值同 `writeTextFile`。
 * @param path 目标文件。
 * @param bytes 二进制内容。
 * @param options 原子/目录/权限/fsync。
 */
export function writeBytesFile(path: string, bytes: Uint8Array, options: WriteFileOptions = {}): void {
  const mode = prepareOf(path, options);
  if (options.atomic === false) {
    writeFileSync(path, bytes, { mode });
    return;
  }
  writeFileAtomic.sync(path, Buffer.from(bytes), atomicOptionsOf(mode, options));
}

/**
 * `writeBytesFile` 的异步版；语义与默认值相同。
 * @param path 目标文件。
 * @param bytes 二进制内容。
 * @param options 原子/目录/权限/fsync。
 * @returns 落盘完成。
 */
export async function writeBytesFileAsync(
  path: string,
  bytes: Uint8Array,
  options: WriteFileOptions = {},
): Promise<void> {
  const mode = prepareOf(path, options);
  if (options.atomic === false) {
    writeFileSync(path, bytes, { mode });
    return;
  }
  await writeFileAtomic(path, Buffer.from(bytes), atomicOptionsOf(mode, options));
}

/**
 * 把 JSON 写进文件：`JSON.stringify(value, null, 2)` 加末尾换行；语义与默认值同 `writeTextFile`。
 * @param path 目标文件。
 * @param value 可序列化的值。
 * @param options 原子/目录/权限/fsync。
 */
export function writeJsonFile(path: string, value: unknown, options: WriteFileOptions = {}): void {
  writeTextFile(path, `${JSON.stringify(value, null, 2)}\n`, options);
}

/**
 * `writeJsonFile` 的异步版；语义与默认值相同。
 * @param path 目标文件。
 * @param value 可序列化的值。
 * @param options 原子/目录/权限/fsync。
 * @returns 落盘完成。
 */
export async function writeJsonFileAsync(
  path: string,
  value: unknown,
  options: WriteFileOptions = {},
): Promise<void> {
  await writeTextFileAsync(path, `${JSON.stringify(value, null, 2)}\n`, options);
}

/**
 * 确保目录存在（`mkdir -p`）。
 * @param dir 目录路径。
 */
export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

/**
 * 把已存在的文件设成可执行（0755）。
 * @param path 文件路径。
 */
export function makeExecutable(path: string): void {
  chmodSync(path, 0o755);
}
