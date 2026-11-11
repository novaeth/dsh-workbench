import { afterEach, describe, expect, it } from 'vitest';
import { PLUGIN_ID, RELEASE_PACKAGES } from '@dsh-workbench/shared/host';
import { createFakeShell, type ShellCall, type ShellReply } from '@dsh-workbench/shared/testing';
import { createSeam } from '@dsh-workbench/shared/host';
import { createReleasePort, isNewerVersion, parseLedgerVersion } from '../index.js';

const release = createReleasePort({ prefix: '/tmp/wb-release-prefix' });
const { latestVersion, missingReleaseParts, probeRelease } = release;
const resetReleaseCache = release.reset;

afterEach(() => {
  resetReleaseCache();
});

const PKG = 'opencli-plugin-demo';
const REGISTRY = 'https://npm.example.com/team/repo';

function releaseShell(replies: {
  ledger?: ShellReply;
  view?: ShellReply;
  seen?: string[];
}) {
  const fake = createFakeShell((call: ShellCall): ShellReply => {
    replies.seen?.push(call.command);
    if (call.command.includes('npm ls')) return replies.ledger ?? { exitCode: 1, stdout: '{}' };
    if (call.command.includes('npm view')) return replies.view ?? { stdout: '' };
    return { stdout: '[]' };
  });
  return { ...fake, seam: createSeam({ shell: fake.shell, runtimeRoot: '/tmp/wb-seam-test' }) };
}

const ledgerWith = (version: string): ShellReply => ({
  stdout: JSON.stringify({ dependencies: { [PKG]: { version } } }),
});

describe('parseLedgerVersion（读我们隔离 prefix 的 npm 账本，不翻插件目录）', () => {
  it('账本里有这个包 → 版本', () => {
    expect(parseLedgerVersion(ledgerWith('1.0.39').stdout ?? '', PKG)).toBe('1.0.39');
  });

  it('账本里没有它 / 读不懂 → undefined（= 这份不是我们装的，没有信号）', () => {
    expect(parseLedgerVersion(JSON.stringify({ dependencies: {} }), PKG)).toBeUndefined();
    expect(parseLedgerVersion('{},', PKG)).toBeUndefined();
    expect(parseLedgerVersion(JSON.stringify({ dependencies: { [PKG]: {} } }), PKG)).toBeUndefined();
    expect(parseLedgerVersion(JSON.stringify({ dependencies: { [PKG]: { version: 'latest' } } }), PKG)).toBeUndefined();
  });
});

describe('isNewerVersion', () => {
  it('按数字段比：1.0.40 > 1.0.39，1.0.10 > 1.0.9', () => {
    expect(isNewerVersion('1.0.40', '1.0.39')).toBe(true);
    expect(isNewerVersion('1.0.10', '1.0.9')).toBe(true);
    expect(isNewerVersion('2.0.0', '1.9.9')).toBe(true);
  });

  it('相等 → 没有更新', () => {
    expect(isNewerVersion('1.0.39', '1.0.39')).toBe(false);
  });

  it('预发布也按 SemVer 的先后比：1.0.40-beta.1 > 1.0.39', () => {
    expect(isNewerVersion('1.0.40-beta.1', '1.0.39')).toBe(true);
  });

  it('同号的正式版高于预发布：1.0.0 > 1.0.0-beta.0', () => {
    expect(isNewerVersion('1.0.0', '1.0.0-beta.0')).toBe(true);
  });
});

