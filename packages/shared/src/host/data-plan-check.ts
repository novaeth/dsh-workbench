import type { PlanStep, RequestPlan } from '../contract/data.js';

const DEFAULT_MAX_BYTES = 2_000_000;
const MAX_MAX_BYTES = 8_000_000;
const MAX_STEPS = 32;
const DEFAULT_TIMEOUT_MS = 25_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 120_000;
const MAX_LOOP = 50;
const DEFAULT_LOOP = 20;
const REF = /\{\{\s*([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)\s*\}\}/g;
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const CONTENT_TYPES = new Set(['json', 'form']);

export const PLAN_MAX_STEPS = MAX_STEPS;
export const PLAN_DEFAULT_TIMEOUT_MS = DEFAULT_TIMEOUT_MS;
export const PLAN_DEFAULT_LOOP = DEFAULT_LOOP;
export const PLAN_DEFAULT_MAX_BYTES = DEFAULT_MAX_BYTES;

export interface PlanProblem {
  readonly path: string;
  readonly problem: string;
}

function refsOf(value: unknown, acc: string[] = []): string[] {
  if (typeof value === 'string') {
    for (const hit of value.matchAll(REF)) acc.push(hit[1] ?? '');
    return acc;
  }
  if (Array.isArray(value)) {
    for (const one of value) refsOf(one, acc);
    return acc;
  }
  if (value !== null && typeof value === 'object') {
    for (const one of Object.values(value)) refsOf(one, acc);
  }
  return acc;
}

function requestValuesOf(step: PlanStep): readonly unknown[] {
  return [
    step.request.path,
    step.request.query,
    step.request.headers,
    step.request.body,
    step.repeat?.over,
  ];
}

const IDENT = /^[A-Za-z][A-Za-z0-9_]*$/;

function primitiveValue(value: unknown): boolean {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function originProblemOf(origin: string): string | undefined {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return 'origin 要是合法 URL';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'origin 只能是 http / https';
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    return 'origin 只能是站点根（不要带 path / query / hash）';
  }
  return undefined;
}

function absoluteUrlProblemOf(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return 'loginUrl 不能为空';
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'loginUrl 要是完整 URL（http / https 开头）';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'loginUrl 只能是 http / https';
  if (url.hostname === '') return 'loginUrl 要带站点名';
  return undefined;
}

function maxBytesProblemOf(value: number | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 1 || value > MAX_MAX_BYTES) {
    return `maxBytes 要在 1..${String(MAX_MAX_BYTES)}`;
  }
  return undefined;
}

function timeoutProblemOf(value: number | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < MIN_TIMEOUT_MS || value > MAX_TIMEOUT_MS) {
    return `timeoutMs 要在 ${String(MIN_TIMEOUT_MS)}..${String(MAX_TIMEOUT_MS)}`;
  }
  return undefined;
}

