import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VERSION_CHECK_TIMEOUT_MS, VERSION_CHECK_TTL_MS } from '../../config/constants.js';
import { createFakeShell } from '../../testing/host-fakes.js';
import { createRegistryLookup } from '../registry-declaration.js';
import { createSeam } from '../seam/run.js';

const ROOT = join(tmpdir(), 'dsh-wb-registry-declaration');
const REGISTRY = 'https://r.example';
const START = 1_700_000_000_000;

let clock = START;

function harness(replies: Parameters<typeof createFakeShell>[0]) {
  const fake = createFakeShell(replies);
  return { fake, lookup: createRegistryLookup(), seam: createSeam({ shell: fake.shell, runtimeRoot: ROOT }) };
}

beforeEach(() => {
  clock = START;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(clock);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('问源上那一版声明了什么', () => {
  it('★ 走网络那档超时（跟本地账本不是一档），命令是问同一个 registry', async () => {
    const { fake, lookup, seam } = harness([{ stdout: JSON.stringify({ workbench: { unit: 'hello' } }) }]);

    await expect(
      lookup.registryDeclarationOf({ seam, name: '@a/mod', registry: REGISTRY }),
    ).resolves.toEqual({ unit: 'hello' });

    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.command).toContain('npm view');
    expect(fake.calls[0]?.command).toContain('@a/mod');
    expect(fake.calls[0]?.command).toContain(REGISTRY);
    expect(fake.calls[0]?.timeoutMs).toBe(VERSION_CHECK_TIMEOUT_MS);
  });

  it('问到了就在 TTL 内接着用，不再打源', async () => {
    const { fake, lookup, seam } = harness([{ stdout: JSON.stringify({ workbench: { unit: 'hello' } }) }]);
    const options = { seam, name: '@a/mod', registry: REGISTRY } as const;

    await lookup.registryDeclarationOf(options);
    await lookup.registryDeclarationOf(options);
    expect(fake.calls).toHaveLength(1);

    vi.setSystemTime(clock + VERSION_CHECK_TTL_MS);
    await lookup.registryDeclarationOf(options);
    expect(fake.calls).toHaveLength(2);
  });

  it('★ 问不到不当答案存着：下一次照问，不留一个「没有声明」的假结论', async () => {
    const { fake, lookup, seam } = harness([
      { exitCode: 1, stderr: 'ETIMEDOUT' },
      { stdout: JSON.stringify({ workbench: { unit: 'hello' } }) },
    ]);
    const options = { seam, name: '@a/mod', registry: REGISTRY } as const;

    await expect(lookup.registryDshOf(options)).resolves.toEqual({ readable: false, raw: undefined });
    await expect(lookup.registryDshOf(options)).resolves.toEqual({
      readable: true,
      raw: { workbench: { unit: 'hello' } },
    });
    expect(fake.calls).toHaveLength(2);
  });
});
