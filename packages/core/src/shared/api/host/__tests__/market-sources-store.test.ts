import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createMarketSourcesStore } from '../market-sources-store';

const root = mkdtempSync(path.join(os.tmpdir(), 'wb-sources-store-'));

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('索引源那份本地文件：顺手记住「上次哪种传输通了」', () => {
  it('记一次、读回来还在，且不影响 sources 那部分', async () => {
    const store = createMarketSourcesStore({ root });
    const before = store.read();
    expect(before.transports ?? {}).toEqual({});

    await store.rememberTransport('e.coding.net', 'ssh');
    const after = store.read();
    expect(after.transports).toEqual({ 'e.coding.net': 'ssh' });
    expect(after.sources).toEqual(before.sources);
  });

  it('同一个 host 再记一次就覆盖；文件里写坏的值直接丢掉', async () => {
    const store = createMarketSourcesStore({ root });
    await store.rememberTransport('e.coding.net', 'https');
    expect(store.read().transports).toEqual({ 'e.coding.net': 'https' });
  });

  it('空 host 不记（免得写一条没有主机的偏好）', async () => {
    const store = createMarketSourcesStore({ root });
    await store.rememberTransport('', 'ssh');
    expect(store.read().transports).toEqual({ 'e.coding.net': 'https' });
  });
});
