import type { CallOverrides, DataReader, DataRequest, RecipeCalls, RecipeResults, RequestRecipe } from '../contract/data.js';

export interface RecipeCall {
  readonly kind: 'request' | 'submit' | 'many';
  readonly recipe: RequestRecipe;
  readonly overrides?: CallOverrides | undefined;
  readonly calls?: RecipeCalls | undefined;
}

const NO_DATA = {
  ok: false as const,
  error: { code: 'invalid-request' as const, message: '测试没有注入 DataReader' },
};

function filled(names: readonly string[], value: unknown): RecipeResults {
  const out: Record<string, unknown> = {};
  for (const name of names) out[name] = value;
  return out as RecipeResults;
}

export function createNoopDataReader(): DataReader {
  return {
    read: async () => NO_DATA,
    request: async () => NO_DATA,
    requestMany: async <T = unknown>(_recipe: RequestRecipe, calls: RecipeCalls): Promise<RecipeResults<T>> =>
      filled(Object.keys(calls), NO_DATA) as RecipeResults<T>,
    submit: async () => NO_DATA,
  };
}

export function createFakeDataReader(
  reply: unknown | ((request: DataRequest, index: number) => unknown) = { ok: true, data: null },
  recipeReply: unknown | ((call: RecipeCall, index: number) => unknown) = { ok: true, data: null },
): DataReader & {
  readonly requests: readonly DataRequest[];
  readonly calls: readonly RecipeCall[];
} {
  const requests: DataRequest[] = [];
  const calls: RecipeCall[] = [];
  const answer = (call: RecipeCall): unknown =>
    typeof recipeReply === 'function' ? recipeReply(call, calls.length - 1) : recipeReply;
  const reader = {
    async read(request: DataRequest): Promise<unknown> {
      requests.push(request);
      return typeof reply === 'function' ? reply(request, requests.length - 1) : reply;
    },
    async request(recipe: RequestRecipe, overrides?: CallOverrides): Promise<unknown> {
      calls.push({ kind: 'request', recipe, overrides });
      return answer(calls[calls.length - 1] as RecipeCall);
    },
    async requestMany(recipe: RequestRecipe, plan: RecipeCalls): Promise<RecipeResults> {
      calls.push({ kind: 'many', recipe, calls: plan });
      const answered = answer(calls[calls.length - 1] as RecipeCall);
      return typeof answered === 'object' && answered !== null && !('ok' in answered)
        ? (answered as RecipeResults)
        : filled(Object.keys(plan), answered);
    },
    async submit(recipe: RequestRecipe, overrides?: CallOverrides): Promise<unknown> {
      calls.push({ kind: 'submit', recipe, overrides });
      return answer(calls[calls.length - 1] as RecipeCall);
    },
  } as unknown as DataReader;
  return Object.assign(reader, { requests, calls });
}

export const fakeDataReader = createFakeDataReader;
