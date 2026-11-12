import { expectTypeOf, it } from 'vitest';

import type {
  BoardProps,
  CardView,
  ClientContext,
  ToolDefinition,
  FlowDefinition,
  HostContext,
  UnitClientApi,
  UnitClientFace,
  UnitModuleFace,
  UnitMountDeps,
  UnitMountResult,
  UnitRegistry,
} from '..';

it('exposes the module protocol from one contract entry', () => {
  expectTypeOf<UnitModuleFace>().toHaveProperty('unit');
  expectTypeOf<UnitModuleFace>().toHaveProperty('mount');
  expectTypeOf<UnitMountDeps>().toHaveProperty('manifest');
  expectTypeOf<UnitMountDeps>().toHaveProperty('data');
  expectTypeOf<UnitMountDeps>().toHaveProperty('flow');
  expectTypeOf<FlowDefinition>().toHaveProperty('steps');
  expectTypeOf<ToolDefinition>().toHaveProperty('execute');
  expectTypeOf<ToolDefinition>().toHaveProperty('parameters');
  expectTypeOf<UnitMountResult>().toHaveProperty('routes');
  expectTypeOf<UnitRegistry>().toHaveProperty('register');
  expectTypeOf<UnitClientFace>().toHaveProperty('unit');
  expectTypeOf<CardView>().toHaveProperty('version');
  expectTypeOf<CardView>().toHaveProperty('read');
  expectTypeOf<CardView>().toHaveProperty('titleKey');
  expectTypeOf<UnitClientApi>().toHaveProperty('registerUnit');
  expectTypeOf<BoardProps>().toHaveProperty('world');
  expectTypeOf<HostContext>().toHaveProperty('effect');
  expectTypeOf<ClientContext>().toHaveProperty('effect');
});

it('accepts a typed schema view on the client face', () => {
  const view: CardView<{ readonly count: number }> = {
    version: 1,
    titleKey: 'inventory.title',
    read: { route: '/inventory', map: () => ({ phase: 'empty', hintKey: 'inventory.empty' }) },
    sections: {
      metrics: (model) => [{ labelKey: 'inventory.count', value: String(model.count) }],
    },
    settings: {
      gearKey: 'inventory.settings',
      titleKey: 'inventory.settings',
      fields: [
        { kind: 'select', key: 'env', labelKey: 'inventory.env', options: [] },
        { kind: 'text', key: 'note', labelKey: 'inventory.note' },
      ],
      values: (model) => ({ env: String(model.count) }),
      save: { route: 'inventory/config', body: (values) => values },
      labels: {
        cancelKey: 'inventory.cancel',
        saveKey: 'inventory.save',
        savingKey: 'inventory.saving',
        failedKey: 'inventory.failed',
      },
    },
    custom: ({ model }) => String(model.count),
  };
  const face: UnitClientFace = { unit: 'inventory', view };

  expectTypeOf(face.view).toEqualTypeOf<CardView | undefined>();
});