describe('latestVersion（问源）', () => {
  it('问到就用', async () => {
    const fake = releaseShell({ view: { stdout: '1.0.40\n' } });
    expect(await latestVersion({ seam: fake.seam, name: PKG, registry: REGISTRY })).toBe('1.0.40');
    expect(fake.calls[0]?.command).toContain(`--registry '${REGISTRY}'`);
    expect(fake.calls[0]?.command).not.toContain('--cache');
  });

  it('输出不是版本号 / 退出码非 0 → undefined（没有信号，不是错误）', async () => {
    const noisy = releaseShell({ view: { stdout: 'not-a-version\n' } });
    expect(await latestVersion({ seam: noisy.seam, name: PKG, registry: REGISTRY })).toBeUndefined();

    const failed = releaseShell({ view: { exitCode: 1, stdout: '1.0.40' } });
    expect(await latestVersion({ seam: failed.seam, name: PKG, registry: REGISTRY })).toBeUndefined();
  });

  it('源上说最新是哪版就是哪版（预发布与否交给 dist-tag 决定）', async () => {
    const fake = releaseShell({ view: { stdout: '1.0.0-beta.0\n' } });
    expect(await latestVersion({ seam: fake.seam, name: PKG, registry: REGISTRY })).toBe('1.0.0-beta.0');
  });

  it('★ 打开 includePrerelease：问整张版本表，取最高的那一版（含预发布）', async () => {
    const fake = createFakeShell((call: ShellCall): ShellReply =>
      call.command.includes('npm view')
        ? { stdout: JSON.stringify(['1.0.39', '1.0.40', '1.0.41-beta.1']) }
        : { stdout: '' },
    );
    const seam = createSeam({ shell: fake.shell, runtimeRoot: '/tmp/wb-seam-test' });

    expect(await latestVersion({ seam, name: PKG, registry: REGISTRY, includePrerelease: true })).toBe(
      '1.0.41-beta.1',
    );
    expect(fake.calls[0]?.command).toContain('versions --json');
  });

  it('默认只问 latest：不会因为源上有预发布就提示更新', async () => {
    const fake = createFakeShell((call: ShellCall): ShellReply =>
      call.command.includes('npm view')
        ? { stdout: call.command.includes('versions --json') ? JSON.stringify(['1.0.41-beta.1']) : '1.0.40\n' }
        : { stdout: '' },
    );
    const seam = createSeam({ shell: fake.shell, runtimeRoot: '/tmp/wb-seam-test' });

    expect(await latestVersion({ seam, name: PKG, registry: REGISTRY })).toBe('1.0.40');
    expect(fake.calls[0]?.command).not.toContain('versions --json');
  });

  it('有 TTL 记忆：第二次不再问；force 会再问', async () => {
    const fake = releaseShell({ view: { stdout: '1.0.40' } });
    await latestVersion({ seam: fake.seam, name: PKG, registry: REGISTRY });
    await latestVersion({ seam: fake.seam, name: PKG, registry: REGISTRY });
    expect(fake.calls).toHaveLength(1);

    await latestVersion({ seam: fake.seam, name: PKG, registry: REGISTRY, force: true });
    expect(fake.calls).toHaveLength(2);
  });

  it('问失败也记住（不会每次进面板都重敲），force 才重试', async () => {
    const fake = releaseShell({ view: { exitCode: 1 } });
    await latestVersion({ seam: fake.seam, name: PKG, registry: REGISTRY });
    await latestVersion({ seam: fake.seam, name: PKG, registry: REGISTRY });
    expect(fake.calls).toHaveLength(2);
    expect(fake.calls.map((call) => call.command)).toEqual([
      expect.stringContaining('npm view'),
      expect.stringContaining('view'),
    ]);
  });
});

describe('probeRelease', () => {
  it('版本来自我们隔离 prefix 的账本，最新版来自源 → 完整信号', async () => {
    const fake = releaseShell({ ledger: ledgerWith('1.0.39'), view: { stdout: '1.0.40' } });

    const release = await probeRelease({ seam: fake.seam, package: PKG, registry: REGISTRY });

    expect(release).toEqual({ installed: '1.0.39', latest: '1.0.40' });
  });

  it('★ 打开 includePrerelease：探测到的最新版也可以是预发布', async () => {
    const fake = createFakeShell((call: ShellCall): ShellReply => {
      if (call.command.includes('npm ls')) return ledgerWith('1.0.39');
      if (call.command.includes('npm view')) return { stdout: JSON.stringify(['1.0.39', '1.0.40-beta.0']) };
      return { stdout: '' };
    });
    const seam = createSeam({ shell: fake.shell, runtimeRoot: '/tmp/wb-seam-test' });

    expect(await probeRelease({ seam, package: PKG, registry: REGISTRY, includePrerelease: true })).toEqual({
      installed: '1.0.39',
      latest: '1.0.40-beta.0',
    });
  });

  it('不是我们装的那份（账本里没有）→ **没有信号**，连源都不问', async () => {
    const seen: string[] = [];
    const fake = releaseShell({ ledger: { exitCode: 1, stdout: '{}' }, view: { stdout: '1.0.40' }, seen });

    expect(await probeRelease({ seam: fake.seam, package: PKG, registry: REGISTRY })).toBeUndefined();
    expect(seen.filter((line) => line.includes('npm view'))).toHaveLength(0);
  });

  it('没声明源（机器没设那个环境变量）→ 只给"我们装的是哪版"，没有"最新"', async () => {
    const fake = releaseShell({ ledger: ledgerWith('1.0.39') });

    const release = await probeRelease({ seam: fake.seam, package: PKG });

    expect(release).toEqual({ installed: '1.0.39' });
  });

  it('包名是空的 → 什么都不问（连账本都不翻）', async () => {
    const fake = releaseShell({ ledger: ledgerWith('1.0.39') });

    expect(await probeRelease({ seam: fake.seam, package: '' })).toBeUndefined();
    expect(fake.calls).toHaveLength(0);
  });
});

