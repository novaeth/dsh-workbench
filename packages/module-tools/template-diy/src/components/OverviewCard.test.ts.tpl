import { describe, expect, it, vi } from 'vitest';

const shell = vi.hoisted(() => ({
  resource: { phase: 'loading' } as {
    readonly phase: string;
    readonly value?: unknown;
    readonly error?: { readonly code: string; readonly message: string };
  },
  readEnabled: undefined as boolean | undefined,
}));

vi.mock('@dsh-workbench/core/client', () => ({
  kit: {
    hooks: {
      useApiResource: (_route: string, _query: unknown, _refreshToken: number, options?: { readonly enabled?: boolean }) => {
        shell.readEnabled = options?.enabled;
        return shell.resource;
      },
    },
    components: {
      Card: () => null,
      CenteredState: () => null,
      EmptyState: () => null,
      StateBlock: () => null,
      IconPanelScreen: () => null,
      Rows: () => null,
      Row: () => null,
    },
  },
}));

import { OverviewCard } from './OverviewCard';

function textOf(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    out.push(value);
    return out;
  }
  if (typeof value === 'number') {
    out.push(String(value));
    return out;
  }
  if (typeof value === 'boolean' || value === null || value === undefined) return out;
  if (Array.isArray(value)) {
    for (const one of value) textOf(one, out);
    return out;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const source = 'type' in record && 'props' in record ? (record.props as Record<string, unknown>) : record;
    for (const one of Object.values(source)) {
      if (typeof one !== 'function') textOf(one, out);
    }
  }
  return out;
}

const cardProps = {
  path: '/tmp/__UNIT__-workspace',
  refreshToken: 1,
  onRefresh: () => {},
  t: (key: string) => key,
};

describe('OverviewCard：待机 / 加载 / 就绪 / 就绪但空 / 出错', () => {
  it('没有选中工作区时不发请求，画待机那一屏', () => {
    shell.resource = { phase: 'idle' };

    expect(textOf(OverviewCard({ ...cardProps, path: '' })).join(' ')).toContain('__UNIT__.needProject');
    expect(shell.readEnabled).toBe(false);

    shell.resource = { phase: 'loading' };
    expect(textOf(OverviewCard(cardProps)).join(' ')).not.toContain('__UNIT__.needProject');
    expect(shell.readEnabled).toBe(true);
  });

  it('五态各画得出来', () => {
    shell.resource = { phase: 'loading' };
    expect(textOf(OverviewCard(cardProps)).join(' ')).toContain('__UNIT__.loading');

    shell.resource = { phase: 'error', error: { code: 'internal', message: 'boom' } };
    expect(textOf(OverviewCard(cardProps)).join(' ')).toContain('internal: boom');

    shell.resource = {
      phase: 'ready',
      value: {
        ok: true,
        path: '/real/workbench',
        files: 2,
        dirs: 1,
        bytes: 2048,
        largest: [{ name: 'big.bin', bytes: 2048, mtime: '2026-01-02T03:04:05.000Z' }],
      },
    };
    const ready = textOf(OverviewCard(cardProps)).join(' ');
    expect(ready).toContain('/real/workbench');
    expect(ready).toContain('big.bin');
    expect(ready).toContain('2.0 KB');
    expect(ready).toContain('__UNIT__.fileUnit');
    expect(ready).toContain('__UNIT__.largest');

    shell.resource = {
      phase: 'ready',
      value: { ok: true, path: '/real/empty', files: 0, dirs: 0, bytes: 0, largest: [] },
    };
    expect(textOf(OverviewCard(cardProps)).join(' ')).toContain('__UNIT__.empty');
  });

  it('刷新中旧数据还在（不退回加载态）', () => {
    shell.resource = {
      phase: 'loading',
      value: { ok: true, path: '/real/workbench', files: 1, dirs: 0, bytes: 10, largest: [] },
    };
    const text = textOf(OverviewCard(cardProps)).join(' ');
    expect(text).toContain('/real/workbench');
    expect(text).not.toContain('__UNIT__.loading');
  });
});
