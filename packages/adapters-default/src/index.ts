export * from '@dsh-workbench/adapter-runtime';
export * from '@dsh-workbench/adapter-supply';
export * from '@dsh-workbench/adapter-profile';
export * from '@dsh-workbench/adapter-probe';

export interface AdapterDescriptor {
  readonly id: 'opencli' | 'browser' | 'supply' | 'profile' | 'probe' | 'data';
  readonly runtime: 'host';
}

export const DEFAULT_ADAPTERS: readonly AdapterDescriptor[] = Object.freeze([
  Object.freeze({ id: 'opencli', runtime: 'host' }),
  Object.freeze({ id: 'browser', runtime: 'host' }),
  Object.freeze({ id: 'supply', runtime: 'host' }),
  Object.freeze({ id: 'profile', runtime: 'host' }),
  Object.freeze({ id: 'probe', runtime: 'host' }),
  Object.freeze({ id: 'data', runtime: 'host' }),
]);
export { createSupplyPort } from './supply-port.js';

export { createAdapterSet, DEFAULT_ADAPTER_SET_ID } from './adapter-set.js';
