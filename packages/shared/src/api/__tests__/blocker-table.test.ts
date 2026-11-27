import { describe, expect, it } from 'vitest';
import type { Translate } from '../../lib/dsh-client.js';
import type { CapabilityPayload } from '../../contract/workbench-contract.js';
import type { NeedState } from '../../contract/unit-capability.js';
import { blockerOf, blockerOfCapability, blockerOfDiag, blockerOfError } from '../blocker-table.js';
import type { ApiError } from '../workbench-client.js';
import type { ModuleBlocker } from '../../contract/blocker.js';

const t: Translate = (key, params) => (params === undefined ? key : `${key}(${JSON.stringify(params)})`);

describe('blockerOf', () => {
  it('data 的 auth 没带 helpUrl 时，用调用方的 loginUrl 补上', () => {
    const blocker = blockerOf({
      error: { code: 'auth', message: '需要登录' },
      t: ((key: string) => key) as never,
      loginUrl: 'https://oa.example.com/login',
    });
    expect(blocker?.actions.map((one) => one.kind)).toEqual(['open-url', 'retry']);
  });
});

describe('blockerOfError', () => {
  it('data 口的 auth 也能出「去登录」那颗动作', () => {
    const blocker = blockerOfError(
      { code: 'auth', message: '需要登录', helpUrl: 'https://oa.example.com/login' },
      ((key: string) => key) as never,
      { platform: 'OA' },
    );
    expect(blocker.actions.map((one) => one.kind)).toEqual(['open-url', 'retry']);
    expect(blocker.title).toBe('blocker.login.title');
  });
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

  it('未知错误 → 说人话，原文收进详情，并给「复制给 agent」+ 重试', () => {
    const blocker = blockerOfError({ code: 'weird', message: '怪错误' }, t);

    expect(blocker.title).toBe('blocker.unknown.title');
    expect(blocker.detail).toBe('怪错误');
    expect(blocker.actions.map((action) => action.kind)).toEqual(['ask-agent', 'retry']);
    const ask = blocker.actions[0];
    expect(ask?.kind).toBe('ask-agent');
    if (ask?.kind !== 'ask-agent') return;
    expect(ask.label).toBe('askAgent.copy');
    expect(ask.prompt).toContain('askAgent.prompt.where');
    expect(ask.prompt).toContain('"issue":"weird"');
    expect(ask.prompt).toContain('"reason":"怪错误"');
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
    expect(blocker?.actions.map((action) => action.kind)).toEqual(['ask-agent', 'retry']);
    const ask = blocker?.actions[0];
    expect(ask?.kind === 'ask-agent' ? ask.prompt : '').toContain('"step":"issues"');
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

describe('执行类失败的话术由适配器给', () => {
  it('适配器给了 diagnose.exec 就用它，不再说默认那句', () => {
    const blocker = blockerOfError(
      { code: 'cli-exec-failed', message: '跑不起来' },
      t,
      { diagnose: { exec: '确认 MCP server 起得来：npx -y chrome-devtools-mcp@latest' } },
    );
    expect(blocker.hint).toBe('确认 MCP server 起得来：npx -y chrome-devtools-mcp@latest');
  });

  it('适配器没给就回词表那句（opencli 那份）', () => {
    const blocker = blockerOfError({ code: 'cli-exec-failed', message: '跑不起来' }, t);
    expect(blocker.hint).toBe('blocker.exec.hint');
  });

  it('错误自己带的 hint 优先级最高', () => {
    const blocker = blockerOfError(
      { code: 'cli-exec-failed', message: '跑不起来', hint: '端口被占了' },
      t,
      { diagnose: { exec: '确认 MCP server 起得来' } },
    );
    expect(blocker.hint).toBe('端口被占了');
  });
});

describe('blockerOf', () => {
  it('★ 能力闸优先：能力缺东西时，读口错误排在它后面', () => {
    const blocker = blockerOf({
      capability: capability({
        status: 'missing',
        needs: [needOf({ kind: 'extension', name: 'demo', status: 'missing' })],
      }),
      error: { code: 'auth-required', message: '未登录' },
      t,
    });

    expect(blocker?.id).not.toBe('auth-required');
  });

  it('★ 两者都干净：不画任何东西', () => {
    expect(blockerOf({ capability: capability({}), t })).toBeUndefined();
    expect(blockerOf({ t })).toBeUndefined();
  });

  it('★ 没给 helpUrl 时用 loginUrl 补「去登录」', () => {
    const blocker = blockerOf({
      error: { code: 'auth-required', message: '未登录' },
      loginUrl: 'https://example.com/login',
      t,
    });

    expect(blocker?.actions).toContainEqual({
      kind: 'open-url',
      label: 'blocker.login.go',
      url: 'https://example.com/login',
      inline: true,
    });
  });
});

describe('blockerOfDiag', () => {
  const t = ((key: string) => key) as never;

  it('★ 认识的诊断码取它自己的标题，不再是一句通用话', () => {
    const blocker = blockerOfDiag('READ_FAILED', t, '磁盘读不了');

    expect(blocker.id).toBe('diag:READ_FAILED');
    expect(blocker.title).toBe('diag.code.readFailed');
    expect(blocker.detail).toBe('磁盘读不了');
    expect(blocker.actions?.some((one) => one.kind === 'retry')).toBe(true);
  });

  it('★ 不认识的码退回兜底那条，并保留原始码', () => {
    const blocker = blockerOfDiag('NOPE', t);

    expect(blocker.id).toBe('diag:DIAG_UNKNOWN_CODE');
    expect(blocker.title).toBe('diag.code.unknownCode');
  });
});

describe('兜底分支的第三个出口：复制给 agent', () => {
  it('★ 未登记的诊断码 → 「复制给 agent」+ 重试，提示词带码与原文首行', () => {
    const blocker = blockerOfDiag('MY_WEIRD_CODE', t, '原文第一行\n第二行');
    expect(blocker.actions.map((action) => action.kind)).toEqual(['ask-agent', 'retry']);

    const ask = blocker.actions[0];
    expect(ask?.kind).toBe('ask-agent');
    if (ask?.kind !== 'ask-agent') return;
    expect(ask.label).toBe('askAgent.copy');
    expect(ask.prompt).toContain('"issue":"MY_WEIRD_CODE"');
    expect(ask.prompt).toContain('"reason":"原文第一行"');
    expect(ask.prompt).toContain('"screen":"askAgent.screen.board"');
  });

  it('已登记的码不加这颗（原因已经说得清）', () => {
    expect(blockerOfDiag('SELF_UPDATE_FAILED', t).actions.map((action) => action.kind)).toEqual(['retry']);
  });

  it('★ 连错误对象都没有：也要有出口（复制 + 重试）', () => {
    expect(blockerOfError(undefined, t).actions.map((action) => action.kind)).toEqual(['ask-agent', 'retry']);
  });

  it('调用方能指定屏幕与步骤（配置同步 / 具体模块）', () => {
    const blocker = blockerOfError({ code: 'weird', message: 'x' }, t, {
      ask: { screen: 'askAgent.screen.settings', step: 'my-unit' },
    });
    const ask = blocker.actions[0];
    expect(ask?.kind).toBe('ask-agent');
    if (ask?.kind !== 'ask-agent') return;
    expect(ask.prompt).toContain('"screen":"askAgent.screen.settings"');
    expect(ask.prompt).toContain('"step":"my-unit"');
  });
});

describe('故障面出口矩阵：每个分支都有下一步', () => {
  const ACTION_KINDS = new Set(['open-url', 'copy', 'retry', 'run-fix', 'open-market', 'ask-agent']);
  const ERROR_CODES = [
    'auth',
    'auth-required',
    'permission-denied',
    'cli-timeout',
    'cli-exec-failed',
    'project-unsupported',
    'weird',
  ] as const;
  const CAPABILITY_STATUSES = ['ok', 'degraded', 'missing', 'outdated', 'unchecked', 'unsupported', 'failed'] as const;
  const NEED_STATUSES = ['ok', 'missing', 'outdated', 'unsatisfied', 'unchecked'] as const;

  function allBlockers(): ModuleBlocker[] {
    return [
      blockerOfError(undefined, t),
      blockerOfDiag('SELF_UPDATE_FAILED', t),
      blockerOfDiag('NOT_REGISTERED', t),
      ...ERROR_CODES.map((code) => blockerOfError({ code, message: 'x' } as ApiError, t)),
      ...CAPABILITY_STATUSES.map((status) => blockerOfCapability(capability({ status }), t)),
      ...NEED_STATUSES.map((status) =>
        blockerOfCapability(capability({ needs: [needOf({ kind: 'bin', name: 'git', status })] }), t),
      ),
    ].filter((one): one is ModuleBlocker => one !== undefined);
  }

  it('★ 每个分支至少一颗动作，且动作种类都在协议里（没有一条路是死的）', () => {
    const blockers = allBlockers();

    expect(blockers.length).toBeGreaterThan(10);
    for (const blocker of blockers) {
      expect(blocker.actions.length, blocker.id).toBeGreaterThan(0);
      for (const action of blocker.actions) {
        expect(ACTION_KINDS.has(action.kind), `${blocker.id}:${action.kind}`).toBe(true);
      }
    }
  });

  it('★ 认不出原因的分支必须有「复制给 agent」', () => {
    const fallbacks: readonly (ModuleBlocker | undefined)[] = [
      blockerOfError(undefined, t),
      blockerOfError({ code: 'weird', message: 'x' } as ApiError, t),
      blockerOfDiag('NOT_REGISTERED', t),
      blockerOfCapability(capability({ status: 'failed' }), t),
    ];

    for (const blocker of fallbacks) {
      expect(blocker?.actions.some((action) => action.kind === 'ask-agent'), blocker?.id).toBe(true);
    }
  });

  it('★ 带关联号的错误：提示词里能对上那条记录', () => {
    const blocker = blockerOfError({ code: 'boom', message: '炸了', diag: { corrId: 'abc12345' } }, t);
    const ask = blocker.actions.find((action) => action.kind === 'ask-agent');
    expect(ask?.kind === 'ask-agent' ? ask.prompt : '').toContain('abc12345');
  });

  it('有确定解释的分支不硬塞「复制给 agent」', () => {
    const known = [
      blockerOfError({ code: 'auth-required', message: '需要登录' } as ApiError, t),
      blockerOfDiag('SELF_UPDATE_FAILED', t),
    ];

    for (const blocker of known) {
      expect(blocker.actions.some((action) => action.kind === 'ask-agent'), blocker.id).toBe(false);
    }
  });
});
