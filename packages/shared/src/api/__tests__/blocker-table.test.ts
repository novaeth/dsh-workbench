import { describe, expect, it } from 'vitest';
import type { Translate } from '../../lib/dsh-client.js';
import type { CapabilityPayload } from '../../contract/workbench-contract.js';
import type { NeedState } from '../../contract/unit-capability.js';
import { blockerOfCapability, blockerOfError } from '../blocker-table.js';

const t: Translate = (key, params) => (params === undefined ? key : `${key}(${JSON.stringify(params)})`);

describe('blockerOfError', () => {
  it('未登录 + 有登录页地址 → 行内「去登录 ↗」+ 一颗手动「重试」（不安排自动重试）', () => {
    const blocker = blockerOfError(
      { code: 'auth-required', message: '未登录 Acme', helpUrl: 'https://example.com/login' },
      t,
    );

    expect(blocker.id).toBe('auth-required');
    expect(blocker.severity).toBe('block');
    expect(blocker.actions).toEqual([
      {
        kind: 'open-url',
        label: 'blocker.login.go',
        url: 'https://example.com/login',
        inline: true,
      },
      { kind: 'retry', label: 'blocker.retry' },
    ]);
    expect(blocker.hint).toBe('blocker.login.hint');
  });

  it('平台名由**调用方**给（同一个"未登录"能服务不同平台）', () => {
    const demo = blockerOfError(
      { code: 'auth-required', message: '未登录', helpUrl: 'https://example.com/login' },
      t,
      { platform: 'Acme' },
    );
    const inventory = blockerOfError(
      { code: 'auth-required', message: '未登录', helpUrl: 'https://inventory.example.cn/login' },
      t,
      { platform: 'Inventory' },
    );

    expect(demo.title).toContain('"platform":"Acme"');
    expect(inventory.title).toContain('"platform":"Inventory"');
    expect(inventory.actions[0]).toMatchObject({ kind: 'open-url', url: 'https://inventory.example.cn/login' });
  });

  it('没给平台名 → 用不带名字的文案（不猜平台）', () => {
    const blocker = blockerOfError({ code: 'auth-required', message: '未登录' }, t);

    expect(blocker.title).toBe('blocker.login.titleGeneric');
  });

  it('未登录但没有地址 → 不给点不动的按钮，退回终端指引', () => {
    const blocker = blockerOfError({ code: 'auth-required', message: '未登录' }, t);

    expect(blocker.actions.map((action) => action.kind)).toEqual(['retry']);
    expect(blocker.hint).toBe('blocker.login.manual');
  });

  it('权限不足 → block，主动作「打开权限页」（地址同样来自信封）', () => {
    const blocker = blockerOfError(
      { code: 'permission-denied', message: '没有权限', helpUrl: 'https://example.com/p/x/settings' },
      t,
      { platform: 'Acme' },
    );

    expect(blocker.id).toBe('permission-denied');
    expect(blocker.severity).toBe('block');
    expect(blocker.title).toContain('"platform":"Acme"');
    expect(blocker.actions[0]).toMatchObject({ kind: 'open-url', url: 'https://example.com/p/x/settings' });
  });

  it('权限不足但没有地址 → 只给重试（不编一个页面出来）', () => {
    const blocker = blockerOfError({ code: 'permission-denied', message: '没有权限' }, t);

    expect(blocker.actions.map((action) => action.kind)).toEqual(['retry']);
    expect(blocker.title).toBe('blocker.forbidden.titleGeneric');
  });

  it('平台专属的（"不是 X 仓库"）**不归本表管** → 走兜底，由平台层覆盖', () => {
    const blocker = blockerOfError({ code: 'project-unsupported', message: '这个目录没有可关联的远程仓库' }, t);

    expect(blocker.title).toBe('这个目录没有可关联的远程仓库');
    expect(blocker.actions.map((action) => action.kind)).toEqual(['retry']);
  });

  it('超时 → notice + 重试（不是"坏了"）', () => {
    const blocker = blockerOfError({ code: 'cli-timeout', message: '超时了' }, t);

    expect(blocker.severity).toBe('notice');
    expect(blocker.actions.map((action) => action.kind)).toEqual(['retry']);
  });

  it('未知错误 → 照原样说，并给重试', () => {
    const blocker = blockerOfError({ code: 'weird', message: '怪错误' }, t);

    expect(blocker.title).toBe('怪错误');
    expect(blocker.actions.map((action) => action.kind)).toEqual(['retry']);
  });

  it('没有错误对象 → 兜底文案 + 重试（不炸）', () => {
    expect(blockerOfError(undefined, t).title).toBe('blocker.unknown.title');
  });
});

