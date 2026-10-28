import { isDeepStrictEqual } from 'node:util';
import type { FlowPredicate, FlowScope, FlowValue } from './types.js';

function fieldOf(value: unknown, key: string): unknown {
  if (Array.isArray(value)) {
    const index = Number.parseInt(key, 10);
    return Number.isInteger(index) && index >= 0 ? value[index] : undefined;
  }
  if (typeof value !== 'object' || value === null) return undefined;
  return (value as Readonly<Record<string, unknown>>)[key];
}

/**
 * 读一个引用路径：`in.env`、`steps.builds.rows.0.id`、`item.id`、`value.status`。
 * 中间缺一段就给 `undefined`，由调用方决定这是不是错。
 * @param path 点分路径。
 * @param scope 求值现场。
 * @returns 取到的值；路径不成立给 `undefined`。
 */
export function readRef(path: string, scope: FlowScope): unknown {
  const parts = path.split('.').filter((part) => part !== '');
  const [root, ...rest] = parts;
  if (root === undefined) return undefined;
  let current: unknown;
  if (root === 'in') current = scope.in;
  else if (root === 'item') current = scope.item;
  else if (root === 'value') current = scope.value;
  else if (root === 'steps') {
    const id = rest.shift();
    if (id === undefined) return undefined;
    current = scope.steps[id];
  } else return undefined;
  for (const part of rest) current = fieldOf(current, part);
  return current;
}

/**
 * 求一个取值表达式：字面量、引用，或二选一。
 * @param value 表达式。
 * @param scope 求值现场。
 * @returns 求出来的值；引用不成立给 `undefined`。
 */
export function resolveValue(value: FlowValue, scope: FlowScope): unknown {
  if ('$lit' in value) return value.$lit;
  if ('$ref' in value) return readRef(value.$ref, scope);
  if ('$default' in value) {
    const first = resolveValue(value.$default[0], scope);
    return first === undefined ? resolveValue(value.$default[1], scope) : first;
  }
  return undefined;
}

function sameValue(left: unknown, right: unknown): boolean {
  return isDeepStrictEqual(left, right);
}

/**
 * 判一个条件表达式。只认五个操作符；未知形状给 `false`。
 * @param predicate 条件表达式。
 * @param scope 求值现场。
 * @returns 真假。
 */
export function evalPredicate(predicate: FlowPredicate, scope: FlowScope): boolean {
  if ('$eq' in predicate) {
    return sameValue(resolveValue(predicate.$eq[0], scope), resolveValue(predicate.$eq[1], scope));
  }
  if ('$in' in predicate) {
    const needle = resolveValue(predicate.$in[0], scope);
    return predicate.$in[1].some((candidate) => sameValue(candidate, needle));
  }
  if ('$exists' in predicate) {
    const value = resolveValue(predicate.$exists, scope);
    return value !== undefined && value !== null;
  }
  if ('$and' in predicate) return predicate.$and.every((item) => evalPredicate(item, scope));
  if ('$not' in predicate) return !evalPredicate(predicate.$not, scope);
  return false;
}

/**
 * 把步骤的 `with` 映射求成动作入参。
 * @param values 字段到表达式的映射；没给就是空对象。
 * @param scope 求值现场。
 * @returns 动作入参。
 */
export function resolveInput(
  values: Readonly<Record<string, FlowValue>> | undefined,
  scope: FlowScope,
): Readonly<Record<string, unknown>> {
  if (values === undefined) return {};
  const input: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) input[key] = resolveValue(value, scope);
  return input;
}
