import type { DataError, DataResult, PlanStep, RequestPlan } from '../contract/data.js';

const DEFAULT_MAX_BYTES = 2_000_000;
const REF = /\{\{\s*([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)\s*\}\}/g;

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
  return [step.request.path, step.request.query, step.request.headers, step.request.body];
}

const IDENT = /^[A-Za-z][A-Za-z0-9_]*$/;

export function planProblemOf(plan: RequestPlan): readonly PlanProblem[] {
  const problems: PlanProblem[] = [];
  if (typeof plan.origin !== 'string' || plan.origin.trim() === '') {
    problems.push({ path: 'origin', problem: 'origin 不能为空' });
  }
  if (plan.steps.length === 0) problems.push({ path: 'steps', problem: '至少要有一步' });
  const names = new Set<string>();
  plan.steps.forEach((step, index) => {
    const at = `steps[${String(index)}]`;
    if (typeof step.name !== 'string' || !IDENT.test(step.name)) {
      problems.push({ path: `${at}.name`, problem: 'name 要是字母开头的标识符' });
    }
    if (names.has(step.name)) problems.push({ path: `${at}.name`, problem: `步骤名重复：${step.name}` });
    if (typeof step.request.path !== 'string' || step.request.path.trim() === '') {
      problems.push({ path: `${at}.request.path`, problem: 'path 不能为空' });
    }
    for (const ref of refsOf(requestValuesOf(step))) {
      const head = ref.split('.')[0] ?? '';
      if (head === '') problems.push({ path: at, problem: '引用里没有步骤名' });
      else if (!names.has(head)) problems.push({ path: at, problem: `引用了还没出现的步骤：${head}` });
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
    if (kind !== 'json' && kind !== 'text' && kind !== 'bytes') {
      problems.push({ path: `${at}.response.kind`, problem: 'kind 只能是 json / text / bytes' });
    }
    names.add(step.name);
  });
  return problems;
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function outputOf(step: PlanStep): string {
  const kind = step.response?.kind ?? 'json';
  const maxBytes = step.response?.maxBytes ?? DEFAULT_MAX_BYTES;
  const path = step.response?.path;
  return `{ kind: ${quote(kind)}, path: ${path === undefined ? 'undefined' : quote(path)}, maxBytes: ${String(maxBytes)} }`;
}

export function scriptOfPlan(plan: RequestPlan): string {
  const problem = planProblemOf(plan)[0];
  if (problem !== undefined) throw new Error(`${problem.path}: ${problem.problem}`);
  const steps = plan.steps
    .map(
      (step) =>
        `      { name: ${quote(step.name)}, method: ${quote(step.request.method)}, path: ${quote(step.request.path)}, ` +
        `query: ${JSON.stringify(step.request.query ?? {})}, headers: ${JSON.stringify(step.request.headers ?? {})}, ` +
        `body: ${JSON.stringify(step.request.body ?? null)}, contentType: ${quote(step.request.contentType ?? 'json')}, ` +
        `response: ${outputOf(step)} }`,
    )
    .join(',\n');
  return [
    '(async () => {',
    `  if (location.origin !== ${quote(plan.origin)}) return { ok: false, code: "not-on-site" };`,
    '  const pick = (value, path) => String(path).split(".").filter((one) => one !== "").reduce((one, key) => (one === null || one === undefined ? one : one[key]), value);',
    '  const subst = (value, done) => {',
    '    if (typeof value === "string") {',
    '      return value.replace(/\\{\\{\\s*([A-Za-z0-9_]+(?:\\.[A-Za-z0-9_]+)*)\\s*\\}\\}/g, (all, path) => {',
    '        const got = pick(done, path);',
    '        return got === undefined || got === null ? "" : String(got);',
    '      });',
    '    }',
    '    if (Array.isArray(value)) return value.map((one) => subst(one, done));',
    '    if (value !== null && typeof value === "object") {',
    '      const out = {};',
    '      for (const key of Object.keys(value)) out[key] = subst(value[key], done);',
    '      return out;',
    '    }',
    '    return value;',
    '  };',
    '  const steps = [',
    steps,
    '  ];',
    '  const done = {};',
    '  const results = {};',
    '  for (const step of steps) {',
    '    const path = subst(step.path, done);',
    '    const query = subst(step.query, done);',
    '    const headers = subst(step.headers, done);',
    '    const body = subst(step.body, done);',
    '    if (JSON.stringify({ path: path, query: query, headers: headers, body: body }).indexOf("[object Object]") >= 0) {',
    '      results[step.name] = { ok: false, code: "shape", message: "有一处引用指到了对象，拼不进请求" };',
    '      break;',
    '    }',
    '    const url = new URL(path.indexOf("://") > 0 ? path : location.origin + path);',
    '    for (const key of Object.keys(query)) url.searchParams.set(key, String(query[key]));',
    '    const init = { method: step.method, credentials: "include", headers: headers };',
    '    if (step.method !== "GET" && step.method !== "HEAD") {',
    '      if (step.contentType === "form") {',
    '        const form = new URLSearchParams();',
    '        for (const key of Object.keys(body || {})) form.set(key, String(body[key]));',
    '        init.body = form.toString();',
    '        init.headers = Object.assign({ "Content-Type": "application/x-www-form-urlencoded; charset=utf-8", "X-Requested-With": "XMLHttpRequest" }, headers);',
    '      } else {',
    '        init.body = JSON.stringify(body === null ? {} : body);',
    '        init.headers = Object.assign({ "Content-Type": "application/json" }, headers);',
    '      }',
    '    }',
    '    let response;',
    '    try {',
    '      response = await fetch(url.toString(), init);',
    '    } catch (error) {',
    '      results[step.name] = { ok: false, code: "fetch-failed", message: String(error) };',
    '      break;',
    '    }',
    '    if (response.status === 401 || response.status === 403) {',
    '      results[step.name] = { ok: false, code: "not-logged-in", message: "HTTP " + response.status };',
    '      break;',
    '    }',
    '    if (response.redirected && String(response.url).indexOf("/login") >= 0) {',
    '      results[step.name] = { ok: false, code: "not-logged-in", message: "跳到了登录页" };',
    '      break;',
    '    }',
    '    let value;',
    '    if (step.response.kind === "bytes") {',
    '      const blob = await response.blob();',
    '      if (blob.size > step.response.maxBytes) {',
    '        results[step.name] = { ok: false, code: "too-large", message: "响应超过 " + step.response.maxBytes + " 字节" };',
    '        break;',
    '      }',
    '      const buffer = new Uint8Array(await blob.arrayBuffer());',
    '      let text = "";',
    '      for (let at = 0; at < buffer.length; at += 8192) {',
    '        text += String.fromCharCode.apply(null, buffer.subarray(at, at + 8192));',
    '      }',
    '      value = { base64: btoa(text), size: blob.size, contentType: blob.type || "" };',
    '    } else {',
    '      const text = await response.text();',
    '      if (step.response.kind === "text") {',
    '        value = text;',
    '      } else {',
    '        try {',
    '          value = JSON.parse(text);',
    '        } catch (error) {',
    '          results[step.name] = { ok: false, code: "shape", message: "这一跳不是 JSON" };',
    '          break;',
    '        }',
    '      }',
    '      if (step.response.path !== undefined) value = pick(value, step.response.path);',
    '    }',
    '    done[step.name] = value;',
    '    results[step.name] = { ok: true, value: value };',
    '  }',
    '  return { ok: true, steps: results };',
    '})()',
  ].join('\n');
}

const CODE_MAP: Readonly<Record<string, DataError['code']>> = {
  'not-logged-in': 'auth',
  'fetch-failed': 'browser',
  'too-large': 'parse',
  shape: 'parse',
};

function stepError(one: Record<string, unknown>): DataError {
  const pageCode = typeof one['code'] === 'string' ? one['code'] : 'shape';
  const mapped = CODE_MAP[pageCode];
  return {
    code: mapped ?? (pageCode === 'auth' || pageCode === 'http' || pageCode === 'timeout' ? (pageCode as DataError['code']) : 'browser'),
    message: typeof one['message'] === 'string' ? one['message'] : '这一步没读成',
    pageCode,
  };
}

export function planResultsOf(value: unknown, names: readonly string[] = []): Record<string, DataResult<unknown>> {
  const raw = (value ?? {}) as Record<string, unknown>;
  const steps = (raw['steps'] ?? {}) as Record<string, Record<string, unknown>>;
  const out: Record<string, DataResult<unknown>> = {};
  for (const [name, one] of Object.entries(steps)) {
    out[name] = one['ok'] === true ? { ok: true, data: one['value'] } : { ok: false, error: stepError(one) };
  }
  for (const name of names) {
    if (out[name] !== undefined) continue;
    out[name] = {
      ok: false,
      error: { code: 'command', message: '前面某一步没成，这一步没跑', pageCode: 'skipped' },
    };
  }
  return out;
}
