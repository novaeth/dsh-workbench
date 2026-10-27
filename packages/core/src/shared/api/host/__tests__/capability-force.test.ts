import { describe, expect, it } from 'vitest';
import type { CapabilityPayload } from '@dsh-workbench/shared';
import { capabilityHandler } from '@dsh-workbench/shared/host';

const payload = (unit: string): CapabilityPayload => ({
  unit,
  status: 'ok',
  needs: [],
  detail: '假探测',
});

describe('capabilityHandler：force 一路传下去', () => {
  it('不带 `force` → 探测收到 false（后台读取照旧吃 TTL）', async () => {
    const seen: boolean[] = [];
    const handler = capabilityHandler((unit, force) => {
      seen.push(force);
      return unit === undefined ? { units: [payload('inventory')] } : payload(unit);
    });

    const body = await handler(new URLSearchParams('unit=inventory'));

    expect(seen).toEqual([false]);
    expect(body).toMatchObject({ ok: true, unit: 'inventory' });
  });

  it('★ `?force=1` → 探测收到 true（页头 ⟳ / 进页面判为"没有结论或过旧"补的那一次走这条）', async () => {
    const seen: Array<{ unit: string | undefined; force: boolean }> = [];
    const handler = capabilityHandler((unit, force) => {
      seen.push({ unit, force });
      return payload('inventory');
    });

    const body = await handler(new URLSearchParams('unit=inventory&force=1'));

    expect(seen).toEqual([{ unit: 'inventory', force: true }]);
    expect(body).toMatchObject({ ok: true, unit: 'inventory' });
  });

  it('不带 `unit` = 一次回答全部套件，force 照样透传', async () => {
    const seen: Array<string | undefined> = [];
    const handler = capabilityHandler((unit, force) => {
      seen.push(unit);
      return { units: force ? [payload('inventory')] : [] };
    });

    const body = await handler(new URLSearchParams('force=1'));

    expect(seen).toEqual([undefined]);
    expect(body).toMatchObject({ ok: true, units: [payload('inventory')] });
  });

  it('未知单元 → 既有错误码（`workbench/unknown-unit`），force 不改这条', async () => {
    const handler = capabilityHandler(() => undefined);

    const body = await handler(new URLSearchParams('unit=nope&force=1'));

    expect(body).toMatchObject({ ok: false, error: { code: 'workbench/unknown-unit' } });
  });
});
