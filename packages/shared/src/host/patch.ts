import { renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';

export interface PatchBlock {
  readonly key: string;
  readonly id: string;
  readonly insert: boolean;
  readonly body: string;
  readonly names: readonly string[];
}

interface SpannedBlock extends PatchBlock {
  readonly from: number;
  readonly to: number;
}

const ID_LINE = /^- id:[ \t]*"?([^"\s#]+)/;
const INSERT_LINE = /^- insert:[ \t]*$/;
const NESTED_ID = /^[ \t]+-[ \t]*id:[ \t]*"?([^"\s#]+)/;
const NAME_LINE = /^[ \t]*-?[ \t]*name:[ \t]*['"]?([^'"\s#]+)/;

function trimmedTail(lines: readonly string[]): readonly string[] {
  let end = lines.length;
  while (end > 0 && (lines[end - 1] ?? '').trim() === '') end -= 1;
  return lines.slice(0, end);
}

function matched(text: string, pattern: RegExp): string | undefined {
  const found = pattern.exec(text);
  return found === null ? undefined : found[1];
}

function blockOf(body: string, index: number): PatchBlock {
  const lines = body.split('\n');
  const first = lines[0] ?? '';
  const id = matched(first, ID_LINE);
  const nested = lines.flatMap((line) => {
    const one = matched(line, NESTED_ID);
    return one === undefined ? [] : [one];
  });
  const insert = id === undefined && INSERT_LINE.test(first);
  const label = id ?? nested.join(', ');
  const key = id !== undefined ? `id:${id}` : insert ? `insert:${nested.join(', ')}` : `block:${String(index)}`;
  const names = lines.flatMap((line) => {
    const one = matched(line, NAME_LINE);
    return one === undefined ? [] : [one];
  });
  return { key, id: label === '' ? key : label, insert, body, names };
}

function spannedBlocks(text: string): SpannedBlock[] {
  const lines = text.split('\n');
  const starts: number[] = [];
  lines.forEach((line, index) => {
    if (/^- /.test(line) || line === '-') starts.push(index);
  });
  const blocks: SpannedBlock[] = [];
  for (let i = 0; i < starts.length; i += 1) {
    const from = starts[i] ?? 0;
    const to = i + 1 < starts.length ? (starts[i + 1] ?? lines.length) : lines.length;
    const body = trimmedTail(lines.slice(from, to)).join('\n');
    if (body.trim() === '') continue;
    blocks.push({ ...blockOf(body, blocks.length), from, to });
  }
  return blocks;
}

export function patchBlocks(text: string): PatchBlock[] {
  return spannedBlocks(text).map(({ from: _from, to: _to, ...block }) => block);
}

function patchMode(path: string): number {
  try {
    return statSync(path).mode & 0o777;
  } catch {
    return 0o644;
  }
}

export function writePatchFile(path: string, text: string): void {
  const mode = patchMode(path);
  const tmp = `${path}.wb-sync-${String(process.pid)}`;
  writeFileSync(tmp, text, { mode });
  try {
    renameSync(tmp, path);
  } catch (error) {
    try {
      unlinkSync(tmp);
    } catch {
      throw error;
    }
    throw error;
  }
}
