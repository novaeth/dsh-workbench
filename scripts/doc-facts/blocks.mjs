import { coreArchRules, gateSteps } from './facts.mjs';

const LABELS = {
  'lint:commit': '提交信息',
  build: '构建',
  typecheck: '类型',
  lint: 'lint',
  coverage: '覆盖率',
  'check:gates:target': '目标门禁',
  arch: '架构红线',
  'check:docs': '文档',
  'check:runtimes': '运行时隔离',
  selfcheck: '接线自检',
  'check:modules': '模块判据',
  'check:adapter-defaults': '适配器默认集',
  'scripts/check-adapter-contract.mjs': '适配器契约',
  'check:release-artifacts': '发布产物',
};

function displayOf(step) {
  return step.arg === '' ? step.name : `${step.name} ${step.arg}`;
}

function wrap(items, max) {
  const lines = [];
  let line = '';
  for (const item of items) {
    if (line === '') {
      line = item;
      continue;
    }
    if (line.length + 3 + item.length > max) {
      lines.push(`${line} →`);
      line = item;
      continue;
    }
    line += ` → ${item}`;
  }
  if (line !== '') lines.push(line);
  return lines;
}

export function gateChain() {
  const steps = gateSteps().map(displayOf);
  return ['```text', ...wrap(steps, 92), '```'].join('\n');
}

export function gateChainInline() {
  const steps = gateSteps().map((step) => `\`${displayOf(step)}\``);
  return wrap(steps, 92).join('\n');
}

export function gateChainLabels() {
  const steps = gateSteps().map((step) => {
    const label = LABELS[step.name];
    if (label === undefined) return displayOf(step);
    return label;
  });
  return wrap(steps, 96).join('\n');
}

export async function archRules() {
  const rules = await coreArchRules();
  if (rules.length === 0) throw new Error('core arch.config.mjs 没有 S 规则');
  return [
    '| 规则 | 判什么 |',
    '|---|---|',
    ...rules.map((rule) => `| ${rule.id} | ${rule.title} |`),
  ].join('\n');
}