function needOf(patch: Partial<NeedState> & { kind: NeedState['kind']; name: string }): NeedState {
  return { id: patch.id ?? `${patch.kind}:${patch.name}`, status: 'ok', detail: '', ...patch };
}

function capability(patch: Partial<CapabilityPayload>): CapabilityPayload {
  return { unit: 'issues', status: 'ok', needs: [], ...patch };
}

describe('blockerOfCapability', () => {
  it('就绪 → 没有阻断', () => {
    expect(blockerOfCapability(capability({}), t)).toBeUndefined();
    expect(
      blockerOfCapability(
        capability({ needs: [needOf({ kind: 'extension', name: 'demo', status: 'ok' })] }),
        t,
      ),
    ).toBeUndefined();
  });

  it('★ 缺哪些命令只出现在 detail（排障区），标题里没有命令名', () => {
    const blocker = blockerOfCapability(
      capability({
        status: 'missing',
        needs: [
          needOf({
            kind: 'extension',
            name: 'demo',
            status: 'missing',
            missing: ['issue-detail'],
            detail: '1 份安装都在（缺必需：issue-detail）',
          }),
        ],
      }),
      t,
    );

    expect(blocker?.title).not.toContain('issue-detail');
    expect(blocker?.detail).toContain('issue-detail');
  });

  it('★ 起不来（模块自己装配炸了）→ 只说"起不来" + 原样附原因，不给装/卸按钮', () => {
    const blocker = blockerOfCapability(
      capability({ status: 'failed', detail: '模块自己的 bug：kit.components.StateBlock 取不到' }),
      t,
    );

    expect(blocker?.id).toBe('unit-mount-failed');
    expect(blocker?.title).toBe('env.unit.failed');
    expect(blocker?.detail).toBe('模块自己的 bug：kit.components.StateBlock 取不到');
    expect(blocker?.hint).toBe('env.unit.failedHint');
    expect(blocker?.actions.map((action) => action.kind)).toEqual(['retry']);
  });

  it('★ 未知 kind（模块跑在更新的工作台上）→ 单独一档，叫升级工作台，不猜怎么修', () => {
    const blocker = blockerOfCapability(
      capability({ status: 'unsupported', detail: 'needs[0].kind 不认识 —— "dsh-bundle"' }),
      t,
    );

    expect(blocker?.id).toBe('unit-unsupported');
    expect(blocker?.title).toBe('env.unit.unsupported');
    expect(blocker?.severity).toBe('block');
    expect(blocker?.actions.map((action) => action.kind)).toEqual(['retry']);
  });

  it('★ 可选的没装（required: false）→ notice，不挡卡片', () => {
    const blocker = blockerOfCapability(
      capability({
        status: 'degraded',
        needs: [needOf({ kind: 'bin', name: 'gitops', status: 'missing', detail: '这台机器上找不到 gitops' })],
      }),
      t,
    );

    expect(blocker?.id).toBe('unit-degraded');
    expect(blocker?.severity).toBe('notice');
    expect(blocker?.detail).toContain('gitops');
  });

  it('★ 缺二进制命令 → 标题按 kind 出（不是"缺插件"），并给复制命令', () => {
    const blocker = blockerOfCapability(
      capability({
        status: 'missing',
        needs: [needOf({ kind: 'bin', name: 'gitops', status: 'missing', command: 'brew install gitops' })],
      }),
      t,
    );

    expect(blocker?.id).toBe('unit-need-bin-missing');
    expect(blocker?.title).toBe('env.need.bin.missing');
    expect(blocker?.actions.map((action) => action.kind)).toEqual(['copy', 'retry']);
  });

  it('extension 装了但版本旧 → 标题是「版本旧了」那一档，不是「没装」', () => {
    const blocker = blockerOfCapability(
      capability({
        status: 'outdated',
        needs: [needOf({ kind: 'extension', name: 'demo', status: 'outdated' })],
      }),
      t,
    );

    expect(blocker?.id).toBe('unit-need-extension-outdated');
    expect(blocker?.title).toBe('env.need.extension.outdated');
  });

  it('来源解析得出 → 主动作是「帮我安装」+ 复制命令', () => {
    const blocker = blockerOfCapability(
      capability({
        status: 'missing',
        needs: [
          needOf({
            kind: 'extension',
            name: 'demo',
            status: 'missing',
            provision: 'ready',
            command: 'opencli plugin install /some/path',
          }),
        ],
      }),
      t,
    );

    expect(blocker?.actions.map((action) => action.kind)).toEqual(['run-fix', 'copy', 'retry']);
    expect(blocker?.actions[0]).toEqual({
      kind: 'run-fix',
      label: 'blocker.fix.install',
      unit: 'issues',
      fix: 'install',
    });
  });

  it('★ 来源解析不出（provision 不是 ready）→ 给「去模块市场」，不给注定失败的按钮', () => {
    for (const install of ['env-missing', 'not-declared', 'malformed'] as const) {
      const blocker = blockerOfCapability(
        capability({
          status: 'missing',
          needs: [
            needOf({
              kind: 'extension',
              name: 'demo',
              status: 'missing',
              command: 'opencli plugin install <demo 插件源>',
              provision: install,
            }),
          ],
        }),
        t,
      );

      expect(blocker?.actions.map((action) => action.kind)).toEqual(['open-market', 'retry']);
      expect(blocker?.actions[0]).toMatchObject({ unit: 'issues' });
    }
  });

  it('共用依赖版本不对 → 那一档标题', () => {
    const blocker = blockerOfCapability(
      capability({
        status: 'missing',
        needs: [needOf({ kind: 'lib', name: 'opencli-workflow', status: 'unsatisfied' })],
      }),
      t,
    );

    expect(blocker?.title).toBe('env.need.lib.unsatisfied');
  });

  it('环境变量没设 → 只提醒，不给复制值', () => {
    const blocker = blockerOfCapability(
      capability({
        status: 'missing',
        needs: [needOf({ kind: 'env', name: 'DSH_TOKEN', status: 'missing' })],
      }),
      t,
    );

    expect(blocker?.title).toBe('env.need.env.missing');
    expect(blocker?.actions.map((action) => action.kind)).toEqual(['retry']);
  });

  it('★ 只看第一条非 ok 的 need（顺序即优先级）', () => {
    const blocker = blockerOfCapability(
      capability({
        status: 'missing',
        needs: [
          needOf({ kind: 'bin', name: 'gitops', status: 'missing' }),
          needOf({ kind: 'extension', name: 'demo', status: 'missing' }),
        ],
      }),
      t,
    );

    expect(blocker?.title).toBe('env.need.bin.missing');
  });

  it('探不动 → notice，**绝不**说成缺命令/缺插件，也不给"复制安装命令"', () => {
    const blocker = blockerOfCapability(
      capability({
        status: 'unchecked',
        needs: [needOf({ kind: 'extension', name: 'demo', status: 'unchecked', detail: '拿不到执行通道' })],
      }),
      t,
    );

    expect(blocker?.id).toBe('unit-unchecked');
    expect(blocker?.severity).toBe('notice');
    expect(blocker?.title).toBe('env.unit.unchecked');
    expect(blocker?.actions.map((action) => action.kind)).toEqual(['retry']);
  });
});
