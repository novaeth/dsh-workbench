import type { DataReader } from '../contract/data.js';

export function createNoopDataReader(): DataReader {
  return {
    read: async () => ({
      ok: false,
      error: { code: 'invalid-request', message: '测试没有注入 DataReader' },
    }),
  };
}

export function createFakeDataReader(
  reply: unknown | ((request: Parameters<DataReader['read']>[0], index: number) => unknown) = { ok: true, data: null },
): DataReader & { readonly requests: readonly Parameters<DataReader['read']>[0][] } {
  const requests: Parameters<DataReader['read']>[0][] = [];
  const reader = {
    async read(request: Parameters<DataReader['read']>[0]): Promise<unknown> {
      requests.push(request);
      return typeof reply === 'function' ? reply(request, requests.length - 1) : reply;
    },
  } as unknown as DataReader;
  return Object.assign(reader, { requests });
}

export const fakeDataReader = createFakeDataReader;
