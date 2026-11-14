import type { DataError, PlanResults, PlanStepResult, RequestPlan } from '../contract/data.js';

const CODE_MAP: Readonly<Record<string, DataError['code']>> = {
  'not-logged-in': 'auth',
  forbidden: 'permission-denied',
  'not-on-site': 'browser',
  http: 'http',
  'fetch-failed': 'browser',
  'too-large': 'parse',
  shape: 'parse',
  parse: 'parse',
  'ref-missing': 'parse',
  'path-missing': 'parse',
  'too-many-steps': 'invalid-request',
  'too-many-iterations': 'invalid-request',
  'repeat-invalid': 'invalid-request',
  aborted: 'aborted',
  timeout: 'timeout',
};

function stepError(one: Record<string, unknown>, loginUrl: string | undefined): DataError {
  const pageCode = typeof one['code'] === 'string' ? one['code'] : 'shape';
  const mapped = CODE_MAP[pageCode];
  const code: DataError['code'] =
    mapped ?? (pageCode === 'auth' || pageCode === 'http' || pageCode === 'timeout' ? (pageCode as DataError['code']) : 'browser');
  return {
    code,
    message: typeof one['message'] === 'string' ? one['message'] : '这一步没读成',
    pageCode,
    ...(typeof one['hint'] === 'string' && one['hint'] !== '' ? { hint: one['hint'] } : {}),
    ...(code === 'auth' && loginUrl !== undefined ? { helpUrl: loginUrl } : {}),
  };
}

function elapsedOf(one: Record<string, unknown>): { readonly elapsedMs?: number } {
  return typeof one['elapsedMs'] === 'number' ? { elapsedMs: one['elapsedMs'] } : {};
}

export function planResultsOf(
  value: unknown,
  names: readonly string[] = [],
  options: { readonly loginUrl?: string | undefined } = {},
): PlanResults {
  const raw = (value ?? {}) as Record<string, unknown>;
  const out: Record<string, PlanStepResult<unknown>> = Object.create(null) as Record<string, PlanStepResult<unknown>>;
  if (raw['ok'] === false) {
    const one = stepError(raw, options.loginUrl);
    for (const name of names) out[name] = { ok: false, error: one, ...elapsedOf(raw) };
    return out;
  }
  const steps = (raw['steps'] ?? {}) as Record<string, Record<string, unknown>>;
  for (const [name, one] of Object.entries(steps)) {
    out[name] =
      one['ok'] === true
        ? {
            ok: true,
            data: one['value'],
            ...elapsedOf(one),
          }
        : { ok: false, error: stepError(one, options.loginUrl), ...elapsedOf(one) };
  }
  for (const name of names) {
    if (Object.hasOwn(out, name)) continue;
    out[name] = {
      ok: false,
      error: { code: 'skipped', message: '前面某一步没成，这一步没跑', pageCode: 'skipped' },
    };
  }
  return out;
}

export function allSame(plan: RequestPlan, error: DataError): PlanResults {
  return Object.fromEntries(namedSteps(plan).map((one) => [one, { ok: false as const, error }]));
}

function namedSteps(plan: RequestPlan): readonly string[] {
  const steps = Array.isArray(plan?.steps) ? plan.steps : [];
  return steps
    .map((one) => (typeof one === 'object' && one !== null && typeof one.name === 'string' ? one.name : ''))
    .filter((name) => name !== '');
}
