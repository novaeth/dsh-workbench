import * as defaultAdapters from '@dsh-workbench/adapters-default';
import type { DshHostContext } from '@dsh-workbench/shared';
import type { WorkbenchAdapters } from '@dsh-workbench/shared/host';
import { createFakeDataReader,
} from '@dsh-workbench/shared/testing';

const ctx = { get: () => undefined } as unknown as DshHostContext;

export const testAdapters: WorkbenchAdapters = {
  ...defaultAdapters.createAdapterSet(ctx),
  data: createFakeDataReader(),
};
