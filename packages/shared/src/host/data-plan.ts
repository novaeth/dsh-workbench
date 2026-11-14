import type { PlanStep, RequestPlan } from '../contract/data.js';
import {
  PLAN_DEFAULT_LOOP,
  PLAN_DEFAULT_MAX_BYTES,
  PLAN_DEFAULT_TIMEOUT_MS,
  PLAN_MAX_STEPS,
  planProblemOf,
  type PlanProblem,
} from './data-plan-check.js';
import { planResultsOf } from './plan-results.js';

const DEFAULT_MAX_BYTES = PLAN_DEFAULT_MAX_BYTES;
const DEFAULT_TIMEOUT_MS = PLAN_DEFAULT_TIMEOUT_MS;
const MAX_STEPS = PLAN_MAX_STEPS;
const DEFAULT_LOOP = PLAN_DEFAULT_LOOP;

export { planProblemOf, planResultsOf };
export type { PlanProblem };

function quote(value: string): string {
  return JSON.stringify(value);
}

function outputOf(step: PlanStep): string {
  const kind = step.response?.kind ?? 'json';
  const maxBytes = step.response?.maxBytes ?? DEFAULT_MAX_BYTES;
  const path = step.response?.path;
  const selector = step.response?.selector;
  const fields = step.response?.fields;
  return `{ kind: ${quote(kind)}, path: ${path === undefined ? 'undefined' : quote(path)}, maxBytes: ${String(maxBytes)}, selector: ${selector === undefined ? 'undefined' : quote(selector)}, fields: ${fields === undefined ? 'undefined' : JSON.stringify(fields)} }`;
}

function loopOf(step: PlanStep): string {
  if (step.repeat !== undefined) {
    const repeat = {
      over: step.repeat.over,
      as: step.repeat.as ?? 'item',
      max: step.repeat.max ?? DEFAULT_LOOP,
    };
    return `repeat: ${JSON.stringify(repeat)}, while: undefined`;
  }
  if (step.while !== undefined) {
    const whilePlan = { ...step.while, max: step.while.max ?? DEFAULT_LOOP };
    return `repeat: undefined, while: ${JSON.stringify(whilePlan)}`;
  }
  return 'repeat: undefined, while: undefined';
}

/**
 * 把一份读取计划编译成页面里跑的脚本：一次 eval、多次 fetch，循环与字段提取都在页面内完成。
 * @param plan 已声明的读取计划。
 * @param prior 已经跑过的步骤结果（写计划分步执行时用）：给了就不重跑，直接进 `done` 供后面引用。
 * @returns 可直接交给 `browser eval` 的脚本文本。
 */
