import { relative } from 'node:path';
import ts from 'typescript';

import { pkg, read, REPO } from '../lib.mjs';

const SKILL = pkg('skills/workbench-module-diy/SKILL.md');
const FLOW = pkg('skills/workbench-module-diy/FLOW.md');
const PLAN_TOOL = pkg('src/modules/panels/model/flow/plan-tool.ts');
const DEFINITIONS = pkg('src/modules/panels/model/flow/definitions.ts');
const FLOW_CONSTANTS = ['DIY_BOARD_FLOW', 'DIY_TWEAK_FLOW', 'DIY_WRITE_RECORD_FLOW'];
const MARKERS = ['手里', '做', '交', '完', '读', '卡'];

function sourceOf(file) {
  return ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function declarationOf(source, name) {
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name) return declaration;
    }
  }
  throw new Error(`${relative(REPO, source.fileName)}：找不到 ${name}`);
}

function literalText(node, label) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  throw new Error(`${label} 必须是字符串字面量`);
}

function propertyOf(object, name) {
  const property = object.properties.find(
    (one) => ts.isPropertyAssignment(one) && (ts.isIdentifier(one.name) || ts.isStringLiteral(one.name)) && one.name.text === name,
  );
  if (property === undefined || !ts.isPropertyAssignment(property)) throw new Error(`对象缺少 ${name}`);
  return property.initializer;
}

function objectOf(source, name) {
  const declaration = declarationOf(source, name);
  if (declaration.initializer === undefined || !ts.isObjectLiteralExpression(declaration.initializer)) {
    throw new Error(`${name} 必须是对象字面量`);
  }
  return declaration.initializer;
}

function destinationsOf() {
  const source = sourceOf(PLAN_TOOL);
  const declaration = declarationOf(source, 'DESTINATIONS');
  if (declaration.initializer === undefined || !ts.isArrayLiteralExpression(declaration.initializer)) {
    throw new Error('DESTINATIONS 必须是数组字面量');
  }
  const values = declaration.initializer.elements.map((one) => literalText(one, 'DESTINATIONS'));
  if (values.length === 0) throw new Error('DESTINATIONS 不能为空');
  return values;
}

function flowDefinitionsOf() {
  const source = sourceOf(DEFINITIONS);
  return FLOW_CONSTANTS.map((name) => {
    const object = objectOf(source, name);
    const steps = propertyOf(object, 'steps');
    if (!ts.isArrayLiteralExpression(steps)) throw new Error(`${name}.steps 必须是数组字面量`);
    return {
      id: literalText(propertyOf(object, 'id'), `${name}.id`),
      steps: steps.elements.map((step, index) => {
        if (!ts.isObjectLiteralExpression(step)) throw new Error(`${name}.steps[${index}] 必须是对象字面量`);
        return literalText(propertyOf(step, 'id'), `${name}.steps[${index}].id`);
      }),
    };
  });
}

function at(file, line, problem) {
  return `${relative(REPO, file)}:${line} ${problem}`;
}

