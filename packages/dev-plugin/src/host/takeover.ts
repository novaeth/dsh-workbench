import { CHANGES_ROUTE, READ_ROUTES } from '@dsh-workbench/testkit';

const API_PREFIX = '/workbench/api';

export type TakeoverKind = 'read' | 'write';

export interface TakeoverRoute {
  readonly route: string;
  readonly kind: TakeoverKind;
}

export const READ_TAKEOVER: readonly TakeoverRoute[] = READ_ROUTES.filter(
  (route) => route !== CHANGES_ROUTE,
).map((route) => ({ route, kind: 'read' as const }));

export const WRITE_TAKEOVER: readonly TakeoverRoute[] = [
  { route: 'provision', kind: 'write' },
  { route: 'prefs/panels', kind: 'write' },
];

export const TAKEOVER_ROUTES: readonly TakeoverRoute[] = [...READ_TAKEOVER, ...WRITE_TAKEOVER];

export function pathOf(route: string): string {
  return `${API_PREFIX}/${route}`;
}

export function validateTakeover(routes: readonly TakeoverRoute[]): readonly string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const item of routes) {
    if (item.route === '') problems.push('接管清单里有空路由');
    if (item.route.startsWith('/')) problems.push(`接管路由不能带前导斜杠：${item.route}`);
    if (seen.has(item.route)) problems.push(`接管路由重复：${item.route}`);
    seen.add(item.route);
    const known = READ_ROUTES.includes(item.route as (typeof READ_ROUTES)[number]) ||
      item.kind === 'write';
    if (!known) problems.push(`接管路由没有对应的投影：${item.route}`);
  }
  if (routes.length === 0) problems.push('接管清单是空的');
  return problems;
}
