import { flowUses } from './scan.js';
import type {
  FlowActionRegistry,
  FlowActionStep,
  FlowAgentStep,
  FlowAiStep,
  FlowCheck,
  FlowCheckOptions,
  FlowDefinition,
  FlowPredicate,
  FlowProblem,
  FlowValue,
} from './types.js';

type AddProblem = (path: string, problem: string) => void;

interface CheckContext {
  readonly seen: ReadonlySet<string>;
  readonly item: boolean;
  readonly value: boolean;
}

function checkValue(value: FlowValue, path: string, context: CheckContext, add: AddProblem): void {
  if ('$lit' in value) return;
  if ('$default' in value) {
    checkValue(value.$default[0], `${path}.$default[0]`, context, add);
    checkValue(value.$default[1], `${path}.$default[1]`, context, add);
    return;
  }
  if (!('$ref' in value)) {
    add(path, '不是合法的取值表达式');
    return;
  }
  const ref = value.$ref.trim();
  if (ref === '') {
    add(path, '$ref 不能为空');
    return;
  }
  const parts = ref.split('.').filter((part) => part !== '');
  const root = parts[0];
  if (root === undefined) {
    add(path, '$ref 不能为空');
    return;
  }
  if (root === 'in') return;
  if (root === 'steps') {
    const id = parts[1];
    if (id === undefined) {
      add(path, '$ref 指向 steps 时要写到步骤 id');
      return;
    }
    if (!context.seen.has(id)) add(path, `$ref 引用了还没出现的步骤：${id}`);
    return;
  }
  if (root === 'item') {
    if (!context.item) add(path, '$ref 的 item 只在 forEach 步骤里可用');
    return;
  }
  if (root === 'value') {
    if (!context.value) add(path, '$ref 的 value 只在 poll.until 里可用');
    return;
  }
  add(path, `$ref 只能从 in / steps / item / value 起头：${ref}`);
}

function checkPredicate(
  predicate: FlowPredicate,
  path: string,
  context: CheckContext,
  add: AddProblem,
): void {
  if ('$eq' in predicate) {
    checkValue(predicate.$eq[0], `${path}.$eq[0]`, context, add);
    checkValue(predicate.$eq[1], `${path}.$eq[1]`, context, add);
    return;
  }
  if ('$in' in predicate) {
    checkValue(predicate.$in[0], `${path}.$in[0]`, context, add);
    return;
  }
  if ('$exists' in predicate) {
    checkValue(predicate.$exists, `${path}.$exists`, context, add);
    return;
  }
  if ('$and' in predicate) {
    predicate.$and.forEach((item, index) => {
      checkPredicate(item, `${path}.$and[${index}]`, context, add);
    });
    return;
  }
  if ('$not' in predicate) {
    checkPredicate(predicate.$not, `${path}.$not`, context, add);
    return;
  }
  add(path, '不是合法的谓词');
}