export function scriptOfPlan(
  plan: RequestPlan,
  prior: Readonly<Record<string, { readonly value: unknown }>> = {},
): string {
  const problem = planProblemOf(plan)[0];
  if (problem !== undefined) throw new Error(`${problem.path}: ${problem.problem}`);
  const steps = plan.steps
    .map(
      (step) =>
        `      { name: ${quote(step.name)}, method: ${quote(step.request.method)}, path: ${quote(step.request.path)}, ` +
        `query: ${JSON.stringify(step.request.query ?? {})}, headers: ${JSON.stringify(step.request.headers ?? {})}, ` +
        `body: ${JSON.stringify(step.request.body ?? null)}, contentType: ${quote(step.request.contentType ?? 'json')}, ` +
        `response: ${outputOf(step)}, ${loopOf(step)} }`,
    )
    .join(',\n');
  const origin = new URL(plan.origin).origin;
  const timeoutMs = plan.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const authLoss = plan.authLoss === undefined ? 'null' : JSON.stringify(plan.authLoss);
  return [
    '(async () => {',
    `  if (location.origin !== ${quote(origin)}) return { ok: false, code: "not-on-site" };`,
    '  const clock = () => new Date().getTime();',
    '  const pick = (value, path) => String(path).split(".").filter((one) => one !== "").reduce((one, key) => (one === null || one === undefined ? one : one[key]), value);',
    '  const subst = (value, done, vars) => {',
    '    if (typeof value === "string") {',
    '      let missing = null;',
    '      const text = value.replace(/\\{\\{\\s*([A-Za-z0-9_]+(?:\\.[A-Za-z0-9_]+)*)\\s*\\}\\}/g, (all, path) => {',
    '        const got = pick(Object.assign({}, done, vars), path);',
    '        if (got === undefined || got === null) { if (missing === null) missing = path; return all; }',
    '        if (typeof got === "object") { if (missing === null) missing = path + "（对象）"; return all; }',
    '        return String(got);',
    '      });',
    '      return { value: text, missing: missing };',
    '    }',
    '    if (Array.isArray(value)) {',
    '      let missing = null;',
    '      const out = value.map((one) => { const got = subst(one, done, vars); if (missing === null) missing = got.missing; return got.value; });',
    '      return { value: out, missing: missing };',
    '    }',
    '    if (value !== null && typeof value === "object") {',
    '      let missing = null;',
    '      const out = {};',
    '      for (const key of Object.keys(value)) { const got = subst(value[key], done, vars); if (missing === null) missing = got.missing; out[key] = got.value; }',
    '      return { value: out, missing: missing };',
    '    }',
    '    return { value: value, missing: null };',
    '  };',
    '  const itemsOf = (value, max) => {',
    '    if (typeof value !== "string") return null;',
    '    const parts = value.split("..");',
    '    if (parts.length !== 2) return null;',
    '    if (!/^\\d+$/.test(parts[0].trim()) || !/^\\d+$/.test(parts[1].trim())) return null;',
    '    const from = Number(parts[0]);',
    '    const to = Number(parts[1]);',
    '    if (!Number.isInteger(from) || !Number.isInteger(to)) return null;',
    '    if (to < from) return [];',
    '    if (to - from + 1 > max) return new Array(max + 1).fill(0);',
    '    const out = [];',
    '    for (let at = from; at <= to; at += 1) out.push(at);',
    '    return out;',
    '  };',
    `  const authLoss = ${authLoss};`,
    '  const authLostOf = (value) => {',
    '    if (authLoss === null) return null;',
    '    const got = pick(value, authLoss.path);',
    '    const hit = Array.isArray(authLoss.in) && authLoss.in.length > 0 ? authLoss.in.indexOf(got) >= 0 : got === authLoss.equals;',
    '    if (!hit) return null;',
    '    const message = authLoss.messagePath === undefined ? null : pick(value, authLoss.messagePath);',
    '    return typeof message === "string" && message !== "" ? message : "需要登录";',
    '  };',
    `  const prior = ${JSON.stringify(prior)};`,
    '  const steps = [',
    steps,
    '  ];',
    '  if (steps.length === 0) return { ok: true, steps: {} };',
    `  if (steps.length > ${String(MAX_STEPS)}) return { ok: false, code: "too-many-steps", message: "一次最多 ${String(MAX_STEPS)} 步" };`,
    `  const deadline = clock() + ${String(timeoutMs)} - 500;`,
    '  const done = {};',
    '  const results = {};',
    '  const fail = (name, code, message, started) => {',
    '    results[name] = { ok: false, code: code, message: message, elapsedMs: clock() - started };',
    '  };',
    '  const runOnce = async (step, vars) => {',
    '    const substituted = subst({ path: step.path, query: step.query, headers: step.headers, body: step.body }, done, vars);',
    '    if (substituted.missing !== null) return { ok: false, code: "ref-missing", message: "引用取不到：" + substituted.missing };',
    '    const request = substituted.value;',
    '    const raw = String(request.path).trim();',
    '    const rel = raw.charAt(0) === "/" ? raw : "/" + raw;',
    '    const url = new URL(location.origin + rel);',
    '    for (const key of Object.keys(request.query)) url.searchParams.set(key, String(request.query[key]));',
    '    const left = deadline - clock();',
    '    if (left <= 0) return { ok: false, code: "timeout", message: "读超时" };',
    '    const init = { method: step.method, credentials: "include", headers: request.headers };',
    '    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") init.signal = AbortSignal.timeout(Math.max(1, left));',
    '    if (step.method !== "GET" && step.method !== "HEAD") {',
    '      if (step.contentType === "form") {',
    '        const form = new URLSearchParams();',
    '        for (const key of Object.keys(request.body || {})) form.set(key, String(request.body[key]));',
    '        init.body = form.toString();',
    '        init.headers = Object.assign({ "Content-Type": "application/x-www-form-urlencoded; charset=utf-8", "X-Requested-With": "XMLHttpRequest" }, request.headers);',
    '      } else {',
    '        init.body = JSON.stringify(request.body === null ? {} : request.body);',
    '        init.headers = Object.assign({ "Content-Type": "application/json" }, request.headers);',
    '      }',
    '    }',
    '    let response;',
    '    try {',
    '      response = await fetch(url.toString(), init);',
    '    } catch (error) {',
    '      const timeout = error instanceof Error && error.name === "TimeoutError";',
    '      return { ok: false, code: timeout ? "timeout" : "fetch-failed", message: String(error) };',
    '    }',
    '    if (response.status === 401) {',
    '      return { ok: false, code: "not-logged-in", message: "HTTP 401" };',
    '    }',
    '    if (response.status === 403) {',
    '      let body = "";',
    '      try {',
    '        body = (await response.text()).slice(0, 2000);',
    '      } catch (error) {',
    '        body = "";',
    '      }',
    '      if (authLoss !== null && body !== "") {',
    '        let json = null;',
    '        try {',
    '          json = JSON.parse(body);',
    '        } catch (error) {',
    '          json = null;',
    '        }',
    '        const lost = json === null ? null : authLostOf(json);',
    '        if (lost !== null) return { ok: false, code: "not-logged-in", message: lost };',
    '      }',
    '      return { ok: false, code: "forbidden", message: "HTTP 403 " + body.slice(0, 200) };',
    '    }',
    '    if (response.redirected && String(response.url).indexOf("/login") >= 0) {',
    '      return { ok: false, code: "not-logged-in", message: "跳到了登录页" };',
    '    }',
    '    if (!response.ok) return { ok: false, code: "http", message: "HTTP " + response.status };',
    '    try {',
    '    if (step.response.kind === "bytes") {',
    '      const blob = await response.blob();',
    '      if (blob.size > step.response.maxBytes) {',
    '        return { ok: false, code: "too-large", message: "响应超过 " + step.response.maxBytes + " 字节" };',
    '      }',
    '      const buffer = new Uint8Array(await blob.arrayBuffer());',
    '      let text = "";',
    '      for (let at = 0; at < buffer.length; at += 8192) {',
    '        text += String.fromCharCode.apply(null, buffer.subarray(at, at + 8192));',
    '      }',
    '      return { ok: true, value: { base64: btoa(text), size: blob.size, contentType: blob.type || "" }, raw: null };',
    '    }',
    '    const text = await response.text();',
    '    const bytes = typeof TextEncoder === "undefined" ? text.length : new TextEncoder().encode(text).length;',
    '    if (bytes > step.response.maxBytes) {',
    '      return { ok: false, code: "too-large", message: "响应超过 " + step.response.maxBytes + " 字节" };',
    '    }',
    '    if (step.response.kind === "text") return { ok: true, value: text, raw: text };',
    '    if (step.response.kind === "html") {',
    '      const doc = new DOMParser().parseFromString(text, "text/html");',
    '      const nodes = Array.from(doc.querySelectorAll(step.response.selector));',
    '      const value = nodes.map((node) => {',
    '        if (step.response.fields === undefined) return { text: String(node.textContent || "").trim(), html: node.innerHTML };',
    '        const row = {};',
    '        for (const name of Object.keys(step.response.fields)) {',
    '          const found = node.querySelector(step.response.fields[name]);',
    '          row[name] = found === null ? null : String(found.textContent || "").trim();',
    '        }',
    '        return row;',
    '      });',
    '      return { ok: true, value: value, raw: value };',
    '    }',
    '    if (text.trim() === "") return { ok: true, value: null, raw: null };',
    '    let json;',
    '    try {',
    '      json = JSON.parse(text);',
    '    } catch (error) {',
    '      return { ok: false, code: "shape", message: "这一跳不是 JSON" };',
    '    }',
    '    const lost = authLostOf(json);',
    '    if (lost !== null) return { ok: false, code: "not-logged-in", message: lost };',
    '    let value = json;',
    '    if (step.response.path !== undefined) {',
    '      value = pick(json, step.response.path);',
    '      if (value === undefined) return { ok: false, code: "path-missing", message: "返回里没有 " + step.response.path + " 这一格" };',
    '    }',
    '    return { ok: true, value: value, raw: json };',
    '    } catch (error) {',
    '      const timeout = error instanceof Error && error.name === "TimeoutError";',
    '      return { ok: false, code: timeout ? "timeout" : "parse", message: String(error) };',
    '    }',
    '  };',
    '  for (const step of steps) {',
    '    const started = clock();',
    '    if (Object.prototype.hasOwnProperty.call(prior, step.name)) {',
    '      const hit = prior[step.name];',
    '      done[step.name] = hit.value;',
    '      results[step.name] = { ok: true, value: hit.value, elapsedMs: 0 };',
    '      continue;',
    '    }',
    '    if (clock() >= deadline) { fail(step.name, "timeout", "读超时", started); break; }',
    '    if (step.while !== undefined) {',
    '      const out = [];',
    '      let broken = false;',
    '      for (let page = 1; page <= step.while.max; page += 1) {',
    '        if (clock() >= deadline) { fail(step.name, "timeout", "读超时", started); broken = true; break; }',
    '        const got = await runOnce(step, { page: page, index: page - 1 });',
    '        if (!got.ok) { fail(step.name, got.code, got.message, started); broken = true; break; }',
    '        out.push(got.value);',
    '        if (pick(got.raw, step.while.path) === step.while.equals) {',
    '          done[step.name] = out;',
    '          results[step.name] = { ok: true, value: out, elapsedMs: clock() - started };',
    '          break;',
    '        }',
    '        if (page === step.while.max) {',
    '          fail(step.name, "too-many-iterations", "循环 " + step.while.max + " 次还没到终止条件", started);',
    '          broken = true;',
    '        }',
    '      }',
    '      if (broken) break;',
    '      continue;',
    '    }',
    '    if (step.repeat !== undefined) {',
    '      const over = subst(step.repeat.over, done, {});',
    '      if (over.missing !== null) { fail(step.name, "ref-missing", "引用取不到：" + over.missing, started); break; }',
    '      const items = itemsOf(over.value, step.repeat.max);',
    '      if (items === null) { fail(step.name, "repeat-invalid", "repeat.over 要是数字区间（如 1..12）", started); break; }',
    '      if (items.length > step.repeat.max) { fail(step.name, "too-many-iterations", "repeat 超过 " + step.repeat.max + " 项", started); break; }',
    '      const out = [];',
    '      let broken = false;',
    '      for (let index = 0; index < items.length; index += 1) {',
    '        const vars = {};',
    '        vars[step.repeat.as] = items[index];',
    '        vars.index = index;',
    '        vars.page = index + 1;',
    '        if (clock() >= deadline) { fail(step.name, "timeout", "读超时", started); broken = true; break; }',
    '        const got = await runOnce(step, vars);',
    '        if (!got.ok) { fail(step.name, got.code, got.message, started); broken = true; break; }',
    '        out.push(got.value);',
    '      }',
    '      if (broken) break;',
    '      done[step.name] = out;',
    '      results[step.name] = { ok: true, value: out, elapsedMs: clock() - started };',
    '      continue;',
    '    }',
    '    const got = await runOnce(step, {});',
    '    if (!got.ok) { fail(step.name, got.code, got.message, started); break; }',
    '    done[step.name] = got.value;',
    '    results[step.name] = { ok: true, value: got.value, elapsedMs: clock() - started };',
    '  }',
    '  return { ok: true, steps: results };',
    '})()',
  ].join('\n');
}

export { allSame } from './plan-results.js';
