import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const DECLARED_TOOLS_FILE = 'src/declared-tools.ts';

export function declaredToolsPathOf(dir) {
  return join(dir, DECLARED_TOOLS_FILE);
}

function toolsOf(raw) {
  return Array.isArray(raw?.tools) ? raw.tools : [];
}

function keyOf(tool) {
  return typeof tool?.key === 'string' && tool.key.trim() !== '' ? tool.key.trim() : '';
}

export function declaredToolsApplies(raw) {
  return toolsOf(raw).some((tool) => keyOf(tool) !== '');
}

export function declaredToolsWithoutKey(raw) {
  return toolsOf(raw)
    .filter((tool) => keyOf(tool) === '')
    .map((tool) => JSON.stringify(tool?.name));
}

export function renderDeclaredTools(raw) {
  const rows = toolsOf(raw).map(
    (tool) =>
      `  ${keyOf(tool)}: { name: '${tool.name}', writes: ${tool.writes === true} },`,
  );
  return [
    'export const DECLARED_TOOLS = {',
    ...rows,
    '} as const;',
    '',
    'export type DeclaredToolKey = keyof typeof DECLARED_TOOLS;',
    '',
  ].join('\n');
}

export function declaredToolsProblemOf(dir, raw) {
  if (!declaredToolsApplies(raw)) return undefined;
  const missing = declaredToolsWithoutKey(raw);
  if (missing.length > 0) {
    return `清单里 ${missing.join(' / ')} 没有 key —— 有 key 就走生成物那一档，那就每个工具都得有一个`;
  }
  const at = declaredToolsPathOf(dir);
  if (!existsSync(at)) {
    return `${DECLARED_TOOLS_FILE} 不在 —— 清单里给了 key 就该有生成物，跑 \`dsh-wb-module sync\` 生成`;
  }
  const strip = (text) => text.replace(/\s+/g, '').replace(/"/g, "'");
  if (strip(readFileSync(at, 'utf8')) !== strip(renderDeclaredTools(raw))) {
    return (
      `${DECLARED_TOOLS_FILE} 与清单对不上（生成物过期，或有人手改了它）—— ` +
      '跑 `dsh-wb-module sync` 刷新。别手改：它是生成的'
    );
  }
  return undefined;
}
