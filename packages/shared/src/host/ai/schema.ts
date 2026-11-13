/**
 * 结构化输出的最小校验：对象根、required、properties 的 type、items 的 type、enum。
 * 不认识的关键字默认忽略；`strict` 时把它当成问题报出来。
 *
 * @module dsh-workbench/shared/host/ai/schema
 */
import type { JsonSchema } from './types.js';

/** 一处不合 schema 的地方。 */
export interface SchemaProblem {
  readonly path: string;
  readonly problem: string;
}

const KNOWN_KEYS: readonly string[] = ['type', 'required', 'properties', 'items', 'enum', 'description', 'title', 'additionalProperties'];

function typeMatches(value: unknown, type: string): boolean {
  if (type === 'object') return typeof value === 'object' && value !== null && !Array.isArray(value);
  if (type === 'array') return Array.isArray(value);
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'string') return typeof value === 'string';
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'null') return value === null;
  return true;
}

function typesOf(schema: JsonSchema): readonly string[] {
  const raw = schema['type'];
  if (typeof raw === 'string') return [raw];
  if (Array.isArray(raw)) return raw.filter((one): one is string => typeof one === 'string');
  return [];
}

/**
 * 校验一个值是否合 schema。
 * @param value 模型给出来的值。
 * @param schema 模块给的形状。
 * @param strict 为真时不认识的关键字也算问题。
 * @param path 起点路径，递归时用。
 * @returns 问题清单；空表示通过。
 */
export function problemsOf(
  value: unknown,
  schema: JsonSchema,
  strict = false,
  path = '$',
): SchemaProblem[] {
  const problems: SchemaProblem[] = [];
  if (strict) {
    for (const key of Object.keys(schema)) {
      if (!KNOWN_KEYS.includes(key)) problems.push({ path, problem: `不认识的 schema 关键字：${key}` });
    }
  }
  const types = typesOf(schema);
  if (types.length > 0 && !types.some((type) => typeMatches(value, type))) {
    problems.push({ path, problem: `类型应为 ${types.join(' | ')}` });
    return problems;
  }
  const allowed = schema['enum'];
  if (Array.isArray(allowed) && !allowed.some((one) => one === value)) {
    problems.push({ path, problem: `取值不在枚举里` });
  }
  const properties = schema['properties'];
  if (typeof properties === 'object' && properties !== null && !Array.isArray(properties)) {
    const record = properties as Record<string, unknown>;
    const required = schema['required'];
    if (Array.isArray(required)) {
      for (const key of required) {
        if (typeof key !== 'string') continue;
        const body = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
        if (!Object.prototype.hasOwnProperty.call(body, key)) {
          problems.push({ path: `${path}.${key}`, problem: '缺必填字段' });
        }
      }
    }
    if (typeof value === 'object' && value !== null) {
      for (const [key, child] of Object.entries(record)) {
        if (typeof child !== 'object' || child === null) continue;
        const body = value as Record<string, unknown>;
        if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
        problems.push(...problemsOf(body[key], child as JsonSchema, strict, `${path}.${key}`));
      }
    }
  }
  const items = schema['items'];
  if (typeof items === 'object' && items !== null && Array.isArray(value)) {
    value.forEach((one, index) => {
      problems.push(...problemsOf(one, items as JsonSchema, strict, `${path}[${String(index)}]`));
    });
  }
  return problems;
}
