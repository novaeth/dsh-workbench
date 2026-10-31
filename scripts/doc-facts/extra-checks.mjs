import { existsSync, lstatSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

import { ROOT, lineOfIndex, readText } from './lib.mjs';
import { arrayLengthOf, arrayValuesOf, interfaceFacts, objectKeysOf } from './ts-facts.mjs';

const DIGITS = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const SKILL_DIR = 'packages/core/skills/workbench-module-diy';
const SKILL_FILES = ['SKILL.md', 'DESIGN.md', 'STEPS.md', 'DATASOURCE.md', 'WRITES.md', 'PANEL.md', 'KIT.md', 'TOOLS.md', 'COPY.md', 'FAMILY.md', 'LINKAGE.md', 'BUILD.md', 'WIRING.md', 'REVIEW.md', 'FLOW.md'];

function finding(file, line, message, fix) {
  return { file, line, message, fix };
}

function lineOf(text, needle) {
  const index = text.indexOf(needle);
  return index === -1 ? 1 : lineOfIndex(text, index);
}

export function numberFrom(text) {
  if (/^\d+$/.test(text)) return Number(text);
  const ten = text.indexOf('十');
  if (ten !== -1) {
    const left = text.slice(0, ten);
    const right = text.slice(ten + 1);
    return (left === '' || left === '一' ? 1 : DIGITS[left]) * 10 + (right === '' ? 0 : DIGITS[right]);
  }
  return [...text].reduce((acc, one) => acc * 10 + (DIGITS[one] ?? Number.NaN), 0);
}

function countMismatch(file, pattern, expected, label) {
  const text = readText(file);
  const findings = [];
  for (const match of text.matchAll(pattern)) {
    const written = numberFrom(match[1]);
    if (written === expected) continue;
    findings.push(
      finding(file, lineOfIndex(text, match.index), `${label}写的是 ${match[1]}，代码事实是 ${expected}`, `改成 ${expected}`),
    );
  }
  return findings;
}

export function gateCount() {
  const text = readText('scripts/gates/target.mjs');
  const start = text.indexOf('const GATES = [');
  const end = text.indexOf('\n];', start);
  if (start === -1 || end === -1) return 0;
  return [...text.slice(start, end).matchAll(/\bid: '[A-Z][A-Z0-9-]*'/g)].length;
}

export function contractPorts() {
  const arch = readText('ARCHITECTURE.md');
  const adapters = readText('ADAPTERS.md');
  const findings = [];
  const env = interfaceFacts('packages/shared/src/host/port-types.ts', 'EnvSupplyPort').members;
  const count = arch.match(/EnvSupplyPort[^\n]*?（(\d+) 个方法）/);
  if (count === null) {
    findings.push(finding('ARCHITECTURE.md', lineOf(arch, '`EnvSupplyPort`'), 'EnvSupplyPort 行没写方法数', '写「（N 个方法）」'));
  } else if (Number(count[1]) !== env.length) {
    findings.push(finding('ARCHITECTURE.md', lineOf(arch, '`EnvSupplyPort`'), `EnvSupplyPort 写 ${count[1]} 个方法，代码是 ${env.length}`, `改成 ${env.length} 个方法`));
  }
  for (const member of env) {
    if (!adapters.includes(`\`${member.name}\``)) {
      findings.push(finding('ADAPTERS.md', lineOf(adapters, '`EnvSupplyPort`'), `EnvSupplyPort 漏了 ${member.name}`, '补进方法列表'));
    }
  }
  const runtime = interfaceFacts('packages/shared/src/host/port-types.ts', 'RuntimePort').members;
  for (const member of runtime) {
    if (!adapters.includes(`\`${member.name}\``)) {
      findings.push(finding('ADAPTERS.md', lineOf(adapters, '`RuntimePort`'), `RuntimePort 漏了 ${member.name}`, '补进成员列表'));
    }
  }
  const caps = interfaceFacts('packages/shared/src/contract/capabilities.ts', 'RuntimeCapabilities').members;
  for (const member of caps) {
    if (!arch.includes(`\`${member.name}\``)) {
      findings.push(finding('ARCHITECTURE.md', lineOf(arch, 'RuntimeCapabilities'), `RuntimeCapabilities 漏了 ${member.name}`, '补能力名'));
    }
  }
  const row = arch.split('\n').find((line) => line.startsWith('| `AdapterSet`'));
  for (const member of ['apiVersion', 'id', 'version', 'libs', 'git', 'commands']) {
    if (row === undefined || !row.includes(member)) {
      findings.push(finding('ARCHITECTURE.md', lineOf(arch, '| `AdapterSet`'), `AdapterSet 行漏了 ${member}`, '补齐成员'));
    }
  }
  return findings;
}

export function counts() {
  const findings = [];
  const arch = readText('ARCHITECTURE.md');
  const gates = gateCount();
  const reported = arch.match(/当前目标报告是 \*\*(\d+) 绿/);
  if (reported === null) {
    findings.push(finding('ARCHITECTURE.md', lineOf(arch, '当前目标报告'), '没有写目标门禁绿数', '写「当前目标报告是 N 绿 / 0 红」'));
  } else if (Number(reported[1]) !== gates) {
    findings.push(finding('ARCHITECTURE.md', lineOf(arch, '当前目标报告'), `写 ${reported[1]} 绿，目标门禁实际 ${gates} 条`, `改成 ${gates} 绿`));
  }
  const checks = objectKeysOf('packages/module-tools/src/check.mjs', 'CHECKS').length;
  for (const file of ['ARCHITECTURE.md', 'packages/module-tools/README.md', 'DESIGN-BOUNDARIES.md']) {
    findings.push(...countMismatch(file, /([一二两三四五六七八九十\d]+)\s*(?:条)?判据/g, checks, '判据数'));
  }
  const snapshots = arrayLengthOf('packages/module-tools/src/checks/cards.mjs', 'SNAPSHOTS');
  findings.push(...countMismatch('packages/module-tools/README.md', /([一二两三四五六七八九十\d]+)态 × zh\/en/g, snapshots, '卡片态数'));
  for (const file of [`${SKILL_DIR}/REVIEW.md`, `${SKILL_DIR}/PANEL.md`]) {
    findings.push(...countMismatch(file, /([一二两三四五六七八九十\d]+)种外壳侧输入/g, snapshots, '外壳侧输入数'));
  }
  return findings;
}

function walk(dir, extension, skip = new Set()) {
  const out = [];
  const visit = (here) => {
    for (const entry of readdirSync(here)) {
      if (skip.has(entry)) continue;
      const full = join(here, entry);
      if (statSync(full).isDirectory()) visit(full);
      else if (entry.endsWith(extension)) out.push(full);
    }
  };
  visit(dir);
  return out;
}

export function skillsTools() {
  const known = new Set();
  for (const root of ['packages/core/src', 'packages/shared/src']) {
    for (const file of walk(root, '.ts', new Set(['__tests__', 'dist', 'node_modules']))) {
      const text = readText(file);
      for (const match of text.matchAll(/['"](workbench_[a-z0-9_]+)['"]/g)) known.add(match[1]);
    }
  }
  const findings = [];
  for (const name of SKILL_FILES) {
    const file = `${SKILL_DIR}/${name}`;
    const text = readText(file);
    for (const match of text.matchAll(/workbench_[a-z0-9_]+/g)) {
      if (known.has(match[0])) continue;
      findings.push(finding(file, lineOfIndex(text, match.index), `工具名 ${match[0]} 在源码里不存在`, '改成真实工具名或删掉'));
    }
  }
  return findings;
}

export function skillsDesign() {
  const design = 'packages/module-tools/src/design.mjs';
  const findings = [];
  const checks = [
    { keys: arrayValuesOf(design, 'STATE_KEYS'), files: [`${SKILL_DIR}/PANEL.md`, `${SKILL_DIR}/DESIGN.md`], label: '状态键' },
    { keys: arrayValuesOf(design, 'DATASOURCE_FIELDS'), files: [`${SKILL_DIR}/DATASOURCE.md`], label: '数据源字段' },
    { keys: arrayValuesOf(design, 'WRITE_FIELDS'), files: [`${SKILL_DIR}/WRITES.md`], label: '写字段' },
    { keys: arrayValuesOf(design, 'SOURCE_TAGS'), files: [`${SKILL_DIR}/WRITES.md`], label: '来源标签' },
  ];
  for (const check of checks) {
    for (const file of check.files) {
      const text = readText(file);
      for (const key of check.keys) {
        if (text.includes(key)) continue;
        findings.push(finding(file, 1, `${check.label} ${key} 没有写`, '补字段说明'));
      }
    }
  }
  return findings;
}

export function privateSymlink() {
  const link = 'private-docs/docs/ARCHITECTURE.md';
  const full = join(ROOT, link);
  if (!existsSync(full)) return [];
  if (!lstatSync(full).isSymbolicLink()) {
    return [finding(link, 1, '私有仓 ARCHITECTURE.md 不是软链，副本会漂', '改回指向根 ARCHITECTURE.md 的 symlink')];
  }
  const target = realpathSync(full);
  if (target !== join(ROOT, 'ARCHITECTURE.md')) {
    return [finding(link, 1, `私有仓 ARCHITECTURE.md 指向 ${target}`, '改回根 ARCHITECTURE.md')];
  }
  return [];
}

export function jsonProblemOf(text, jsonc = false) {
  if (!jsonc) {
    try {
      JSON.parse(text);
      return undefined;
    } catch (error) {
      return error.message;
    }
  }
  const raw = ts.parseJsonText('example.json', text);
  if (raw.parseDiagnostics.length === 0) return undefined;
  const wrapped = ts.parseJsonText('example.json', `{${text}}`);
  if (wrapped.parseDiagnostics.length === 0) return undefined;
  return String(wrapped.parseDiagnostics[0].messageText);
}

export function skillsSchema() {
  const findings = [];
  for (const name of SKILL_FILES) {
    const file = `${SKILL_DIR}/${name}`;
    const text = readText(file);
    for (const match of text.matchAll(/```(jsonc?)\n([\s\S]*?)```/g)) {
      const problem = jsonProblemOf(match[2], match[1] === 'jsonc');
      if (problem === undefined) continue;
      findings.push(finding(file, lineOfIndex(text, match.index), `JSON 示例解析失败：${problem}`, '修示例语法'));
    }
  }
  return findings;
}

export function needsKinds() {
  const file = 'packages/shared/src/contract/needs.ts';
  const text = readText(file);
  const match = text.match(/export const NEED_KINDS = \[([^\]]+)\]/);
  if (match === null) return [finding(file, 1, '找不到 NEED_KINDS', '恢复 NEED_KINDS 导出')];
  const kinds = [...match[1].matchAll(/'([^']+)'/g)].map((one) => one[1]);
  const docs = readText(`${SKILL_DIR}/TOOLS.md`);
  const findings = [];
  for (const kind of kinds) {
    if (docs.includes(`\`${kind}\``)) continue;
    findings.push(finding(`${SKILL_DIR}/TOOLS.md`, lineOf(docs, '`kind`'), `needs kind ${kind} 没写`, '补进四种 kind 列表'));
  }
  const count = docs.match(/([一二两三四五六七八九十\d]+)种 `kind`/);
  if (count === null) {
    findings.push(finding(`${SKILL_DIR}/TOOLS.md`, lineOf(docs, 'needs'), '没写 kind 种类数', '写「N 种 kind」'));
  } else if (numberFrom(count[1]) !== kinds.length) {
    findings.push(finding(`${SKILL_DIR}/TOOLS.md`, lineOf(docs, '`kind`'), `写 ${count[1]} 种 kind，代码是 ${kinds.length}`, `改成 ${kinds.length} 种`));
  }
  return findings;
}

export function mountContract() {
  const facts = interfaceFacts('packages/shared/src/host/unit-face.ts', 'UnitMountResult');
  const file = `${SKILL_DIR}/BUILD.md`;
  const text = readText(file);
  const findings = [];
  for (const member of facts.members) {
    if (text.includes(member.name)) continue;
    findings.push(finding(file, lineOf(text, 'UnitMountResult'), `mount() 返回漏了 ${member.name}`, '补进 UnitMountResult 成员清单'));
  }
  return findings;
}

export function templateScripts() {
  const template = JSON.parse(readText('packages/module-tools/template-diy/package.json.tpl'));
  const scripts = Object.keys(template.scripts ?? {});
  const contracts = readText('packages/module-tools/src/checks/contracts.mjs');
  const required = [...(contracts.match(/for \(const script of \[([^\]]+)\]\)/) ?? [])][1] ?? '';
  const requiredNames = [...required.matchAll(/'([^']+)'/g)].map((one) => one[1]);
  const findings = [];
  for (const name of requiredNames) {
    if (scripts.includes(name)) continue;
    findings.push(finding('packages/module-tools/template-diy/package.json.tpl', 1, `模板没有 contracts 必需的 ${name} 脚本`, '补脚本'));
  }
  const build = readText(`${SKILL_DIR}/BUILD.md`);
  const review = readText(`${SKILL_DIR}/REVIEW.md`);
  for (const script of requiredNames) {
    if (build.includes(script) && review.includes(script)) continue;
    findings.push(finding(`${SKILL_DIR}/BUILD.md`, lineOf(build, '脚本'), `必需脚本 ${script} 没写进 BUILD/REVIEW`, '补脚本名'));
  }
  const built = build.match(/模板自带 (\d+) 个/);
  if (built === null || Number(built[1]) !== scripts.length) {
    findings.push(finding(`${SKILL_DIR}/BUILD.md`, lineOf(build, '模板自带'), `模板脚本数写错，实际 ${scripts.length}`, `改成 ${scripts.length} 个`));
  }
  const reviewed = review.match(/模板共 (\d+) 个/);
  if (reviewed === null || Number(reviewed[1]) !== scripts.length) {
    findings.push(finding(`${SKILL_DIR}/REVIEW.md`, lineOf(review, '模板共'), `模板脚本数写错，实际 ${scripts.length}`, `改成 ${scripts.length} 个`));
  }
  return findings;
}
