import { fileURLToPath } from 'node:url';
import type { DshShell } from '@dsh-workbench/shared';
import {
  DEFAULT_RECIPE_MAX_BYTES,
  quoteShellArg,
  runShell,
} from '@dsh-workbench/shared/host';
import {
  channelInstalledVersion,
  channelPluginPlan,
  channelSiteInstalled,
  channelVersionOf,
} from './channel-plugin.js';
import type { CallOverrides, RecipeAuth, RequestRecipe } from '@dsh-workbench/shared/host';

export const CHANNEL_DIR = fileURLToPath(new URL('../../channel/', import.meta.url));

export type ChannelState = 'unknown' | 'ready' | 'unavailable';

export interface ChannelCall {
  readonly argv: readonly string[];
  readonly timeoutMs: number;
}

function authOf(recipe: RequestRecipe): RecipeAuth {
  return recipe.auth ?? { source: { kind: 'cookie' }, place: { in: 'cookie' } };
}

function eligible(recipe: RequestRecipe): { readonly kind: 'cookie' } | { readonly kind: 'cookieValue'; readonly name: string } | undefined {
  const auth = authOf(recipe);
  if (auth.kind === 'none') return undefined;
  if (auth.source.kind === 'cookie') return auth.place.in === 'cookie' ? { kind: 'cookie' } : undefined;
  if (auth.source.kind === 'cookieValue') return { kind: 'cookieValue', name: auth.source.name };
  return undefined;
}

function queryOf(recipe: RequestRecipe, overrides: CallOverrides): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [name, value] of Object.entries(recipe.request.query ?? {})) query[name] = String(value);
  for (const [name, value] of Object.entries(overrides.query ?? {})) query[name] = String(value);
  return query;
}

export function channelUrlOf(recipe: RequestRecipe, overrides: CallOverrides): string {
  const path = overrides.path ?? recipe.request.path;
  const url = new URL(path.startsWith('/') ? `${recipe.origin}${path}` : path);
  for (const [name, value] of Object.entries(queryOf(recipe, overrides))) url.searchParams.set(name, value);
  return url.toString();
}

export function wireBodyOf(
  recipe: RequestRecipe,
  overrides: CallOverrides,
): { readonly contentType: 'json' | 'form'; readonly body: string | undefined } {
  const contentType = recipe.request.contentType ?? 'json';
  const value = overrides.body !== undefined ? overrides.body : recipe.request.body;
  if (value === undefined) return { contentType, body: undefined };
  if (contentType === 'form') {
    const params = new URLSearchParams();
    for (const [name, entry] of Object.entries(value as Record<string, unknown>)) params.set(name, String(entry));
    return { contentType, body: params.toString() };
  }
  return { contentType, body: typeof value === 'string' ? value : JSON.stringify(value) };
}

function placeArgsOf(recipe: RequestRecipe): readonly string[] {
  const auth = authOf(recipe);
  if (auth.kind === 'none' || auth.place.in === 'cookie') return [];
  if (auth.place.in === 'header') {
    const prefix = auth.place.prefix;
    return [
      '--place',
      `header:${auth.place.name}`,
      ...(prefix === undefined ? [] : ['--prefix', prefix]),
    ];
  }
  if (auth.place.in === 'query') return ['--place', `query:${auth.place.name}`];
  return ['--place', `body:${auth.place.field}`];
}

export function channelCallOf(
  recipe: RequestRecipe,
  overrides: CallOverrides,
  command: string,
): ChannelCall | undefined {
  const source = eligible(recipe);
  if (source === undefined) return undefined;
  const write = recipe.request.method !== 'GET';
  const { contentType, body } = wireBodyOf(recipe, overrides);
  const argv = [
    command,
    'workbench',
    write ? 'send' : 'fetch',
    '--api',
    '1',
    '--url',
    channelUrlOf(recipe, overrides),
    '--jar',
    'cookie',
    ...(source.kind === 'cookieValue' ? ['--cookie', source.name] : []),
    ...placeArgsOf(recipe),
    ...(Object.keys(recipe.request.headers ?? {}).length === 0 && Object.keys(overrides.headers ?? {}).length === 0
      ? []
      : [
          '--headers',
          JSON.stringify({ ...(recipe.request.headers ?? {}), ...(overrides.headers ?? {}) }),
        ]),
    '--kind',
    recipe.response?.kind ?? 'json',
    '--maxBytes',
    String(recipe.response?.maxBytes ?? DEFAULT_RECIPE_MAX_BYTES),
    '-f',
    'json',
    ...(write ? ['--method', recipe.request.method] : []),
    ...(write ? ['--content-type', contentType] : []),
    ...(write && body !== undefined ? ['--body', body] : []),
  ];
  return { argv, timeoutMs: recipe.timeoutMs ?? 25_000 };
}

export function channelAlreadyInstalled(): boolean {
  const shipped = channelVersionOf(CHANNEL_DIR);
  return shipped !== undefined && channelInstalledVersion() === shipped && channelSiteInstalled();
}

export async function ensureChannel(
  shell: DshShell,
  command: string,
  state: { value: ChannelState },
  ready: () => boolean = channelAlreadyInstalled,
): Promise<boolean> {
  if (state.value === 'ready') return true;
  if (state.value === 'unavailable') return false;
  if (ready()) {
    state.value = 'ready';
    return true;
  }
  const plan = channelPluginPlan({ channelDir: CHANNEL_DIR, command });
  if (plan === undefined) {
    state.value = 'unavailable';
    return false;
  }
  const result = await runShell(shell, plan.line, { timeoutMs: 120_000 });
  state.value = result.exitCode === 0 && !result.timedOut ? 'ready' : 'unavailable';
  return state.value === 'ready';
}

export function channelCommandLine(call: ChannelCall): string {
  return call.argv.map((one) => quoteShellArg(one)).join(' ');
}
