import { afterEach, describe, expect, it } from 'vitest';
import { PLUGIN_ID, RELEASE_PACKAGES } from '@dsh-workbench/shared/host';
import { createFakeShell, type ShellCall, type ShellReply } from '@dsh-workbench/shared/testing';
import {
  isNewerVersion,
  latestVersion,
  missingReleaseParts,
  parseLedgerVersion,
  probeRelease,
  resetReleaseCache,
} from '../index.js';

afterEach(() => {
  resetReleaseCache();
});

const PKG = 'opencli-plugin-demo';
const REGISTRY = 'https://npm.example.com/team/repo';

function shellOf(replies: {
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
  return fake;
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
    const fake = shellOf({ view: { stdout: '1.0.40\n' } });
    expect(await latestVersion({ shell: fake.shell, name: PKG, registry: REGISTRY })).toBe('1.0.40');
    expect(fake.calls[0]?.command).toContain(`--registry '${REGISTRY}'`);
    expect(fake.calls[0]?.command).toContain('--cache');
  });

  it('输出不是版本号 / 退出码非 0 → undefined（没有信号，不是错误）', async () => {
    const noisy = shellOf({ view: { stdout: 'not-a-version\n' } });
    expect(await latestVersion({ shell: noisy.shell, name: PKG, registry: REGISTRY })).toBeUndefined();

    const failed = shellOf({ view: { exitCode: 1, stdout: '1.0.40' } });
    expect(await latestVersion({ shell: failed.shell, name: PKG, registry: REGISTRY })).toBeUndefined();
  });

  it('源上说最新是哪版就是哪版（预发布与否交给 dist-tag 决定）', async () => {
    const fake = shellOf({ view: { stdout: '1.0.0-beta.0\n' } });
    expect(await latestVersion({ shell: fake.shell, name: PKG, registry: REGISTRY })).toBe('1.0.0-beta.0');
  });

  it('有 TTL 记忆：第二次不再问；force 会再问', async () => {
    const fake = shellOf({ view: { stdout: '1.0.40' } });
    await latestVersion({ shell: fake.shell, name: PKG, registry: REGISTRY });
    await latestVersion({ shell: fake.shell, name: PKG, registry: REGISTRY });
    expect(fake.calls).toHaveLength(1);

    await latestVersion({ shell: fake.shell, name: PKG, registry: REGISTRY, force: true });
    expect(fake.calls).toHaveLength(2);
  });

  it('问失败也记住（不会每次进面板都重敲），force 才重试', async () => {
    const fake = shellOf({ view: { exitCode: 1 } });
    await latestVersion({ shell: fake.shell, name: PKG, registry: REGISTRY });
    await latestVersion({ shell: fake.shell, name: PKG, registry: REGISTRY });
    expect(fake.calls).toHaveLength(1);
  });
});

describe('probeRelease', () => {
  it('版本来自我们隔离 prefix 的账本，最新版来自源 → 完整信号', async () => {
    const fake = shellOf({ ledger: ledgerWith('1.0.39'), view: { stdout: '1.0.40' } });

    const release = await probeRelease({ shell: fake.shell, package: PKG, registry: REGISTRY });

    expect(release).toEqual({ installed: '1.0.39', latest: '1.0.40' });
  });

  it('不是我们装的那份（账本里没有）→ **没有信号**，连源都不问', async () => {
    const seen: string[] = [];
    const fake = shellOf({ ledger: { exitCode: 1, stdout: '{}' }, view: { stdout: '1.0.40' }, seen });

    expect(await probeRelease({ shell: fake.shell, package: PKG, registry: REGISTRY })).toBeUndefined();
    expect(seen.filter((line) => line.includes('npm view'))).toHaveLength(0);
  });

  it('没声明源（机器没设那个环境变量）→ 只给"我们装的是哪版"，没有"最新"', async () => {
    const fake = shellOf({ ledger: ledgerWith('1.0.39') });

    const release = await probeRelease({ shell: fake.shell, package: PKG });

    expect(release).toEqual({ installed: '1.0.39' });
  });

  it('包名是空的 → 什么都不问（连账本都不翻）', async () => {
    const fake = shellOf({ ledger: ledgerWith('1.0.39') });

    expect(await probeRelease({ shell: fake.shell, package: '' })).toBeUndefined();
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
    return createFakeShell((call: ShellCall): ShellReply => {
      const spec = (/npm view (\S+)/.exec(call.command)?.[1] ?? '').replace(/^'|'$/g, '');
      const cut = spec.lastIndexOf('@');
      const name = cut <= 0 ? spec : spec.slice(0, cut);
      const asked = cut <= 0 ? '' : spec.slice(cut + 1);
      const known = published[name] ?? [];
      const hit = asked === '' ? known.at(-1) : known.includes(asked) ? asked : undefined;
      return hit === undefined ? { exitCode: 1, stdout: '' } : { stdout: `${hit}\n` };
    });
  }

  it('同一次发布的平台包都在这一版上 → 没有缺的；记住之后不再重问', async () => {
    const fake = sourceShell(Object.fromEntries(RELEASE_PACKAGES.map((name) => [name, [VERSION]])));

    expect(await missingReleaseParts({ shell: fake.shell, name: ROOT, registry: REGISTRY, version: VERSION })).toEqual(
      [],
    );
    expect(fake.calls).toHaveLength(PARTS.length);
    expect(fake.commands().some((line) => line.includes(`${SHARED}@${VERSION}`))).toBe(true);

    expect(await missingReleaseParts({ shell: fake.shell, name: ROOT, registry: REGISTRY, version: VERSION })).toEqual(
      [],
    );
    expect(fake.calls).toHaveLength(PARTS.length);
  });

  it('兄弟包这一版还没铺到 → 报出名字（调用方据此先不给「更新」）', async () => {
    const fake = sourceShell({ ...Object.fromEntries(PARTS.map((name) => [name, [VERSION]])), [TOOLS]: ['0.2.0'] });

    expect(await missingReleaseParts({ shell: fake.shell, name: ROOT, registry: REGISTRY, version: VERSION })).toEqual([
      TOOLS,
    ]);
  });

  it('缺的也记住（10 分钟内不重问），force 才再问一遍', async () => {
    const fake = sourceShell({ ...Object.fromEntries(PARTS.map((name) => [name, [VERSION]])), [TOOLS]: ['0.2.0'] });

    await missingReleaseParts({ shell: fake.shell, name: ROOT, registry: REGISTRY, version: VERSION });
    await missingReleaseParts({ shell: fake.shell, name: ROOT, registry: REGISTRY, version: VERSION });
    expect(fake.calls).toHaveLength(PARTS.length);

    await missingReleaseParts({ shell: fake.shell, name: ROOT, registry: REGISTRY, version: VERSION, force: true });
    expect(fake.calls).toHaveLength(PARTS.length * 2);
  });

  it('问炸了 / 回的不是版本号 → 算"还没铺开"（宁可晚一次提示，也不给人装半份）', async () => {
    const dead = createFakeShell(() => ({ exitCode: 1, stdout: '' }));
    expect(await missingReleaseParts({ shell: dead.shell, name: ROOT, registry: REGISTRY, version: VERSION })).toEqual(
      PARTS,
    );

    const noisy = createFakeShell(() => ({ stdout: 'not-a-version\n' }));
    expect(await missingReleaseParts({ shell: noisy.shell, name: ROOT, registry: REGISTRY, version: VERSION })).toEqual(
      PARTS,
    );
  });
});