export function planProblemOf(plan: RequestPlan): readonly PlanProblem[] {
  const problems: PlanProblem[] = [];
  if (typeof plan !== 'object' || plan === null) {
    return [{ path: 'plan', problem: '计划要是一个对象' }];
  }
  if (!Array.isArray(plan.steps)) {
    return [{ path: 'steps', problem: 'steps 要是数组' }];
  }
  if (typeof plan.origin !== 'string' || plan.origin.trim() === '') {
    problems.push({ path: 'origin', problem: 'origin 不能为空' });
  } else {
    const originProblem = originProblemOf(plan.origin);
    if (originProblem !== undefined) problems.push({ path: 'origin', problem: originProblem });
  }
  if (plan.loginUrl !== undefined) {
    const problem = absoluteUrlProblemOf(plan.loginUrl);
    if (problem !== undefined) problems.push({ path: 'loginUrl', problem });
  }
  const authLoss = plan.authLoss ?? undefined;
  const timeoutProblem = timeoutProblemOf(plan.timeoutMs);
  if (timeoutProblem !== undefined) problems.push({ path: 'timeoutMs', problem: timeoutProblem });
  if (plan.steps.length === 0) problems.push({ path: 'steps', problem: '至少要有一步' });
  if (plan.steps.length > MAX_STEPS) {
    problems.push({ path: 'steps', problem: `一次最多 ${String(MAX_STEPS)} 步` });
  }
  if (authLoss !== undefined) {
    const path = authLoss.path;
    if (typeof path !== 'string' || path.trim() === '') {
      problems.push({ path: 'authLoss.path', problem: 'authLoss.path 不能为空' });
    }
    const hasEquals = authLoss.equals !== undefined;
    const hasIn = Array.isArray(authLoss.in) && authLoss.in.length > 0;
    if (!hasEquals && !hasIn) problems.push({ path: 'authLoss', problem: 'equals 或 in 至少给一个' });
    if (hasEquals && hasIn) problems.push({ path: 'authLoss', problem: 'equals 与 in 只给一个' });
    if (
      authLoss.messagePath !== undefined &&
      (typeof authLoss.messagePath !== 'string' || authLoss.messagePath.trim() === '')
    ) {
      problems.push({ path: 'authLoss.messagePath', problem: 'messagePath 不能为空' });
    }
  }
  const names = new Set<string>();
  plan.steps.forEach((raw, index) => {
    const at = `steps[${String(index)}]`;
    if (typeof raw !== 'object' || raw === null) {
      problems.push({ path: at, problem: '每一步要是一个对象' });
      return;
    }
    const step: PlanStep = {
      ...raw,
      ...(raw.repeat === null ? { repeat: undefined } : {}),
      ...(raw.while === null ? { while: undefined } : {}),
    };
    if (typeof step.request !== 'object' || step.request === null) {
      problems.push({ path: `${at}.request`, problem: 'request 要是一个对象' });
      return;
    }
    if (typeof step.name !== 'string' || !IDENT.test(step.name)) {
      problems.push({ path: `${at}.name`, problem: 'name 要是字母开头的标识符' });
    }
    if (step.name === 'page' || step.name === 'index') {
      problems.push({ path: `${at}.name`, problem: 'page / index 是内置的序号变量，不能当步骤名' });
    }
    if (names.has(step.name)) problems.push({ path: `${at}.name`, problem: `步骤名重复：${step.name}` });
    if (!METHODS.has(step.request.method)) {
      problems.push({ path: `${at}.request.method`, problem: 'method 只能是 GET / POST / PUT / PATCH / DELETE' });
    }
    if (typeof step.request.path !== 'string' || step.request.path.trim() === '') {
      problems.push({ path: `${at}.request.path`, problem: 'path 不能为空' });
    } else {
      const path = step.request.path.trim();
      if (path.startsWith('//') || /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(path)) {
        problems.push({
          path: `${at}.request.path`,
          problem: 'path 只能是站内路径：写完整 URL 或 // 开头就绕过了 origin 收口',
        });
      }
    }
    if (step.request.contentType !== undefined && !CONTENT_TYPES.has(step.request.contentType)) {
      problems.push({ path: `${at}.request.contentType`, problem: 'contentType 只能是 json / form' });
    }
    const locals = new Set<string>();
    if (step.repeat !== undefined || step.while !== undefined) {
      locals.add('index');
      locals.add('page');
    }
    if (step.repeat !== undefined) locals.add(step.repeat.as ?? 'item');
    const refs = refsOf(requestValuesOf(step));
    for (const ref of refs) {
      const head = ref.split('.')[0] ?? '';
      if (head === '') problems.push({ path: at, problem: '引用里没有步骤名' });
      else if (!names.has(head) && !locals.has(head)) {
        problems.push({ path: at, problem: `引用了还没出现的步骤：${head}` });
      }
    }
    if (step.repeat !== undefined && step.while !== undefined) {
      problems.push({ path: at, problem: 'repeat 与 while 只能给一个' });
    }
    if (step.repeat !== undefined) {
      for (const ref of refsOf(step.repeat.over)) {
        const head = ref.split('.')[0] ?? '';
        const ownAs = step.repeat.as ?? 'item';
        if (head === 'index' || head === 'page' || (head === ownAs && !names.has(head))) {
          problems.push({
            path: `${at}.repeat.over`,
            problem: `repeat.over 用不了 ${head}：算区间的时候循环还没开始`,
          });
        }
      }
      if (typeof step.repeat.over !== 'string' || step.repeat.over.trim() === '') {
        problems.push({ path: `${at}.repeat.over`, problem: 'repeat.over 不能为空' });
      }
      const as = step.repeat.as ?? 'item';
      if (!IDENT.test(as)) problems.push({ path: `${at}.repeat.as`, problem: 'repeat.as 要是字母开头的标识符' });
      if (as === 'index' || as === 'page') {
        problems.push({ path: `${at}.repeat.as`, problem: 'repeat.as 不能用 index / page（那是内置的序号变量）' });
      }
      if (
        step.repeat.max !== undefined &&
        (!Number.isInteger(step.repeat.max) || step.repeat.max < 1 || step.repeat.max > MAX_LOOP)
      ) {
        problems.push({ path: `${at}.repeat.max`, problem: `repeat.max 要在 1..${String(MAX_LOOP)}` });
      }
    }
    if (step.while !== undefined) {
      if (typeof step.while.path !== 'string' || step.while.path.trim() === '') {
        problems.push({ path: `${at}.while.path`, problem: 'while.path 不能为空' });
      }
      if (step.while.equals === undefined) {
        problems.push({ path: `${at}.while.equals`, problem: 'while.equals 不能为空' });
      } else if (!primitiveValue(step.while.equals)) {
        problems.push({ path: `${at}.while.equals`, problem: 'while.equals 只支持字符串 / 数字 / 布尔 / null' });
      }
      if (
        step.while.max !== undefined &&
        (!Number.isInteger(step.while.max) || step.while.max < 1 || step.while.max > MAX_LOOP)
      ) {
        problems.push({ path: `${at}.while.max`, problem: `while.max 要在 1..${String(MAX_LOOP)}` });
      }
      if (step.response?.kind !== undefined && step.response.kind !== 'json') {
        problems.push({ path: `${at}.while`, problem: 'while 只支持 json 响应' });
      }
    }
    const responseKind = step.response?.kind ?? 'json';
    if (responseKind === 'html') {
      if (typeof step.response?.selector !== 'string' || step.response.selector.trim() === '') {
        problems.push({ path: `${at}.response.selector`, problem: 'html 响应要写 selector' });
      }
      if (step.response?.path !== undefined) {
        problems.push({ path: `${at}.response.path`, problem: 'html 响应用 selector，不要再写 path' });
      }
      if (step.response?.maxBytes !== undefined) {
        problems.push({ path: `${at}.response.maxBytes`, problem: 'html 响应不支持 maxBytes' });
      }
      for (const [name, selector] of Object.entries(step.response?.fields ?? {})) {
        if (typeof selector !== 'string' || selector.trim() === '') {
          problems.push({ path: `${at}.response.fields.${name}`, problem: 'fields 的选择器不能为空' });
        }
      }
    } else if (step.response?.selector !== undefined || step.response?.fields !== undefined) {
      problems.push({ path: `${at}.response`, problem: 'selector / fields 只用于 html 响应' });
    }
    if (step.response?.saveAs !== undefined) {
      if (step.repeat !== undefined || step.while !== undefined) {
        problems.push({ path: `${at}.response.saveAs`, problem: 'saveAs 与分页只能给一个' });
      }
      if (step.response.saveAs !== 'attachment') {
        problems.push({ path: `${at}.response.saveAs`, problem: 'saveAs 目前只支持 attachment' });
      }
      if ((step.response.kind ?? 'json') !== 'bytes') {
        problems.push({ path: `${at}.response.saveAs`, problem: 'saveAs 只用于 bytes 响应' });
      }
    }
    if (step.request.contentType === 'form' && step.request.body !== undefined) {
      const body = step.request.body;
      if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        problems.push({ path: `${at}.request.body`, problem: 'form 的 body 要是一个对象' });
      } else {
        for (const [key, one] of Object.entries(body)) {
          if (typeof one === 'object' && one !== null) {
            problems.push({ path: `${at}.request.body.${key}`, problem: 'form 的值只能是字符串或数字' });
          }
        }
      }
    }
    const kind = step.response?.kind ?? 'json';
    if (kind !== 'json' && kind !== 'text' && kind !== 'bytes' && kind !== 'html') {
      problems.push({ path: `${at}.response.kind`, problem: 'kind 只能是 json / text / bytes / html' });
    }
    if (
      step.response?.path !== undefined &&
      (typeof step.response.path !== 'string' || step.response.path.trim() === '')
    ) {
      problems.push({ path: `${at}.response.path`, problem: 'response.path 不能为空' });
    }
    const maxBytesProblem = maxBytesProblemOf(step.response?.maxBytes);
    if (maxBytesProblem !== undefined) problems.push({ path: `${at}.response.maxBytes`, problem: maxBytesProblem });
    names.add(step.name);
  });
  return problems;
}
