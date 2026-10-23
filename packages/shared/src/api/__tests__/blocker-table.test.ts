import { describe, expect, it } from 'vitest';
import type { Translate } from '../dsh-client.js';
import type { CapabilityPayload } from '../workbench-contract.js';
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

function capability(patch: Partial<CapabilityPayload>): CapabilityPayload {
  return {
    unit: 'issues',
    status: 'ok',
    required: [],
    missing: [],
    detail: '',
    ...patch,
  };
}

describe('blockerOfCapability', () => {
  it('就绪 → 没有阻断', () => {
    expect(blockerOfCapability(capability({}), t)).toBeUndefined();
  });

  it('就绪 → 没有阻断（**没有**"能凑合用但提示一下"的中间态了，见 ADR-0016）', () => {
    expect(blockerOfCapability(capability({ status: 'ok', plugin: 'demo' }), t)).toBeUndefined();
  });

  it('★ 缺哪些命令只出现在 detail（排障区），标题里没有命令名', () => {
    const blocker = blockerOfCapability(
      capability({
        status: 'missing-commands',
        plugin: 'demo',
        missing: ['issue-detail'],
        detail: '1 份安装都在（缺必需：issue-detail）',
      }),
      t,
    );

    expect(blocker?.title).not.toContain('issue-detail');
    expect(blocker?.detail).toContain('issue-detail');
  });

  it('降级那一档已经不存在（`ok` 就是没阻断）', () => {
    expect(blockerOfCapability(capability({ status: 'ok', plugin: 'demo' }), t)).toBeUndefined();
  });

  it('★ 起不来（模块自己装配炸了）→ 只说"起不来" + 把宿主给的原因原样附上，不给装/卸的按钮', () => {
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

  it('★ 没装好 → 标题只说"这个模块还没装好"，**不点名插件**（用户不认识插件）', () => {
    const blocker = blockerOfCapability(
      capability({
        status: 'missing-plugin',
        plugin: 'demo',
        missing: ['issues'],
        command: 'opencli plugin install <demo 插件源>',
      }),
      t,
    );

    expect(blocker?.id).toBe('unit-missing-plugin');
    expect(blocker?.title).toBe('env.unit.missingPlugin');
    expect(blocker?.title).not.toContain('demo');
    expect(blocker?.hint).not.toContain('插件');
    expect(blocker?.actions.map((action) => action.kind)).toEqual(['copy', 'retry']);
  });

  it('能一键修时，主动作是「帮我升级」并带上 { action, unit }（命令由宿主侧决定）', () => {
    const blocker = blockerOfCapability(
      capability({ status: 'missing-commands', plugin: 'demo', missing: ['issue-detail'], fix: 'update' }),
      t,
    );

    expect(blocker?.actions[0]).toEqual({
      kind: 'run-fix',
      label: 'blocker.fix.update',
      unit: 'issues',
      fix: 'update',
    });
  });

  it('★ 来源解析不出（宿主给了 install 但不是 ready）→ 给「去模块市场」，不给注定失败的按钮', () => {
    for (const install of ['env-missing', 'not-declared', 'malformed'] as const) {
      const blocker = blockerOfCapability(
        capability({
          status: 'missing-plugin',
          plugin: 'demo',
          command: 'opencli plugin install <demo 插件源>',
          install,
        }),
        t,
      );

      expect(blocker?.actions.map((action) => action.kind)).toEqual(['open-market', 'retry']);
      expect(blocker?.actions[0]).toMatchObject({ unit: 'issues' });
    }
  });

  it('来源解析得出时仍然给「帮我安装」+ 复制命令（open-market 不该抢戏）', () => {
    const blocker = blockerOfCapability(
      capability({
        status: 'missing-plugin',
        plugin: 'demo',
        command: 'opencli plugin install /some/path',
        install: 'ready',
        fix: 'install',
      }),
      t,
    );

    expect(blocker?.actions.map((action) => action.kind)).toEqual(['run-fix', 'copy', 'retry']);
  });

  it('缺插件且有来源 → 主动作是「帮我安装」', () => {
    const blocker = blockerOfCapability(
      capability({ status: 'missing-plugin', plugin: 'demo', fix: 'install' }),
      t,
    );

    expect(blocker?.actions[0]?.kind).toBe('run-fix');
    expect(blocker?.actions[0]?.label).toBe('blocker.fix.install');
    expect(blocker?.actions[0]).toMatchObject({ fix: 'install', unit: 'issues' });
  });

  it('缺命令（版本旧）→ 也给「帮我升级」', () => {
    const blocker = blockerOfCapability(
      capability({ status: 'missing-commands', plugin: 'demo', missing: ['issue-detail'], fix: 'update' }),
      t,
    );

    expect(blocker?.actions[0]?.kind).toBe('run-fix');
    expect(blocker?.actions[0]?.label).toBe('blocker.fix.update');
  });

  it('缺命令 → 列出缺哪几个，并提示多半是版本旧', () => {
    const blocker = blockerOfCapability(
      capability({ status: 'missing-commands', plugin: 'demo', missing: ['issue-detail'] }),
      t,
    );

    expect(blocker?.id).toBe('unit-missing-commands');
    expect(blocker?.title).toBe('env.unit.missingCommands');
    expect(blocker?.title).not.toContain('issue-detail');
    expect(blocker?.hint).toBe('env.unit.missingCommandsHint');
  });

  it('探不动 → notice，**绝不**说成缺命令/缺插件，也不给"复制安装命令"', () => {
    const blocker = blockerOfCapability(
      capability({ status: 'unchecked', plugin: 'demo', missing: ['issues', 'issue-detail'], detail: '拿不到执行通道' }),
      t,
    );

    expect(blocker?.id).toBe('unit-unchecked');
    expect(blocker?.severity).toBe('notice');
    expect(blocker?.title).toBe('env.unit.unchecked');
    expect(blocker?.actions.map((action) => action.kind)).toEqual(['retry']);
    expect(blocker?.title).not.toContain('issue-detail');
  });
});