function checkCommon(
  step: FlowActionStep | FlowAgentStep | FlowAiStep,
  at: string,
  seen: ReadonlySet<string>,
  add: AddProblem,
): void {
  const item = step.forEach !== undefined;
  if (step.when !== undefined) {
    checkPredicate(step.when, `${at}.when`, { seen, item: false, value: false }, add);
  }
  if (step.forEach !== undefined) {
    checkValue(step.forEach.over, `${at}.forEach.over`, { seen, item: false, value: false }, add);
    if (step.forEach.as.trim() === '') add(`${at}.forEach.as`, 'forEach.as 不能为空');
    if (!Number.isInteger(step.forEach.max) || step.forEach.max < 1 || step.forEach.max > 50) {
      add(`${at}.forEach.max`, 'forEach.max 要在 1..50');
    }
  }
  if (step.retry !== undefined) {
    if (
      !Number.isInteger(step.retry.attempts) ||
      step.retry.attempts < 0 ||
      step.retry.attempts > 5
    ) {
      add(`${at}.retry.attempts`, 'retry.attempts 要在 0..5');
    }
    if (
      step.retry.delayMs !== undefined &&
      (!Number.isInteger(step.retry.delayMs) ||
        step.retry.delayMs < 0 ||
        step.retry.delayMs > 60_000)
    ) {
      add(`${at}.retry.delayMs`, 'retry.delayMs 要在 0..60000');
    }
  }
  const poll = 'poll' in step ? step.poll : undefined;
  if (poll !== undefined) {
    if ('agent' in step || 'ai' in step) {
      add(`${at}.poll`, `${'agent' in step ? 'agent' : 'ai'} 步骤不支持 poll`);
      return;
    }
    if (!Number.isInteger(poll.everyMs) || poll.everyMs < 100 || poll.everyMs > 60_000) {
      add(`${at}.poll.everyMs`, 'poll.everyMs 要在 100..60000');
    }
    if (!Number.isInteger(poll.maxMs) || poll.maxMs < 0 || poll.maxMs > 1_800_000) {
      add(`${at}.poll.maxMs`, 'poll.maxMs 要在 0..1800000');
    } else if (poll.maxMs !== 0 && poll.maxMs < poll.everyMs) {
      add(`${at}.poll.maxMs`, 'poll.maxMs 不能小于 everyMs');
    }
    if (
      poll.onTimeout !== undefined &&
      poll.onTimeout !== 'fail' &&
      poll.onTimeout !== 'continue'
    ) {
      add(`${at}.poll.onTimeout`, 'poll.onTimeout 只能是 fail 或 continue');
    }
    checkPredicate(poll.until, `${at}.poll.until`, { seen, item, value: true }, add);
  }
}

interface PromptSpec {
  readonly prompt: FlowValue;
  readonly images?: FlowValue | undefined;
  readonly schema?: Readonly<Record<string, unknown>> | undefined;
  readonly provider?: string | undefined;
  readonly model?: string | undefined;
}

function checkPromptSpec(
  spec: PromptSpec,
  at: string,
  label: string,
  item: boolean,
  seen: ReadonlySet<string>,
  add: AddProblem,
): void {
  checkValue(spec.prompt, `${at}.${label}.prompt`, { seen, item, value: false }, add);
  if ('$lit' in spec.prompt && typeof spec.prompt.$lit !== 'string') {
    add(`${at}.${label}.prompt`, `${label}.prompt 要是个字符串`);
  }
  if (spec.images !== undefined) {
    checkValue(spec.images, `${at}.${label}.images`, { seen, item, value: false }, add);
  }
  if (
    spec.schema !== undefined &&
    (typeof spec.schema !== 'object' || spec.schema === null || spec.schema['type'] !== 'object')
  ) {
    add(`${at}.${label}.schema`, `${label}.schema 要是对象根的 JSON Schema`);
  }
  for (const key of ['provider', 'model'] as const) {
    const value = spec[key];
    if (value !== undefined && (typeof value !== 'string' || value.trim() === '')) {
      add(`${at}.${label}.${key}`, `${label}.${key} 不能为空`);
    }
  }
}

function checkAi(step: FlowAiStep, at: string, seen: ReadonlySet<string>, add: AddProblem): void {
  const spec = step.ai;
  checkPromptSpec(spec, at, 'ai', step.forEach !== undefined, seen, add);
  if (
    spec.temperature !== undefined &&
    (typeof spec.temperature !== 'number' || spec.temperature < 0 || spec.temperature > 2)
  ) {
    add(`${at}.ai.temperature`, 'temperature 要在 0..2');
  }
  if (
    spec.timeoutMs !== undefined &&
    (!Number.isInteger(spec.timeoutMs) || spec.timeoutMs < 0 || spec.timeoutMs > 600_000)
  ) {
    add(`${at}.ai.timeoutMs`, 'timeoutMs 要在 0..600000');
  }
}

function checkAgent(step: FlowAgentStep, at: string, seen: ReadonlySet<string>, add: AddProblem): void {
  const spec = step.agent;
  const item = step.forEach !== undefined;
  checkPromptSpec(spec, at, 'agent', item, seen, add);
  for (const key of ['allow', 'deny'] as const) {
    const list = spec.tools?.[key];
    if (list !== undefined && !Array.isArray(list)) add(`${at}.agent.tools.${key}`, `tools.${key} 要是字符串数组`);
  }
  if (spec.cwd !== undefined) {
    checkValue(spec.cwd, `${at}.agent.cwd`, { seen, item, value: false }, add);
    if ('$lit' in spec.cwd && typeof spec.cwd.$lit !== 'string') {
      add(`${at}.agent.cwd`, 'agent.cwd 要是个字符串');
    }
  }
  for (const key of ['label', 'name', 'preset'] as const) {
    const value = spec[key];
    if (value !== undefined && (typeof value !== 'string' || value.trim() === '')) {
      add(`${at}.agent.${key}`, `${key} 不能为空`);
    }
  }
  if (item && spec.name !== undefined) {
    add(`${at}.agent.name`, 'forEach 步骤里不要给 agent.name');
  }
}

