import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DECLARED_TOOLS_FILE,
  declaredToolsApplies,
  declaredToolsPathOf,
  declaredToolsProblemOf,
  declaredToolsWithoutKey,
  renderDeclaredTools,
} from './declared-tools.mjs';

export async function sync({ root }) {
  const manifestPath = join(root, 'package.json');
  if (!existsSync(manifestPath)) throw new Error(`${manifestPath} 不在 —— sync 要在模块包目录里跑`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const raw = manifest.dsh?.workbench;
  const unit = typeof raw?.unit === 'string' ? raw.unit : manifest.name;
  if (raw === undefined) throw new Error(`${unit}: package.json 里没有 dsh.workbench —— 这不是模块包`);

  const tools = Array.isArray(raw.tools) ? raw.tools : [];
  if (tools.length === 0) {
    console.log(`${unit}: 清单里没有工具，不用生成物`);
    return;
  }

  const missing = declaredToolsWithoutKey(raw);
  if (missing.length > 0) {
    const hint = declaredToolsApplies(raw)
      ? '有 key 就走生成物那一档，那就每个工具都得有一个'
      : '给每个工具加一个 lowerCamelCase 的 key，代码里就不再写工具名的字面量';
    throw new Error(
      `${unit}: 清单里 ${missing.join(' / ')} 没有 key —— ${hint}。例如：\n` +
        `${tools.map((tool) => `  "key": "…",  // ${JSON.stringify(tool.name)}`).join('\n')}\n` +
        '（key 是代码里那个短名：`DECLARED_TOOLS.<key>.name`；生成物按清单生成它，代码里引用工具名就写它、不写字面量）',
    );
  }

  const at = declaredToolsPathOf(root);
  const had = existsSync(at);
  const stale = declaredToolsProblemOf(root, raw);
  writeFileSync(at, renderDeclaredTools(raw));
  console.log(
    `${unit}: 写了 ${DECLARED_TOOLS_FILE}（${tools.length} 个工具，按清单生成）` +
      (had && stale !== undefined ? ' —— 原来那份和清单对不上，已刷新' : ''),
  );
}
