import { describe, expect, it } from 'vitest';
import type { Translate } from '@dsh-workbench/shared';
import type { InstallFailure } from '@dsh-workbench/shared';
import { failureCardOf, ownerLabel, shellPath } from '../failure-card-text';

const t: Translate = (key, params) => {
  if (params === undefined) return key;
  return Object.keys(params)
    .sort()
    .reduce((text, name) => text.replaceAll(`{${name}}`, String(params[name])), key);
};

function failure(over: Partial<InstallFailure> = {}): InstallFailure {
  return {
    kind: 'permission',
    command: 'npm i --prefix /x/libs opencli-workflow@1.1.24 --cache /x/npm-cache',
    exitCode: 255,
    output: 'npm error code EACCES',
    path: '/x',
    mode: '755',
    owner: { uid: 0, gid: 0 },
    current: { uid: 502, gid: 20 },
    fix: { kind: 'chown', path: '/x', uid: 502, gid: 20 },
    ...over,
  };
}

describe('failureCardOf（卡片上那三行 + 能照抄的那条）', () => {
  it('属主不对 → 主句说没权限，事实点名是谁的，修法是 chown 回自己', () => {
    const card = failureCardOf(failure(), t);

    expect(card.title).toBe('panels.market.failure.permission');
    expect(card.fact).toBe('panels.market.failure.factOwner');
    expect(card.fix).toBe('sudo chown -R 502:20 /x');
    expect(card.fixLabel).toBe('panels.market.failure.copyFix');
    expect(card.command).toContain('opencli-workflow');
    expect(card.exitCode).toBe(255);
  });

  it('只是没写位 → chmod，不唬人跑 sudo', () => {
    const card = failureCardOf(
      failure({ fix: { kind: 'chmod', path: '/x' }, owner: { uid: 502, gid: 20 } }),
      t,
    );

    expect(card.fix).toBe('chmod -R u+w /x');
  });

  it('被沙箱拦的 → 不是命令，是给 agent 的一段话（带命令、路径、退出码）', () => {
    const withParams: Translate = (key, params) =>
      params === undefined ? key : `${key} ${JSON.stringify(params)}`;
    const card = failureCardOf(failure({ kind: 'sandbox', fix: { kind: 'handoff' } }), withParams);

    expect(card.fixLabel).toBe('panels.market.failure.askAgent');
    expect(card.fix).toContain('npm i --prefix /x/libs');
    expect(card.fix).toContain('/x');
    expect(card.fix).toContain('255');
  });

  it('盘满 → 给一条能看出谁占了地方的命令', () => {
    const card = failureCardOf(failure({ kind: 'disk-full', fix: { kind: 'space', path: '/x' } }), t);

    expect(card.fix).toBe('du -sh /x');
  });

  it('带空格的路径要能直接粘进终端', () => {
    expect(shellPath('/Users/a b/x')).toBe("'/Users/a b/x'");
    expect(shellPath('/Users/ksen/.dsh')).toBe('/Users/ksen/.dsh');
  });

  it('uid 0 说 root，别的说 uid', () => {
    expect(ownerLabel(0)).toBe('root');
    expect(ownerLabel(502)).toBe('uid 502');
  });
});