describe('missingReleaseParts（这一份发布在源上铺齐了没）', () => {
  const VERSION = '0.2.1';
  const ROOT = PLUGIN_ID;
  const PARTS = RELEASE_PACKAGES.filter((name) => name !== ROOT);
  const SHARED = '@dsh-workbench/shared';
  const TOOLS = '@dsh-workbench/module-tools';

  function sourceShell(published: Readonly<Record<string, readonly string[]>>) {
    const fake = createFakeShell((call: ShellCall): ShellReply => {
      const spec = (/npm view (\S+)/.exec(call.command)?.[1] ?? '').replace(/^'|'$/g, '');
      const cut = spec.lastIndexOf('@');
      const name = cut <= 0 ? spec : spec.slice(0, cut);
      const asked = cut <= 0 ? '' : spec.slice(cut + 1);
      const known = published[name] ?? [];
      const hit = asked === '' ? known.at(-1) : known.includes(asked) ? asked : undefined;
      return hit === undefined ? { exitCode: 1, stdout: '' } : { stdout: `${hit}\n` };
    });
    return { ...fake, seam: createSeam({ shell: fake.shell, runtimeRoot: '/tmp/wb-seam-test' }) };
  }

  it('同一次发布的平台包都在这一版上 → 没有缺的；记住之后不再重问', async () => {
    const fake = sourceShell(Object.fromEntries(RELEASE_PACKAGES.map((name) => [name, [VERSION]])));

    expect(await missingReleaseParts({ seam: fake.seam, name: ROOT, registry: REGISTRY, version: VERSION })).toEqual(
      [],
    );
    expect(fake.calls).toHaveLength(PARTS.length);
    expect(fake.commands().some((line) => line.includes(`${SHARED}@${VERSION}`))).toBe(true);

    expect(await missingReleaseParts({ seam: fake.seam, name: ROOT, registry: REGISTRY, version: VERSION })).toEqual(
      [],
    );
    expect(fake.calls).toHaveLength(PARTS.length);
  });

  it('兄弟包这一版还没铺到 → 报出名字（调用方据此先不给「更新」）', async () => {
    const fake = sourceShell({ ...Object.fromEntries(PARTS.map((name) => [name, [VERSION]])), [TOOLS]: ['0.2.0'] });

    expect(await missingReleaseParts({ seam: fake.seam, name: ROOT, registry: REGISTRY, version: VERSION })).toEqual([
      TOOLS,
    ]);
  });

  it('缺的也记住（10 分钟内不重问），force 才再问一遍', async () => {
    const fake = sourceShell({ ...Object.fromEntries(PARTS.map((name) => [name, [VERSION]])), [TOOLS]: ['0.2.0'] });

    await missingReleaseParts({ seam: fake.seam, name: ROOT, registry: REGISTRY, version: VERSION });
    await missingReleaseParts({ seam: fake.seam, name: ROOT, registry: REGISTRY, version: VERSION });
    const first = fake.calls.length;
    expect(first).toBeGreaterThanOrEqual(PARTS.length);

    await missingReleaseParts({ seam: fake.seam, name: ROOT, registry: REGISTRY, version: VERSION, force: true });
    expect(fake.calls).toHaveLength(first * 2);
  });

  it('问炸了 / 回的不是版本号 → 算"还没铺开"（宁可晚一次提示，也不给人装半份）', async () => {
    const dead = createFakeShell(() => ({ exitCode: 1, stdout: '' }));
    const deadSeam = createSeam({ shell: dead.shell, runtimeRoot: '/tmp/wb-seam-test' });
    expect(await missingReleaseParts({ seam: deadSeam, name: ROOT, registry: REGISTRY, version: VERSION })).toEqual(
      PARTS,
    );

    const noisy = createFakeShell(() => ({ stdout: 'not-a-version\n' }));
    const noisySeam = createSeam({ shell: noisy.shell, runtimeRoot: '/tmp/wb-seam-test' });
    expect(await missingReleaseParts({ seam: noisySeam, name: ROOT, registry: REGISTRY, version: VERSION })).toEqual(
      PARTS,
    );
  });
});
