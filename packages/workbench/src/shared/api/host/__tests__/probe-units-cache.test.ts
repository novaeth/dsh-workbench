import { afterEach, describe, expect, it, vi } from 'vitest';
import { PROBE_TTL_MS } from '@dsh-workbench/shared';
import { probeUnits, resetProbeCache } from '../probe-units';
import { createFakeShell } from '@dsh-workbench/shared/testing';

afterEach(() => {
  vi.restoreAllMocks();
  resetProbeCache();
});

const unitsOf = (id: string) => [{ unit: id, plugins: [{ name: 'demo', commands: ['issues'] }] }];

const listOf = (commands: string[]) => ({ stdout: JSON.stringify([{ name: 'demo', commands }]) });

describe('probeUnits 的保鲜期', () => {
  it('保鲜期内**不重探**（一轮 `plugin list` 回答所有套件，重复读不吃进程）', async () => {
    const fake = createFakeShell([listOf(['issues'])]);
    const units = unitsOf('cache-hit');

    const first = await probeUnits({ shell: fake.shell, units });
    const second = await probeUnits({ shell: fake.shell, units });

    expect(fake.calls).toHaveLength(1);
    expect(second).toEqual(first);
  });

  it('★ 过期之后必须**重探**：永久记忆会把"插件没装"永远答下去', async () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1_000);
    const fake = createFakeShell([
      { stdout: JSON.stringify([{ name: 'deploy', commands: [] }]) },
      listOf(['issues']),
    ]);
    const units = unitsOf('cache-expire');

    expect((await probeUnits({ shell: fake.shell, units }))[0]?.status).toBe('missing-plugin');
    expect((await probeUnits({ shell: fake.shell, units }))[0]?.status).toBe('missing-plugin');
    expect(fake.calls).toHaveLength(1);

    now.mockReturnValue(1_000 + PROBE_TTL_MS);
    expect((await probeUnits({ shell: fake.shell, units }))[0]?.status).toBe('ok');
    expect(fake.calls).toHaveLength(2);
  });

  it('`force`（用户按的 ⟳ / 刚动过机器）不吃保鲜期，一律重探', async () => {
    const fake = createFakeShell([
      { stdout: JSON.stringify([{ name: 'deploy', commands: [] }]) },
      listOf(['issues']),
    ]);
    const units = unitsOf('cache-force');

    expect((await probeUnits({ shell: fake.shell, units, force: true }))[0]?.status).toBe('missing-plugin');
    expect((await probeUnits({ shell: fake.shell, units, force: true }))[0]?.status).toBe('ok');
    expect(fake.calls).toHaveLength(2);
  });
});
