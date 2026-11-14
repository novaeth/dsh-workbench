import type {
  CallOverrides,
  DataCallOptions,
  DataFailure,
  DataReader,
  DataRequest,
  PlanResults,
  RecipeCalls,
  RecipeResults,
  RequestPlan,
  RequestRecipe,
  SubmitPlanOptions,
} from '../contract/data.js';
import { allSame } from './plan-results.js';

function denied(origin: string, write = false): DataFailure {
  return {
    ok: false,
    error: {
      code: 'invalid-request',
      message: write
        ? `这个模块没声明写 ${origin}：在清单 host.origins 里加上它`
        : `这个模块没声明读 ${origin}：在清单 host.origins 里加上它`,
      pageCode: 'origin-not-declared',
    },
  };
}

function unreadable(origin: string): DataFailure {
  return {
    ok: false,
    error: {
      code: 'invalid-request',
      message: `读不了 ${origin}：它不是一个能解析的地址（要带 http / https）`,
      pageCode: 'origin-invalid',
    },
  };
}

function planDenied(plan: RequestPlan, origin: string, write = false): PlanResults {
  const error = originOfValue(origin) === undefined ? unreadable(origin).error : denied(origin, write).error;
  return allSame(plan, error);
}

function originOfValue(value: string): string | undefined {
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

export function scopedDataReader(data: DataReader, origins: readonly string[] | undefined): DataReader {
  if (origins === undefined) return data;
  const allowed = new Set(origins.map((one) => new URL(one).origin));
  const originOf = originOfValue;
  const allows = (value: string): boolean => {
    const origin = originOf(value);
    return origin !== undefined && allowed.has(origin);
  };
  const denyOf = (value: string, write = false): DataFailure =>
    originOf(value) === undefined ? unreadable(value) : denied(value, write);
  const shapedPlan = (plan: RequestPlan): string | undefined =>
    typeof plan === 'object' && plan !== null && typeof plan.origin === 'string' ? undefined : '计划要是对象且带 origin';
  const scoped: DataReader = {
    read: <T = unknown>(request: DataRequest, options?: DataCallOptions) => {
      const raw = request.kind === 'http' ? request.url : request.kind === 'browser' ? request.url : undefined;
      const target = raw === undefined || raw === '' ? undefined : raw;
      if (target !== undefined && !allows(target)) return Promise.resolve(denyOf(target));
      return data.read<T>(request, options);
    },
    request: <T = unknown>(recipe: RequestRecipe, overrides?: CallOverrides, options?: DataCallOptions) => {
      if (!allows(recipe.origin)) return Promise.resolve(denyOf(recipe.origin));
      return data.request<T>(recipe, overrides, options);
    },
    requestMany: <T = unknown>(recipe: RequestRecipe, calls: RecipeCalls, options?: DataCallOptions) => {
      if (!allows(recipe.origin)) {
        const error = denyOf(recipe.origin).error;
        return Promise.resolve(
          Object.fromEntries(Object.keys(calls).map((name) => [name, { ok: false as const, error }])) as RecipeResults<T>,
        );
      }
      return data.requestMany<T>(recipe, calls, options);
    },
    plan: (plan: RequestPlan, options?: DataCallOptions) => {
      const bad = shapedPlan(plan);
      if (bad !== undefined) return Promise.resolve(allSame(plan, { code: 'invalid-request', message: bad }));
      if (!allows(plan.origin)) return Promise.resolve(planDenied(plan, plan.origin));
      return data.plan(plan, options);
    },
    submit: <T = unknown>(recipe: RequestRecipe, overrides?: CallOverrides, options?: DataCallOptions) => {
      if (!allows(recipe.origin)) return Promise.resolve(denyOf(recipe.origin, true));
      return data.submit<T>(recipe, overrides, options);
    },
    submitPlan: (plan: RequestPlan, options: SubmitPlanOptions) => {
      const bad = shapedPlan(plan);
      if (bad !== undefined) return Promise.resolve(allSame(plan, { code: 'invalid-request', message: bad }));
      if (!allows(plan.origin)) return Promise.resolve(planDenied(plan, plan.origin, true));
      return data.submitPlan(plan, options);
    },
  };
  return scoped;
}
