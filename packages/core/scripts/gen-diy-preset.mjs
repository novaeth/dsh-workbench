import which from 'which';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKBENCH = join(HERE, '..');
const OUT = join(WORKBENCH, 'preset', 'diy.patch.yml');
const RELATIVE = 'packages/core/preset/diy.patch.yml';

const PRESET_ID = 'workbench-diy';
const ROW_ID = 'preset-workbench-diy';
const ORDER = 9;
const PRESET_LABEL = '工作台 DIY 模式';
const PRESET_DESCRIPTION =
  '看 / 调这个工作区的面板，或者给它造一块新内容 —— 用大白话说就行。任何工作区都能用（空项目也算）；agent 会看面板、抓请求，必要时把模块造出来装上。不用写代码。';
const SHELL_PACKAGE = '@dsh-workbench/core';

const SKILLS_EXPR =
  "!!js process.getBuiltinModule('node:path').join(" +
  "process.getBuiltinModule('node:path').dirname(" +
  "process.getBuiltinModule('node:module').createRequire(baseUrl).resolve('" +
  SHELL_PACKAGE +
  "/package.json')), 'skills')";

const HEADER = [
  '# Agent preset workbench-diy：DIY 模式。**这个文件是生成的**，别手改 ——',
  '# 改 packages/core/scripts/gen-diy-preset.mjs 再重跑它。',
  '#',
  '# 它从 dsh 出厂那份 standard.patch.yml 派生（整表 plugins 归 dsh 管，手抄会漂），',
  '# 只叠加三处差分：DIY skill 目录、tool-cordis、plugin-manager 打开。',
  '# 派生逻辑与差分理由写在生成器开头。',
];

function die(message) {
  console.error(`gen-diy-preset: ${message}`);
  process.exit(1);
}

function standardPresetPath() {
  const candidates = [];
  if (process.env.DSH_WB_STANDARD_PRESET !== undefined) candidates.push(process.env.DSH_WB_STANDARD_PRESET);

  try {
    candidates.push(
      join(
        dirname(createRequire(import.meta.url).resolve('@deepseek-ai/dsh-web-app/package.json')),
        'presets',
        'standard.patch.yml',
      ),
    );
  } catch {

  }

  try {
    const bin = which.sync('dsh', { nothrow: true }) ?? '';
    if (bin !== '') {
      const entry = realpathSync(bin);
      for (const guess of [dirname(entry), join(dirname(entry), '..')]) {
        candidates.push(join(guess, 'node_modules', '@deepseek-ai', 'dsh-web-app', 'presets', 'standard.patch.yml'));
        candidates.push(join(guess, '..', 'dsh-web-app', 'presets', 'standard.patch.yml'));
      }
    }
  } catch {

  }

  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh');
  const profile = process.env.WORKBENCH_PROFILE ?? 'workbench';
  candidates.push(join(home, 'profiles', profile, 'node_modules', '@deepseek-ai', 'dsh-web-app', 'presets', 'standard.patch.yml'));

  const hit = candidates.find((path) => path !== undefined && existsSync(path));
  if (hit === undefined) {
    die(
      '找不到 dsh 出厂那份 standard.patch.yml —— 试过：\n  ' +
        candidates.join('\n  ') +
        '\n  装好 dsh（或设 DSH_WB_STANDARD_PRESET=<那份文件的绝对路径>）再跑。',
    );
  }
  return hit;
}

function rowIndexOf(lines, id) {
  return lines.findIndex((line) => line.trimStart().startsWith(`- id: ${id}`));
}

