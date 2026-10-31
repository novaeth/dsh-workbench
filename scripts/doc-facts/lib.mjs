import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const BEGIN = /^<!-- doc-facts:begin ([a-z0-9-]+) -->$/;
const END = /^<!-- doc-facts:end ([a-z0-9-]+) -->$/;
const SEPARATOR = /^\|[-\s:|]+\|$/;

export function readText(file) {
  return readFileSync(join(ROOT, file), 'utf8');
}

export function writeText(file, text) {
  writeFileSync(join(ROOT, file), text);
}

export function parseBlocks(text) {
  const lines = text.split('\n');
  const blocks = [];
  const errors = [];
  let open;
  for (const [index, line] of lines.entries()) {
    const begin = line.match(BEGIN);
    const end = line.match(END);
    if (begin !== null) {
      if (open !== undefined) errors.push(`第 ${index + 1} 行：块 ${begin[1]} 之前有未闭合的 ${open.name}`);
      open = { name: begin[1], beginLine: index, endLine: undefined };
      continue;
    }
    if (end === null) continue;
    if (open === undefined) {
      errors.push(`第 ${index + 1} 行：end ${end[1]} 没有对应的 begin`);
      continue;
    }
    if (open.name !== end[1]) {
      errors.push(`第 ${index + 1} 行：end ${end[1]} 与 begin ${open.name} 不配对`);
      open = undefined;
      continue;
    }
    blocks.push({ name: open.name, beginLine: open.beginLine, endLine: index });
    open = undefined;
  }
  if (open !== undefined) errors.push(`块 ${open.name}（第 ${open.beginLine + 1} 行）没有 end`);
  return { blocks, errors };
}

export function blockBody(text, name) {
  const parsed = parseBlocks(text);
  if (parsed.errors.length > 0) throw new Error(parsed.errors.join('；'));
  const block = parsed.blocks.find((one) => one.name === name);
  if (block === undefined) return undefined;
  const lines = text.split('\n');
  return {
    line: block.beginLine + 2,
    body: lines.slice(block.beginLine + 1, block.endLine).join('\n'),
  };
}

export function replaceBlock(text, name, body) {
  const parsed = parseBlocks(text);
  if (parsed.errors.length > 0) throw new Error(parsed.errors.join('；'));
  const block = parsed.blocks.find((one) => one.name === name);
  if (block === undefined) throw new Error(`没有找到管理块 ${name}`);
  const lines = text.split('\n');
  return [
    ...lines.slice(0, block.beginLine + 1),
    ...body.split('\n'),
    ...lines.slice(block.endLine),
  ].join('\n');
}

export function normalizeBody(text) {
  return text
    .split('\n')
    .map((line) => {
      const flat = line.replace(/\s+/g, ' ').trim();
      return SEPARATOR.test(flat) ? flat.replace(/-{2,}/g, '---') : flat;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '');
}

export function lineOfIndex(text, index) {
  return text.slice(0, index).split('\n').length;
}

export function sectionOf(text, begin, end) {
  const start = text.indexOf(begin);
  if (start === -1) return undefined;
  const tail = end === undefined ? text.slice(start) : text.slice(start, text.indexOf(end, start) === -1 ? undefined : text.indexOf(end, start));
  return tail;
}

export function fencedAfter(text, heading) {
  const start = text.indexOf(heading);
  if (start === -1) return undefined;
  const rest = text.slice(start);
  const open = rest.indexOf('```');
  if (open === -1) return undefined;
  const bodyStart = rest.indexOf('\n', open);
  const close = rest.indexOf('\n```', bodyStart);
  if (bodyStart === -1 || close === -1) return undefined;
  return { text: rest.slice(bodyStart + 1, close), line: lineOfIndex(text, start + open) };
}

export function uniq(values) {
  return [...new Set(values)];
}
