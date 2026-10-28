import { expectTypeOf, it } from 'vitest';

import type {
  BoardProps,
  ClientContext,
  FlowDefinition,
  HostContext,
  UnitClientApi,
  UnitClientFace,
  UnitModuleFace,
  UnitMountDeps,
  UnitMountResult,
  UnitRegistry,
} from './index';

it('exposes the module protocol from one contract entry', () => {
  expectTypeOf<UnitModuleFace>().toHaveProperty('unit');
  expectTypeOf<UnitModuleFace>().toHaveProperty('mount');
  expectTypeOf<UnitMountDeps>().toHaveProperty('manifest');
  expectTypeOf<UnitMountDeps>().toHaveProperty('data');
  expectTypeOf<UnitMountDeps>().toHaveProperty('flow');
  expectTypeOf<FlowDefinition>().toHaveProperty('steps');
  expectTypeOf<UnitMountResult>().toHaveProperty('routes');
  expectTypeOf<UnitRegistry>().toHaveProperty('register');
  expectTypeOf<UnitClientFace>().toHaveProperty('unit');
  expectTypeOf<UnitClientApi>().toHaveProperty('registerUnit');
  expectTypeOf<BoardProps>().toHaveProperty('world');
  expectTypeOf<HostContext>().toHaveProperty('effect');
  expectTypeOf<ClientContext>().toHaveProperty('effect');
});
