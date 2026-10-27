import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const DATASOURCE_FILE = 'src/datasource.ts';

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function readsOf(design) {
  const list = design?.reads;
  if (Array.isArray(list) && list.length > 0) return list;
  const one = design?.datasource;
  return one === undefined || one === null || typeof one !== 'object' ? [] : [one];
}

function writesOf(design) {
  const list = design?.writes;
  if (Array.isArray(list) && list.length > 0) return list;
  const one = design?.write;
  return one === undefined || one === null || typeof one !== 'object' ? [] : [one];
}

export function datasourceEntriesOf(design) {
  return [
    ...readsOf(design).map((read) => ({ key: text(read?.key), recipe: read?.recipe, calls: read?.calls })),
    ...writesOf(design).map((write) => ({ key: text(write?.key), recipe: write?.recipe })),
  ].filter((one) => one.key !== '' && one.recipe !== undefined && one.recipe !== null);
}

function stringLiteral(value) {
  return `'${value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')}'`;
}

function keyLiteral(key) {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? key : stringLiteral(key);
}

function tsLiteral(value, indent) {
  if (typeof value === 'string') return stringLiteral(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[${value.map((one) => tsLiteral(one, indent + 1)).join(', ')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value).filter(([, one]) => one !== undefined);
    if (entries.length === 0) return '{}';
    const pad = '  '.repeat(indent + 1);
    const close = '  '.repeat(indent);
    return `{\n${entries
      .map(([key, one]) => `${pad}${keyLiteral(key)}: ${tsLiteral(one, indent + 1)},`)
      .join('\n')}\n${close}}`;
  }
  return 'null';
}

export function renderDatasource(design) {
  const entries = datasourceEntriesOf(design);
  const lines = ['export const DATASOURCE = {'];
  for (const entry of entries) {
    lines.push(`  ${keyLiteral(entry.key)}: ${tsLiteral(entry.recipe, 1)},`);
  }
  lines.push('} as const;');
  const batched = entries.filter((entry) => entry.calls !== undefined && entry.calls !== null);
  if (batched.length > 0) {
    lines.push('', 'export const DATASOURCE_CALLS = {');
    for (const entry of batched) {
      lines.push(`  ${keyLiteral(entry.key)}: ${tsLiteral(entry.calls, 1)},`);
    }
    lines.push('} as const;');
  }
  lines.push('');
  return lines.join('\n');
}

export function datasourceProblemOf(dir, design) {
  const entries = datasourceEntriesOf(design);
  const at = join(dir, DATASOURCE_FILE);
  if (entries.length === 0) {
    if (!existsSync(at)) return undefined;
    return (
      `${DATASOURCE_FILE} 在，但 design.json 里没有 key + recipe 的读 / 写 —— ` +
      '补上配方（跑 `dsh-wb-module sync` 刷新），或者删掉这个生成物'
    );
  }
  if (!existsSync(at)) {
    return `${DATASOURCE_FILE} 不在 —— design.json 里有 key + recipe 的读 / 写，就该有生成物，跑 \`dsh-wb-module sync\``;
  }
  const strip = (source) => source.replace(/\s+/g, '').replace(/"/g, "'");
  if (strip(readFileSync(at, 'utf8')) !== strip(renderDatasource(design))) {
    return (
      `${DATASOURCE_FILE} 与 design.json 对不上（生成物过期，或有人手改了它）—— ` +
      '跑 `dsh-wb-module sync` 刷新。别手改：它是生成的'
    );
  }
  return undefined;
}
