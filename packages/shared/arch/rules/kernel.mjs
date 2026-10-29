import { createRule } from '@arch-guard/core';

const KERNEL_FILES = new Set([
  'src/contract/blocker.ts',
  'src/contract/facts.ts',
  'src/contract/long-task.ts',
  'src/contract/unit-board.ts',
  'src/contract/unit-declaration.ts',
  'src/contract/unit.ts',
  'src/contract/workbench-contract.ts',
  'src/host/unit-face.ts',
]);

const UI_OR_VENDOR = /^(react(?:\/|$)|react-dom(?:\/|$)|@deepseek-ai\/|node:)/;
const ADAPTER = /^(?:@dsh-workbench\/(?:adapter-|adapters-default)|opencli(?:\/|$)|shell-quote$|shelljs$)/;

const kernelKeepsAdaptersOut = createRule({
  id: 'S71',
  domain: 'structure',
  level: 'L2',
  severity: 'error',
  title: '内核不依赖 UI 与适配器实现',
  hint:
    '内核只放所有模块绕不开的契约：单元形状、事实、审批、卡片槽、安装。' +
    'opencli、插件供给、浏览器读、React 组件都放适配器或 shared/host；内核不 import 具体 adapter。',
  run(ctx) {
    const findings = [];
    for (const record of ctx.records) {
      if (!KERNEL_FILES.has(record.rel)) continue;
      for (const fact of ctx.facts.get(record.rel)?.imports ?? []) {
        if (!UI_OR_VENDOR.test(fact.spec) && !ADAPTER.test(fact.spec)) continue;
        findings.push({
          rule: 'S71',
          file: record.rel,
          line: fact.line,
          ...(fact.column === undefined ? {} : { column: fact.column }),
          text: `内核 import 了 ${fact.spec}`,
          hint: '把它挪到 packages/adapter-* 或 shared/host 的纯工厂，内核只依赖端口类型',
        });
      }
    }
    return findings;
  },
});

const VENDOR_FIELD = /^(opencli|browser|plugin|probe)/i;
const KNOWN_FIELDS = new Set(['probe']);

const kernelHasNoVendorFields = createRule({
  id: 'S72',
  domain: 'structure',
  level: 'L2',
  severity: 'error',
  title: '内核契约不新增供应商字段',
  hint:
    'UnitMountDeps 是宿主交给每个模块的全部依赖；新增一个 opencli / browser / plugin / probe 字段，' +
    '等于让所有模块都背这个供应商。先证明它所有模块都需要，否则放适配器。',
  run(ctx) {
    const file = 'src/host/unit-face.ts';
    const text = ctx.sourceOf(file);
    if (text === undefined) return [];
    const match = /export interface UnitMountDeps \{([\s\S]*?)\n\}/.exec(text);
    if (match === null) return [];
    const body = match[1] ?? '';
    const bodyStart = match.index + match[0].indexOf('{') + 1;
    const findings = [];
    for (const field of body.matchAll(/^\s*readonly\s+([A-Za-z0-9_]+)/gm)) {
      const name = field[1];
      if (!VENDOR_FIELD.test(name) || KNOWN_FIELDS.has(name)) continue;
      const line = text.slice(0, bodyStart + field.index).split('\n').length;
      findings.push({
        rule: 'S72',
        file,
        line,
        text: `UnitMountDeps 新增供应商字段 ${name}`,
        hint: '把它放进适配器端口（如 DataReader / SupplyProbe），不要放进每个模块都会收到的 deps',
      });
    }
    return findings;
  },
});

const RUNTIME_IN_TEXT = /['"`][^'"`]*opencli[^'"`]*['"`]/i;
const RUNTIME_WORD = /opencli/i;

const copyNamesNoRuntime = createRule({
  id: 'C75',
  domain: 'copy',
  level: 'L3',
  severity: 'error',
  title: '默认字典不点名运行时',
  hint: '文案走 RuntimeProfile 的 terms / diagnose / bridge，字典只放运行时中立的话；点名了就会在换适配器后说错话。',
  run(ctx) {
    const findings = [];
    for (const record of ctx.records) {
      if (!record.rel.startsWith('src/i18n/')) continue;
      const source = ctx.sourceOf(record.rel);
      if (source === undefined) continue;
      const lines = source.split('\n');
      for (let index = 0; index < lines.length; index += 1) {
        if (!RUNTIME_IN_TEXT.test(lines[index])) continue;
        findings.push({
          rule: 'C75',
          file: record.rel,
          line: index + 1,
          text: `字典里点名了运行时：${lines[index].trim().slice(0, 80)}`,
          hint: '改成运行时中立的话，具体名称由适配器的 profile 提供',
        });
      }
    }
    return findings;
  },
});

const hostStaysGeneric = createRule({
  id: 'S76',
  domain: 'structure',
  level: 'L3',
  severity: 'error',
  title: '宿主与契约里不出现某个运行时的名字',
  hint: '具体运行时的路径、清单名、命令名都由适配器给；shared 只留算法与端口。',
  run(ctx) {
    const findings = [];
    for (const record of ctx.records) {
      if (!record.rel.startsWith('src/host/') && !record.rel.startsWith('src/contract/')) continue;
      if (record.rel.includes('__tests__/')) continue;
      const source = ctx.sourceOf(record.rel);
      if (source === undefined) continue;
      const lines = source.split('\n');
      for (let index = 0; index < lines.length; index += 1) {
        if (!RUNTIME_WORD.test(lines[index])) continue;
        findings.push({
          rule: 'S76',
          file: record.rel,
          line: index + 1,
          text: `点名了运行时：${lines[index].trim().slice(0, 80)}`,
          hint: '把它交给适配器：路径走 RuntimeLayout、清单名走端口、文案走 RuntimeProfile',
        });
      }
    }
    return findings;
  },
});

export const kernelRules = [kernelKeepsAdaptersOut, kernelHasNoVendorFields, copyNamesNoRuntime, hostStaysGeneric];