function triageOf(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => /^## 第 0 步：/.test(line));
  if (start === -1) return { line: 1, text: '' };
  const end = lines.findIndex((line, index) => index > start && /^## /.test(line));
  return { line: start + 1, text: lines.slice(start, end === -1 ? lines.length : end).join('\n') };
}

function destinationProblemsOf(text, destinations, file = SKILL) {
  const triage = triageOf(text);
  if (triage.text === '') return [at(file, triage.line, '缺分诊区')];
  return destinations
    .filter((destination) => !triage.text.includes(`\`${destination}\``))
    .map((destination) => at(file, triage.line, `缺去向 ${destination}`));
}

function documentFlowsOf(text) {
  const flows = [];
  let flow;
  let node;
  text.split('\n').forEach((line, index) => {
    const flowMatch = /^## `([^`]+)`/.exec(line);
    if (flowMatch !== null) {
      flow = { id: flowMatch[1], line: index + 1, nodes: [] };
      flows.push(flow);
      node = undefined;
      return;
    }
    if (/^## /.test(line)) {
      flow = undefined;
      node = undefined;
      return;
    }
    const nodeMatch = /^### `([^`]+)`/.exec(line);
    if (flow !== undefined && nodeMatch !== null) {
      node = { id: nodeMatch[1], line: index + 1, body: '' };
      flow.nodes.push(node);
      return;
    }
    if (node !== undefined) node.body += `${line}\n`;
  });
  return flows;
}

function nodeProblemsOf(text, expectedFlows, file = FLOW) {
  const documented = documentFlowsOf(text);
  const problems = [];
  for (const flow of documented) {
    if (!expectedFlows.some((one) => one.id === flow.id)) problems.push(at(file, flow.line, `多余流程 ${flow.id}`));
  }
  for (const expected of expectedFlows) {
    const flow = documented.find((one) => one.id === expected.id);
    if (flow === undefined) {
      problems.push(at(file, 1, `缺流程 ${expected.id}`));
      continue;
    }
    const seen = new Set();
    for (const node of flow.nodes) {
      if (!expected.steps.includes(node.id) || seen.has(node.id)) problems.push(at(file, node.line, `多余节点 ${node.id}`));
      seen.add(node.id);
    }
    for (const step of expected.steps) {
      if (!seen.has(step)) problems.push(at(file, flow.line, `缺节点 ${step}`));
    }
    const actual = flow.nodes.map((node) => node.id);
    if (
      actual.length === expected.steps.length &&
      actual.every((step) => expected.steps.includes(step)) &&
      actual.join(',') !== expected.steps.join(',')
    ) {
      problems.push(at(file, flow.line, `节点顺序应为 ${expected.steps.join(' → ')}`));
    }
  }
  return problems;
}

function markerProblemsOf(text, file = FLOW) {
  const problems = [];
  for (const flow of documentFlowsOf(text)) {
    for (const node of flow.nodes) {
      for (const marker of MARKERS) {
        if (!node.body.includes(`- **${marker}**：`)) {
          problems.push(at(file, node.line, `${flow.id}/${node.id} 缺「${marker}」`));
        }
      }
    }
  }
  return problems;
}

function detailOf(problems, clean) {
  return problems.length === 0 ? clean : problems.join('；');
}

function finish(report, title, problems, negative, clean) {
  report(title, problems.length === 0 && negative, detailOf(problems, clean));
}

function credentialProblemsOf(text) {
  const triage = triageOf(text);
  const problems = [];
  if (!triage.text.includes('新凭据')) problems.push(at(SKILL, triage.line, '分诊表没写「新凭据」'));
  if (triage.text.includes('要接一个新平台的账号')) problems.push(at(SKILL, triage.line, '判域误用「要不要接新平台」'));
  return problems;
}

function destinationCoverage() {
  const destinations = destinationsOf();
  const text = read(SKILL);
  const dirty = destinationProblemsOf(text.replace('`board`', ''), destinations);
  return {
    problems: destinationProblemsOf(text, destinations),
    negative: dirty.some((one) => /SKILL\.md:\d+ 缺去向 board/.test(one)),
    clean: `${destinations.length} 个计划去向都有分诊 · 缺去向负例带文件与行号`,
  };
}

function nodeCoverage() {
  const flows = flowDefinitionsOf();
  const text = read(FLOW);
  const missing = nodeProblemsOf(text.replace(/### `probe`[\s\S]*?(?=### `plan`)/, ''), flows);
  const extra = nodeProblemsOf(text.replace('### `plan`', '### `extra`\n\n### `plan`'), flows);
  const swapped = nodeProblemsOf(
    text.replace('### `probe`', '### `__swap__`').replace('### `plan`', '### `probe`').replace('### `__swap__`', '### `plan`'),
    flows,
  );
  return {
    problems: nodeProblemsOf(text, flows),
    negative:
      missing.some((one) => /FLOW\.md:\d+ 缺节点 probe/.test(one)) &&
      extra.some((one) => /FLOW\.md:\d+ 多余节点 extra/.test(one)) &&
      swapped.some((one) => /FLOW\.md:\d+ 节点顺序应为/.test(one)),
    clean: `${flows.length} 条流程节点同集合同序 · 缺节点 / 多节点 / 乱序负例都带文件与行号`,
  };
}

function markerCoverage() {
  const text = read(FLOW);
  const dirty = markerProblemsOf(text.replace('- **做**：', '- **做（删）**：'));
  return {
    problems: markerProblemsOf(text),
    negative: dirty.some((one) => /FLOW\.md:\d+ diy-board\/probe 缺「做」/.test(one)),
    clean: `${MARKERS.join(' / ')} 六格齐全 · 缺格负例带文件与行号`,
  };
}

function credentialCoverage() {
  const text = read(SKILL);
  return {
    problems: credentialProblemsOf(text),
    negative: credentialProblemsOf(text.replace('新凭据', '')).some((one) => one.includes('分诊表没写')),
    clean: '分诊按要不要新凭据判 · 缺失负例带文件与行号',
  };
}

function coverageCheck(title, evaluate) {
  return {
    title,
    run(_ctx, report) {
      const { problems, negative, clean } = evaluate();
      finish(report, title, problems, negative, clean);
    },
  };
}

export const checks = [
  coverageCheck('★ DIY skill 分诊覆盖计划工具去向（缺一个报一个）', destinationCoverage),
  coverageCheck('★ DIY skill 流程节点与代码同集合同序（多一个少一个都红）', nodeCoverage),
  coverageCheck('★ DIY skill 每个流程节点都有六格接口约定', markerCoverage),
  coverageCheck('★ DIY skill 判域按要不要新凭据，不按要不要接新平台', credentialCoverage),
];
