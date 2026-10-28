import type {
  FlowActionRegistry,
  FlowCheck,
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

function checkFlowAt(
  flow: FlowDefinition,
  actions: Pick<FlowActionRegistry, 'has'>,
  prefix: string,
  add: AddProblem,
): void {
  if (flow.id.trim() === '') add(`${prefix}id`, '流程 id 不能为空');
  if (flow.title.trim() === '') add(`${prefix}title`, '流程标题不能为空');
  if (flow.steps.length === 0) add(`${prefix}steps`, '至少要有一步');
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
      checkFlowAt(step.flow, actions, `${at}.flow.`, add);
      seen.add(step.id);
      return;
    }

    if (step.action.trim() === '') add(`${at}.action`, '动作名不能为空');
    else if (!actions.has(step.action)) add(`${at}.action`, `注册表里没有这个动作：${step.action}`);

    const item = step.forEach !== undefined;
    if (step.when !== undefined) {
      checkPredicate(step.when, `${at}.when`, { seen, item: false, value: false }, add);
    }
    if (step.with !== undefined) {
      for (const [key, value] of Object.entries(step.with)) {
        checkValue(value, `${at}.with.${key}`, { seen, item, value: false }, add);
      }
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

    if (step.poll !== undefined) {
      if (
        !Number.isInteger(step.poll.everyMs) ||
        step.poll.everyMs < 100 ||
        step.poll.everyMs > 60_000
      ) {
        add(`${at}.poll.everyMs`, 'poll.everyMs 要在 100..60000');
      }
      if (
        !Number.isInteger(step.poll.maxMs) ||
        step.poll.maxMs < 0 ||
        step.poll.maxMs > 1_800_000
      ) {
        add(`${at}.poll.maxMs`, 'poll.maxMs 要在 0..1800000');
      } else if (step.poll.maxMs !== 0 && step.poll.maxMs < step.poll.everyMs) {
        add(`${at}.poll.maxMs`, 'poll.maxMs 不能小于 everyMs');
      }
      if (
        step.poll.onTimeout !== undefined &&
        step.poll.onTimeout !== 'fail' &&
        step.poll.onTimeout !== 'continue'
      ) {
        add(`${at}.poll.onTimeout`, 'poll.onTimeout 只能是 fail 或 continue');
      }
      checkPredicate(step.poll.until, `${at}.poll.until`, { seen, item, value: true }, add);
    }

    seen.add(step.id);
  });
}

/**
 * 校验一条流程：id / 步骤、动作存在、引用只指前面、重试与轮询在边界内、子流程也照查。
 * 只做静态检查，不碰平台、不跑动作。
 * @param flow 流程定义。
 * @param actions 动作表（只问 `has`）。
 * @returns 逐条问题；`ok` 为真表示没有。
 */
export function checkFlow(
  flow: FlowDefinition,
  actions: Pick<FlowActionRegistry, 'has'>,
): FlowCheck {
  const problems: FlowProblem[] = [];
  checkFlowAt(flow, actions, '', (path, problem) => {
    problems.push({ path, problem });
  });
  return { ok: problems.length === 0, problems };
}