function rowBlock(lines, id) {
  const at = rowIndexOf(lines, id);
  if (at === -1) return undefined;
  let end = lines.length;
  for (let i = at + 1; i < lines.length; i += 1) {
    if (/^\s*- id: /.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { at, end, lines: lines.slice(at, end) };
}

function build() {
  const source = standardPresetPath();
  const raw = readFileSync(source, 'utf8');
  const lines = raw.split('\n');

  if (!lines[0]?.startsWith('# Agent preset standard')) {
    die(`${source} 的样子变了（第一行不是那条注释）—— 派生逻辑要跟着改`);
  }
  for (const [id, why] of [
    ['preset-standard', '外层那一行的 id'],
    ['skill-filesystem', '要和 tool-skill 一起搬到最后并加 customSkillDirs'],
    ['tool-skill', '同上'],
    ['tool-plugin-manager', '要把 disabled: true 改成按 profileContext 打开'],
  ]) {
    if (rowIndexOf(lines, id) === -1) die(`${source} 里找不到 ${id} 的行 —— ${why} 这条锚点失效了`);
  }

  const presetRow = rowIndexOf(lines, 'preset-standard');
  const idRow = lines.findIndex((line) => line.trim() === `id: standard`);
  const orderRow = lines.findIndex((line) => line.trim() === `order: 1`);
  if (idRow === -1 || orderRow === -1) die(`${source} 里找不到 id: standard / order: 1`);

  const presetIndent = /^\s*/.exec(lines[presetRow])[0];
  const presetFieldIndent = `${presetIndent}    `;
  if (presetIndent.length + 4 !== /^\s*/.exec(lines[orderRow])[0].length) {
    die(`${source} 的 preset 行缩进（${presetIndent.length}）不再是 order 行 − 4 —— 派生逻辑要跟着改`);
  }

  const manager = rowBlock(lines, 'tool-plugin-manager');
  if (manager === undefined) die('找不到 tool-plugin-manager 那一块');
  if (!manager.lines.some((line) => line.trim() === 'disabled: true')) {
    die('tool-plugin-manager 不再是 `disabled: true` 了 —— 差分 3 的前提变了');
  }

  const skills = rowBlock(lines, 'skill-filesystem');
  const skillTool = rowBlock(lines, 'tool-skill');
  if (skills === undefined || skillTool === undefined) die('找不到 skill-filesystem / tool-skill 那一块');

  const out = [];
  out.push(...HEADER);

  out.push(...lines.slice(3, presetRow));
  out.push(`${presetIndent}- id: ${ROW_ID}`);
  out.push(...lines.slice(presetRow + 1, idRow));
  out.push(`${presetFieldIndent}id: ${PRESET_ID}`);
  out.push(`${presetFieldIndent}name: ${PRESET_LABEL}`);
  out.push(`${presetFieldIndent}description: ${PRESET_DESCRIPTION}`);
  out.push(...lines.slice(idRow + 1, orderRow));
  out.push(`${presetFieldIndent}order: ${ORDER}`);

  const drop = new Set();
  for (let i = skills.at; i < skills.end; i += 1) drop.add(i);
  for (let i = skillTool.at; i < skillTool.end; i += 1) drop.add(i);

  const firstPluginRow = lines.findIndex((line, index) => index > orderRow && /^\s*- id: /.test(line));
  if (firstPluginRow === -1) die('`order: 1` 之后找不到插件行 —— 派生逻辑的锚点失效了');
  const pluginIndent = /^\s*/.exec(lines[firstPluginRow])[0];

  if (pluginIndent.length !== /^\s*/.exec(lines[orderRow])[0].length + 2) {
    die(`${source} 的插件行缩进（${pluginIndent.length}）不再是 order 行 + 2 —— 派生逻辑要跟着改`);
  }

  const regionEnd = lines.findIndex((line, index) => index > orderRow && line.trim() !== '' && !line.startsWith(' '));
  const regionStop = regionEnd === -1 ? lines.length : regionEnd;

  const swapManagerDisabled = (line) => {
    const match = /^(\s*)disabled:\s*true\s*$/.exec(line);
    return match === null ? undefined : `${match[1]}disabled: !!js "!ctx.get('profileContext')"`;
  };

  const tailBlankOfManager = (i) =>
    i >= manager.at && i < manager.end && manager.lines.slice(i - manager.at).every((line) => line.trim() === '');

  const copiedAt = out.length;
  for (let i = orderRow + 1; i < regionStop; i += 1) {
    if (drop.has(i) || tailBlankOfManager(i)) continue;
    const swapped = i >= manager.at && i < manager.end ? swapManagerDisabled(lines[i]) : undefined;
    out.push(swapped ?? lines[i]);
  }
  while (out.length > copiedAt && out[out.length - 1].trim() === '') out.pop();
  const copiedSection = out.slice(copiedAt);

  const appendRow = (id, name) => {
    out.push(`${pluginIndent}- id: ${id}`);
    out.push(`${pluginIndent}  name: '${name}'`);
  };
  appendRow('tool-cordis', '@deepseek-ai/dsh-tool-cordis');
  appendRow('skill-filesystem', '@deepseek-ai/dsh-skill-filesystem');
  out.push(`${pluginIndent}  config:`);
  out.push(`${pluginIndent}    customSkillDirs:`);
  out.push(`${pluginIndent}      - ${SKILLS_EXPR}`);
  appendRow('tool-skill', '@deepseek-ai/dsh-tool-skill');

  for (let i = regionStop; i < lines.length; i += 1) out.push(lines[i]);

  const idOf = (line) => {
    const match = /^\s*- id: (.+)$/.exec(line);
    return match === null ? undefined : match[1].trim();
  };
  const producedIds = out.map(idOf).filter((id) => id !== undefined);

  const counts = new Map();
  for (const id of producedIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  const duplicated = [...counts].filter(([, times]) => times > 1).map(([id]) => id);
  if (duplicated.length > 0) {
    die(
      `产物里有重复的 id：${duplicated.join(' / ')} —— ` +
        'dsh 那边新加的行撞上了我们的 id（或它自己带了重复行），先看清再接。',
    );
  }

  for (const id of [ROW_ID, 'tool-cordis', 'skill-filesystem', 'tool-skill']) {
    if (!counts.has(id)) {
      die(`产物里没有 ${id} —— 它是我们**有意**改动的那几行之一，丢了就是整块丢（第 ③ 条看不出来）。`);
    }
  }

  const replacedIds = ['preset-standard', 'skill-filesystem', 'tool-skill'];
  const missing = lines
    .map(idOf)
    .filter((id) => id !== undefined && !replacedIds.includes(id) && !counts.has(id));
  if (missing.length > 0) {
    die(
      `${source} 里有 ${missing.length} 个 id 没进产物：${missing.join(' / ')}\n` +
        '  派生逻辑把 standard 的某一段漏掉了（别只改判据：先把那几行搬过去）。',
    );
  }

  const expectedIds = [];
  for (let i = 3; i < orderRow; i += 1) {
    const id = idOf(lines[i]);
    if (id !== undefined) expectedIds.push(id === 'preset-standard' ? ROW_ID : id);
  }
  for (let i = orderRow + 1; i < regionStop; i += 1) {
    if (drop.has(i)) continue;
    const id = idOf(lines[i]);
    if (id !== undefined) expectedIds.push(id);
  }
  expectedIds.push('tool-cordis', 'skill-filesystem', 'tool-skill');
  for (let i = regionStop; i < lines.length; i += 1) {
    const id = idOf(lines[i]);
    if (id !== undefined) expectedIds.push(id);
  }
  if (producedIds.join('\n') !== expectedIds.join('\n')) {
    const at = producedIds.findIndex((id, index) => id !== expectedIds[index]);
    const index = at === -1 ? Math.min(producedIds.length, expectedIds.length) : at;
    die(
      `产物的行序列与派生规则不符：第 ${index + 1} 个 id 产物是 ` +
        `${producedIds[index] ?? '(没有)'}、应该是 ${expectedIds[index] ?? '(没有)'}`,
    );
  }

  const multisetOf = (arr) => {
    const map = new Map();
    for (const line of arr) {
      const key = line.replace(/disabled: !!js "!ctx\.get\('profileContext'\)"/, 'disabled: true');
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  };
  const wantLines = multisetOf(
    lines.slice(orderRow + 1, regionStop).filter((line, offset) => {
      const i = orderRow + 1 + offset;
      return line.trim() !== '' && !drop.has(i) && !tailBlankOfManager(i);
    }),
  );
  const haveLines = multisetOf(copiedSection.filter((line) => line.trim() !== ''));
  const lostLine = [...wantLines].find(([line, times]) => (haveLines.get(line) ?? 0) !== times);
  if (lostLine !== undefined) {
    die(
      `照搬 standard 那段时掉/多了行：${JSON.stringify(lostLine[0].trim())} 应该 ${lostLine[1]} 次、` +
        `产物里 ${haveLines.get(lostLine[0]) ?? 0} 次`,
    );
  }

  const skillBlock = rowBlock(out, 'skill-filesystem');
  if (skillBlock === undefined || !skillBlock.lines.some((line) => line.includes(SKILLS_EXPR))) {
    die('skill-filesystem 那一块里没有 customSkillDirs（我们的 DIY 指引目录）');
  }
  const managerBlock = rowBlock(out, 'tool-plugin-manager');
  if (
    managerBlock === undefined ||
    !managerBlock.lines.some((line) => line.trim() === 'disabled: !!js "!ctx.get(\'profileContext\')"')
  ) {
    die('tool-plugin-manager 那一块没被换成按 profileContext 打开（差分 3 丢了）');
  }
  for (const line of [
    `${presetIndent}- id: ${ROW_ID}`,
    `${presetFieldIndent}id: ${PRESET_ID}`,
    `${presetFieldIndent}name: ${PRESET_LABEL}`,
    `${presetFieldIndent}description: ${PRESET_DESCRIPTION}`,
    `${presetFieldIndent}order: ${ORDER}`,
  ]) {
    if (!out.includes(line)) die(`preset 行少了这一行：${line.trim()}（菜单里会只剩 id）`);
  }

  return `${out.join('\n').replace(/\n+$/, '')}\n`;
}

const generated = build();
const check = process.argv.includes('--check');

if (check) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : undefined;
  if (current === generated) {
    console.log(`✔ ${RELATIVE} 与 dsh 出厂的 standard.patch.yml 同步（${generated.split('\n').length - 1} 行）`);
    process.exit(0);
  }
  console.error(`✖ ${RELATIVE} 与生成结果不一致 —— dsh 那边动了 standard.patch.yml，或有人手改了这份文件。`);
  console.error('  跑 `node scripts/gen-diy-preset.mjs` 重新生成，然后看一眼 diff。');
  if (current !== undefined) {
    const a = (current ?? '').split('\n');
    const b = generated.split('\n');
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
      if (a[i] !== b[i]) {
        console.error(`  第一处不同在第 ${i + 1} 行：`);
        console.error(`    现在：${a[i] ?? '(没有这一行)'}`);
        console.error(`    生成：${b[i] ?? '(没有这一行)'}`);
        break;
      }
    }
  }
  process.exit(1);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, generated);
console.log(`✔ 写好了 ${RELATIVE}（${generated.split('\n').length - 1} 行）`);
console.log('  记得确认 package.json 的 dsh.bundle.patch 收录了它，files 也收录了。');
