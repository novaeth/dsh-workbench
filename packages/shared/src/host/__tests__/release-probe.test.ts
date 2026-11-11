import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LEDGER_READ_TIMEOUT_MS,
  VERSION_CHECK_FAILURE_TTL_MS,
  VERSION_CHECK_TIMEOUT_MS,
  VERSION_CHECK_TTL_MS,
} from '../../config/constants.js';
import { createFakeShell } from '../../testing/host-fakes.js';
import { createReleaseProbe } from '../release-probe.js';
import { createSeam } from '../seam/run.js';

const ROOT = join(tmpdir(), 'dsh-wb-release-probe');
const REGISTRY = 'https://r.example';
const START = 1_700_000_000_000;

let clock = START;

function harness(replies: Parameters<typeof createFakeShell>[0]) {
  const fake = createFakeShell(replies);
  return { fake, probe: createReleaseProbe(), seam: createSeam({ shell: fake.shell, runtimeRoot: ROOT }) };
}

beforeEach(() => {
  clock = START;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(clock);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('查新版那一次网络请求', () => {
  it('★ 按 registry 问一次、拿网络那档超时，不是本地账本那档', async () => {
    const { fake, probe, seam } = harness([{ stdout: '1.1.5\n' }]);

    await expect(probe.latestVersion({ seam, name: '@a/mod', registry: REGISTRY })).resolves.toBe('1.1.5');

    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.command).toContain('npm view');
    expect(fake.calls[0]?.command).toContain('@a/mod');
    expect(fake.calls[0]?.command).toContain(REGISTRY);
    expect(fake.calls[0]?.timeoutMs).toBe(VERSION_CHECK_TIMEOUT_MS);
    expect(VERSION_CHECK_TIMEOUT_MS).toBeGreaterThan(LEDGER_READ_TIMEOUT_MS);
  });

  it('查到了就在 TTL 内不再问；过了 TTL 才重问', async () => {
    const { fake, probe, seam } = harness([{ stdout: '1.1.5\n' }, { stdout: '1.1.5\n' }]);
    const options = { seam, name: '@a/mod', registry: REGISTRY } as const;

    expect(await probe.latestVersion(options)).toBe('1.1.5');
    expect(await probe.latestVersion(options)).toBe('1.1.5');
    expect(fake.calls).toHaveLength(1);

    vi.setSystemTime(clock + VERSION_CHECK_TTL_MS);
    expect(await probe.latestVersion(options)).toBe('1.1.5');
    expect(fake.calls).toHaveLength(2);
  });

  it('★ npm 不在（Desktop 的 node 不带 npm）→ 退到宿主那份 pnpm 再问一次', async () => {
    const { fake, probe, seam } = harness([
      { exitCode: 127, stderr: 'npm: command not found' },
      { stdout: '1.1.5\n' },
    ]);

    await expect(probe.latestVersion({ seam, name: '@a/mod', registry: REGISTRY })).resolves.toBe('1.1.5');

    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[0]?.command).toContain('npm view');
    expect(fake.calls[1]?.command).toContain('view');
    expect(fake.calls[1]?.command).toContain('@a/mod');
  });

  it('★ 一次超时只锁一分钟：两条命令都失败后，慢源回过神来的下一次就能把版本拿回来', async () => {
    const { fake, probe, seam } = harness([
      { exitCode: 1, stderr: 'ETIMEDOUT' },
      { exitCode: 1, stderr: 'ETIMEDOUT' },
      { stdout: '1.1.5\n' },
    ]);
    const options = { seam, name: '@a/mod', registry: REGISTRY } as const;

    expect(VERSION_CHECK_FAILURE_TTL_MS).toBeLessThan(VERSION_CHECK_TTL_MS);

    expect(await probe.latestVersion(options)).toBeUndefined();
    expect(await probe.latestVersion(options)).toBeUndefined();
    expect(fake.calls).toHaveLength(2);

    vi.setSystemTime(clock + VERSION_CHECK_FAILURE_TTL_MS);
    expect(await probe.latestVersion(options)).toBe('1.1.5');
    expect(fake.calls).toHaveLength(3);
  });

  it('force 绕开缓存：失败的那一分钟也拦不住用户按那一颗 ⟳', async () => {
    const { fake, probe, seam } = harness([
      { exitCode: 1 },
      { exitCode: 1 },
      { stdout: '2.0.0\n' },
    ]);
    const options = { seam, name: '@a/mod', registry: REGISTRY } as const;

    expect(await probe.latestVersion(options)).toBeUndefined();
    expect(await probe.latestVersion({ ...options, force: true })).toBe('2.0.0');
    expect(fake.calls).toHaveLength(3);
  });
});

describe('本地账本与「有没有这一版」', () => {
  it('`npm ls` 那跳按本地那档超时收，不等网络', async () => {
    const { fake, probe, seam } = harness([
      { stdout: JSON.stringify({ dependencies: { '@a/mod': { version: '1.1.4' } } }) },
    ]);

    await expect(probe.probeRelease({ seam, package: '@a/mod', check: false })).resolves.toEqual({
      installed: '1.1.4',
    });
    expect(fake.calls[0]?.command).toContain('npm ls');
    expect(fake.calls[0]?.timeoutMs).toBe(LEDGER_READ_TIMEOUT_MS);
  });

  it('「这一版没有」也是失败：只锁一分钟，不按成功那档锁十分钟', async () => {
    const { fake, probe, seam } = harness(() => ({ exitCode: 1 }));
    const options = { seam, name: '@a/mod', version: '1.0.0', registry: REGISTRY } as const;

    await probe.missingReleaseParts(options);
    const first = fake.calls.length;
    expect(first).toBeGreaterThan(0);

    await probe.missingReleaseParts(options);
    expect(fake.calls).toHaveLength(first);

    vi.setSystemTime(clock + VERSION_CHECK_FAILURE_TTL_MS);
    await probe.missingReleaseParts(options);
    expect(fake.calls.length).toBeGreaterThan(first);
  });
});
