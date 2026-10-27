import type { Translate, UnitTitle } from '@dsh-workbench/shared';
import { unitTitleKey } from '@dsh-workbench/shared';

export type MarketNameMap = ReadonlyMap<string, string>;

export interface NameSource {
  readonly unit: string;
  readonly title?: UnitTitle | undefined;
}

export type TitleResolve = (title: UnitTitle | undefined) => string;

export function namesOf(
  t: Translate,
  modules: readonly NameSource[],
  titleOf: TitleResolve,
): MarketNameMap {
  const shown = new Map<string, string>();
  for (const module of modules) {
    const key = unitTitleKey(module.unit);
    const live = t(key);
    const name = live !== key && live !== '' ? live : titleOf(module.title);
    if (name !== '') shown.set(module.unit, name);
  }
  return shown;
}
