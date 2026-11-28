import { createElement as h } from 'react';
import { kit } from '@dsh-workbench/core/client';
import type { ClientContext, UnitClientApi, UnitClientFace } from '@dsh-workbench/core/contract';

const UNIT = 'fixture';

const fixtureClient: UnitClientFace = {
  unit: UNIT,
  card: ({ t, onRefresh }) =>
    h(
      kit.components.Card,
      { t, title: t('fixture.title'), refreshing: false, onRefresh },
      h('span', null, 'fixture card'),
    ),
  messages: {
    zh: { 'fixture.title': '夹具模块' },
    en: { 'fixture.title': 'Fixture module' },
  },
};

export const inject = ['workbenchUnits'];

function unitApiOf(ctx: ClientContext): UnitClientApi | undefined {
  return (ctx.get as (name: string) => UnitClientApi | undefined)('workbenchUnits');
}

export function apply(ctx: ClientContext): void {
  const api = unitApiOf(ctx);
  if (api === undefined) {
    console.warn('[fixture] 外壳没有提供 workbenchUnits 服务');
    return;
  }
  ctx.effect(() => api.registerUnit(fixtureClient), 'module-fixture: 注册 fixture');
}