function checkFlowAt(
  flow: FlowDefinition,
  actions: Pick<FlowActionRegistry, 'has'>,
  options: FlowCheckOptions,
  prefix: string,
  add: AddProblem,
): void {
  if (flow.id.trim() === '') add(`${prefix}id`, '流程 id 不能为空');
  if (flow.title.trim() === '') add(`${prefix}title`, '流程标题不能为空');
  if (flow.steps.length === 0) add(`${prefix}steps`, '至少要有一步');
  if (options.agents === false && flowUses(flow, 'agent')) {
    add(`${prefix}steps`, '这一份运行时没有 agent 能力（没装 subagents）');
  }
  if (options.ai === false && flowUses(flow, 'ai')) {
    add(`${prefix}steps`, '这一份运行时没有模型能力（没配 llm）');
  }
  if (flow.target !== undefined) {
    checkValue(flow.target, `${prefix}target`, { seen: new Set(), item: false, value: false }, add);
  }
  if (flow.stopWhen !== undefined) {
    const all = new Set(flow.steps.map((step) => step.id));
    checkPredicate(flow.stopWhen, `${prefix}stopWhen`, { seen: all, item: false, value: false }, add);
  }

  const seen = new Set<string>();
  flow.steps.forEach((step, index) => {
    const at = `${prefix}steps[${index}]`;
    if (step.id.trim() === '') add(`${at}.id`, '步骤 id 不能为空');
    if (seen.has(step.id)) add(`${at}.id`, `步骤 id 重复：${step.id}`);

    if ('flow' in step) {
      if (step.when !== undefined) {
        checkPredicate(step.when, `${at}.when`, { seen, item: false, value: false }, add);
      }
      if (step.with !== undefined) {
        for (const [key, value] of Object.entries(step.with)) {
          checkValue(value, `${at}.with.${key}`, { seen, item: false, value: false }, add);
        }
      }
      checkFlowAt(step.flow, actions, options, `${at}.flow.`, add);
      seen.add(step.id);
      return;
    }

    if ('agent' in step) {
      checkAgent(step, at, seen, add);
      checkCommon(step, at, seen, add);
      seen.add(step.id);
      return;
    }

    if ('ai' in step) {
      checkAi(step, at, seen, add);
      checkCommon(step, at, seen, add);
      seen.add(step.id);
      return;
    }

    if (step.action.trim() === '') add(`${at}.action`, '动作名不能为空');
    else if (!actions.has(step.action)) add(`${at}.action`, `注册表里没有这个动作：${step.action}`);

    const item = step.forEach !== undefined;
    if (step.with !== undefined) {
      for (const [key, value] of Object.entries(step.with)) {
        checkValue(value, `${at}.with.${key}`, { seen, item, value: false }, add);
      }
    }

    checkCommon(step, at, seen, add);
    seen.add(step.id);
  });
}

/**
 * 校验一条流程：id / 步骤、动作存在、引用只指前面、重试与轮询在边界内、agent 节点形状、子流程也照查。
 * 只做静态检查，不碰平台、不跑动作。
 * @param flow 流程定义。
 * @param actions 动作表（只问 `has`）。
 * @param options 额外口径；`agents: false` 表示这一份运行时没有 agent 通道。
 * @returns 逐条问题；`ok` 为真表示没有。
 */
export function checkFlow(
  flow: FlowDefinition,
  actions: Pick<FlowActionRegistry, 'has'>,
  options: FlowCheckOptions = {},
): FlowCheck {
  const problems: FlowProblem[] = [];
  checkFlowAt(flow, actions, options, '', (path, problem) => {
    problems.push({ path, problem });
  });
  return { ok: problems.length === 0, problems };
}
