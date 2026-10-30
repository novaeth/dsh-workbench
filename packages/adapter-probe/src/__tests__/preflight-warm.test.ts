import { describe, expect, it } from 'vitest';
import { canWarm, createPreflight } from '../index.js';
import type { Preflight } from '../index.js';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import { ALL_OK, BROKEN_BRIDGE, GOOD_BRIDGE_REPORT, STALE_DAEMON_BRIDGE, build } from './preflight-fixtures';

describe('启动预热站点登录态（ADR-0024）', () => {
  const TWO_READS = (): readonly (readonly string[])[] => [
    ['inventory', 'enterprises'],
    ['demo', 'issues', '--team', 'example-team', '--project', 'example-project', '--pageSize', '1'],
  ];

  it('没声明要预热 → 根本没有这一步（老行为不变）', async () => {
    const { preflight } = build(ALL_OK);

    const snapshot = await preflight.run();

    expect(snapshot.steps.map((item) => item.id)).toEqual(['cli', 'bridge']);
  });

  it('★ bridge 通了 → 每个站点跑一条套件声明的读命令（并行），step=ok 且带上站点数', async () => {
    const { fake, preflight } = build(
      [...ALL_OK, { stdout: '{}' }, { stdout: '{}' }],
      undefined,
      TWO_READS,
    );

    const snapshot = await preflight.run();

    expect(snapshot.phase).toBe('ready');
    expect(snapshot.steps.map((item) => `${item.id}=${item.status}`)).toEqual([
      'cli=ok',
      'bridge=ok',
      'warm=ok',
    ]);
    expect(snapshot.steps[2]?.detail).toBe('2');
    expect(fake.commands().slice(2)).toEqual([
      "'opencli' 'inventory' 'enterprises' --site-session persistent -f json",
      "'opencli' 'demo' 'issues' '--team' 'example-team' '--project' 'example-project' '--pageSize' '1' --site-session persistent -f json",
    ]);
    expect(fake.peak()).toBe(2);
  });

  it('★ 有站点没预热上 → 只 warn，照样放行（面板第一次读取会自己补）', async () => {
    const { preflight } = build(
      [...ALL_OK, { exitCode: 1, stderr: 'navigate failed' }, { stdout: '{}' }],
      undefined,
      TWO_READS,
    );

    const snapshot = await preflight.run();

    expect(snapshot.phase).toBe('ready');
    expect(snapshot.steps[2]?.status).toBe('warn');
    expect(snapshot.steps[2]?.detail).toContain('inventory enterprises');
  });

  it('★ bridge 只是「daemon 没起来 / 版本不匹配」→ 照样预热（下一条浏览器命令自己会把它治好）', async () => {
    expect(canWarm({ ok: false, issues: ['stale'] })).toBe(true);
    expect(canWarm({ ok: false, issues: ['daemon'] })).toBe(true);
    expect(canWarm({ ok: false, issues: ['daemon', 'stale'] })).toBe(true);
    expect(canWarm({ ok: false, issues: ['extension'] })).toBe(false);
    expect(canWarm({ ok: false, issues: ['profile'] })).toBe(false);
    expect(canWarm({ ok: false, issues: ['daemon', 'extension'] })).toBe(false);
    expect(canWarm({ ok: false, issues: ['unknown'] })).toBe(false);
    expect(canWarm({ ok: true, issues: [] })).toBe(true);
  });

  it('★ 扩展没连上 / profile 没选（用户得先动手）→ 不预热（不白等这一跳），只记一笔', async () => {
    const { fake, preflight } = build([{ stdout: '1.8.8\n' }, { stdout: BROKEN_BRIDGE }], undefined, TWO_READS);

    const snapshot = await preflight.run();

    expect(snapshot.phase).toBe('ready');
    expect(snapshot.steps[2]?.status).toBe('warn');
    expect(fake.commands()).toEqual(['opencli --version', 'opencli doctor']);
  });

  it('★ doctor 说 daemon 没起来、可预热那条命令自己把通道跑通了 → 结论留到自愈之后再给：中途不闪「没连上」，复检后桥接翻成 ok', async () => {
    const replies = [
      { stdout: '1.8.7\n' },
      { stdout: STALE_DAEMON_BRIDGE },
      { stdout: '{}' },
      { stdout: GOOD_BRIDGE_REPORT },
    ];
    const midflight: string[] = [];
    const holder: { preflight?: Preflight } = {};
    const fake = createFakeShell((_call, index) => {
      if (index === 2) midflight.push(holder.preflight?.snapshot().steps[1]?.status ?? '?');
      return replies[index] ?? {};
    });
    const preflight = createPreflight({ shell: fake.shell, warmReads: () => [['inventory', 'enterprises']] });
    holder.preflight = preflight;

    const snapshot = await preflight.run();

    expect(midflight).toEqual(['running']);
    expect(snapshot.phase).toBe('ready');
    expect(snapshot.steps.map((item) => `${item.id}=${item.status}`)).toEqual([
      'cli=ok',
      'bridge=ok',
      'warm=ok',
    ]);
    expect(snapshot.bridgeIssues).toBeUndefined();
    expect(snapshot.steps[1]?.command).toBeUndefined();
    expect(fake.commands()).toEqual([
      'opencli --version',
      'opencli doctor',
      "'opencli' 'inventory' 'enterprises' --site-session persistent -f json",
      'opencli doctor',
    ]);
  });

  it('★ 同一形状但预热也没跑通、复检还是没连上 → 桥接 warn + 给那条命令（这时候真需要人动手）', async () => {
    const { fake, preflight } = build(
      [
        { stdout: '1.8.7\n' },
        { stdout: STALE_DAEMON_BRIDGE },
        { exitCode: 1, stderr: 'nope' },
        { stdout: STALE_DAEMON_BRIDGE },
      ],
      undefined,
      () => [['inventory', 'enterprises']],
    );

    const snapshot = await preflight.run();

    expect(snapshot.steps[1]?.status).toBe('warn');
    expect(snapshot.steps[2]?.status).toBe('warn');
    expect(snapshot.bridgeIssues).toEqual(['daemon']);
    expect(snapshot.steps[1]?.command).toContain('daemon restart');
    expect(snapshot.steps[1]?.detail).toContain('Stale daemon detected');
    expect(fake.commands()).toEqual([
      'opencli --version',
      'opencli doctor',
      "'opencli' 'inventory' 'enterprises' --site-session persistent -f json",
      'opencli doctor',
    ]);
  });

  it('★ 预热没跑通但复检说通道是好的 → 分开说：桥接 ok，预热只 warn（这次没热上，不影响用）', async () => {
    const { preflight } = build(
      [
        { stdout: '1.8.7\n' },
        { stdout: STALE_DAEMON_BRIDGE },
        { exitCode: 1, stderr: 'nope' },
        { stdout: GOOD_BRIDGE_REPORT },
      ],
      undefined,
      () => [['inventory', 'enterprises']],
    );

    const snapshot = await preflight.run();

    expect(snapshot.steps.map((item) => `${item.id}=${item.status}`)).toEqual([
      'cli=ok',
      'bridge=ok',
      'warm=warn',
    ]);
    expect(snapshot.bridgeIssues).toBeUndefined();
  });

  it('★ 预热超时（站点慢/标签页卡住）→ warn，不卡死在这', async () => {
    const { preflight } = build(
      [...ALL_OK, { timedOut: true }, { stdout: '{}' }],
      undefined,
      () => [['inventory', 'enterprises']],
    );

    const snapshot = await preflight.run();

    expect(snapshot.phase).toBe('ready');
    expect(snapshot.steps[2]?.status).toBe('warn');
  });
});
