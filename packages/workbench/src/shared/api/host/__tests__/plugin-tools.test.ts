import { describe, expect, it } from 'vitest';
import type { PluginCommand } from '../plugin-catalog';
import {
  pluginApprovalFor,
  pluginApprovalQuestion,
  pluginKeyArgs,
  pluginToolArgv,
  pluginToolDescription,
  pluginToolName,
  pluginToolParameters,
  pluginToolSession,
  pluginToolWrites,
} from '../plugin-tools';

const COMMAND: PluginCommand = {
  plugin: 'inventory',
  name: 'build',
  description: 'Inventory 一键构建',
  access: 'write',
  browser: true,
  siteSession: '',
  args: [
    {
      name: 'enterprise',
      type: 'string',
      required: true,
      positional: false,
      valueRequired: false,
      choices: ['tencent', 'acme'],
      help: '企业 ID',
    },
    {
      name: 'jobs',
      type: 'int',
      required: false,
      positional: false,
      valueRequired: false,
      choices: [],
      defaultValue: 3,
      help: '并发数',
    },
    {
      name: 'dry',
      type: 'boolean',
      required: false,
      positional: false,
      valueRequired: false,
      choices: [],
      help: '',
    },
  ],
};

describe('工具名：<插件名>_<命令名> 归一化', () => {
  it('带横杠的插件名与命令名都归一成 sdk 名', () => {
    expect(pluginToolName('inventory', 'build')).toBe('inventory_build');
    expect(pluginToolName('acme-permission', 'page-add')).toBe('acme_permission_page_add');
    expect(pluginToolName('demo', 'scan-dupblock-detail')).toBe('demo_scan_dupblock_detail');
  });
});

describe('参数 schema 从 args[] 逐条来', () => {
  it('type / required / default / choices(enum) / help(description) 都映射上', () => {
    const schema = pluginToolParameters(COMMAND) as {
      properties: Record<string, Record<string, unknown>>;
      required: string[];
      additionalProperties: boolean;
    };
    expect(schema.required).toEqual(['enterprise', 'approval_note']);
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties['enterprise']).toEqual({
      type: 'string',
      description: '企业 ID',
      enum: ['tencent', 'acme'],
    });
    expect(schema.properties['jobs']).toEqual({ type: 'integer', description: '并发数', default: 3 });
    expect(schema.properties['dry']).toEqual({ type: 'boolean' });
  });

  it('没写 access 的命令也是写：附注照样必填', () => {
    const schema = pluginToolParameters({ ...COMMAND, access: '', args: COMMAND.args.slice(2) }) as {
      required?: string[];
    };
    expect(schema.required).toEqual(['approval_note']);
  });

  it('没有必填参数时不带 required（不是空数组）', () => {
    const schema = pluginToolParameters({ ...COMMAND, access: 'read', args: COMMAND.args.slice(2) });
    expect(schema['required']).toBeUndefined();
  });

  it('认不出的 type 退回 string（不把参数丢掉）', () => {
    const schema = pluginToolParameters({
      ...COMMAND,
      args: [{ ...COMMAND.args[0]!, type: 'weird' }],
    }) as { properties: Record<string, Record<string, unknown>> };
    expect(schema.properties['enterprise']?.['type']).toBe('string');
  });

  it('★ choices 落在非字符串类型上时不出 enum（dsh 的 enum 值必须与 type 一致，否则整个 schema 非法）', () => {
    const schema = pluginToolParameters({
      ...COMMAND,
      args: [{ ...COMMAND.args[0]!, name: 'size', type: 'int', choices: ['10', '20'] }],
    }) as { properties: Record<string, Record<string, unknown>> };
    expect(schema.properties['size']).toEqual({ type: 'integer', description: '企业 ID' });
  });
});

describe('★ 要审批的命令带一格附注：agent 自己说这次想干什么', () => {
  it('写命令：properties 里多一格 approval_note，且必填', () => {
    const schema = pluginToolParameters(COMMAND) as {
      properties: Record<string, Record<string, unknown>>;
      required: string[];
    };
    expect(schema.properties['approval_note']?.['type']).toBe('string');
    expect(String(schema.properties['approval_note']?.['description'])).toContain('审批屏');
    expect(schema.required).toContain('approval_note');
  });

  it('★ 读命令：不问就不加那一格（参数面不为不问的东西长胖）', () => {
    const schema = pluginToolParameters({ ...COMMAND, access: 'read' }) as {
      properties: Record<string, unknown>;
      required?: string[];
    };
    expect(schema.properties['approval_note']).toBeUndefined();
    expect(schema.required).toEqual(['enterprise']);
  });

  it('★ 插件自己有个同名参数 ⇒ 让它的（不覆盖别人的声明）', () => {
    const schema = pluginToolParameters({
      ...COMMAND,
      args: [
        ...COMMAND.args,
        { ...COMMAND.args[2]!, name: 'approval_note', type: 'string', help: '插件自己的说明' },
      ],
    }) as { properties: Record<string, Record<string, unknown>>; required: string[] };
    expect(schema.properties['approval_note']).toEqual({ type: 'string', description: '插件自己的说明' });
    expect(schema.required).toEqual(['enterprise']);
  });

  it('★ 附注不进 argv、也不进那句"关键参数"（它只是给审批屏看的）', () => {
    expect(pluginToolArgv(COMMAND, { enterprise: 'tencent', approval_note: '想把预发发出去' })).toEqual([
      '--enterprise=tencent',
    ]);
    expect(pluginApprovalQuestion(COMMAND, { enterprise: 'tencent', approval_note: '想把预发发出去' })).toEqual({
      zh: 'agent 想执行工作台 [inventory] opencli 插件的 [build] 命令（enterprise=tencent），允许吗？',
      en: 'The agent wants to run the [build] command of the workbench opencli plugin [inventory] (enterprise=tencent). Allow?',
    });
  });
});

describe('描述与读写标记', () => {
  it('描述用命令自己的', () => {
    expect(pluginToolDescription(COMMAND)).toBe('Inventory 一键构建');
  });

  it('命令没写描述也留一句（模型不只靠名字猜）', () => {
    expect(pluginToolDescription({ ...COMMAND, description: '  ' })).toBe('inventory build（opencli 命令）');
  });

  it('★ access=read 不算写；write 算写；拿不到 access 也按写处理（fail-safe）', () => {
    expect(pluginToolWrites({ ...COMMAND, access: 'read' })).toBe(false);
    expect(pluginToolWrites({ ...COMMAND, access: 'write' })).toBe(true);
    expect(pluginToolWrites({ ...COMMAND, access: '' })).toBe(true);
  });
});

describe('argv：把模型给的参数翻成 opencli 的命令行', () => {
  it('只带给了值的；布尔给 true/false；数字照样给', () => {
    expect(pluginToolArgv(COMMAND, { enterprise: 'tencent', jobs: 5 })).toEqual([
      '--enterprise=tencent',
      '--jobs=5',
    ]);
    expect(pluginToolArgv(COMMAND, { enterprise: 'x', dry: false })).toEqual(['--enterprise=x', '--dry=false']);
  });

  it('★ 值一律走 `--name=<value>`：以 - 开头的值不会被 commander 当成选项', () => {
    expect(pluginToolArgv(COMMAND, { enterprise: '-x' })).toEqual(['--enterprise=-x']);
    expect(pluginToolArgv(COMMAND, { jobs: -1 })).toEqual(['--jobs=-1']);
  });

  it('没给的参数一个都不出现（不吃 opencli 自己的默认值）', () => {
    expect(pluginToolArgv(COMMAND, {})).toEqual([]);
    expect(pluginToolArgv(COMMAND, { enterprise: null })).toEqual([]);
  });

  it('positional 参数按声明顺序摆在前面', () => {
    const command: PluginCommand = {
      ...COMMAND,
      args: [{ ...COMMAND.args[0]!, positional: true }, COMMAND.args[1]!],
    };
    expect(pluginToolArgv(command, { enterprise: 'tencent', jobs: 2 })).toEqual(['tencent', '--jobs=2']);
  });
});

describe('站点会话：按命令自己的声明走，没声明才按读/写分档', () => {
  it('★ 非浏览器命令一个旗标都不带（opencli 只在 browser 命令上注册它）', () => {
    expect(pluginToolSession({ ...COMMAND, browser: false })).toBe('none');
  });

  it('★ 声明了 siteSession 就按声明（不拿读/写去改它）', () => {
    expect(pluginToolSession({ ...COMMAND, browser: true, siteSession: 'ephemeral', access: 'read' })).toBe(
      'ephemeral',
    );
    expect(pluginToolSession({ ...COMMAND, browser: true, siteSession: 'persistent', access: 'write' })).toBe(
      'persistent',
    );
  });

  it('★ 没声明时照 ADR-0014 §2.2：读 persistent、写 ephemeral', () => {
    expect(pluginToolSession({ ...COMMAND, browser: true, siteSession: '', access: 'read' })).toBe('persistent');
    expect(pluginToolSession({ ...COMMAND, browser: true, siteSession: '', access: 'write' })).toBe('ephemeral');
  });
});

describe('审批：写 / 认不出 access 都要问，文案是那句通用的', () => {
  it('★ 关键参数先取必填的，最多三个', () => {
    expect(pluginKeyArgs(COMMAND, { enterprise: 'tencent', jobs: 5, dry: true })).toBe(
      'enterprise=tencent、jobs=5、dry=true',
    );
    expect(pluginKeyArgs(COMMAND, {})).toBe('没有带参数');
  });

  it('★ 文案：agent 想执行 [插件] 的 [命令] 命令（关键参数），允许吗？', () => {
    expect(pluginApprovalQuestion(COMMAND, { enterprise: 'tencent' })).toEqual({
      zh: 'agent 想执行工作台 [inventory] opencli 插件的 [build] 命令（enterprise=tencent），允许吗？',
      en: 'The agent wants to run the [build] command of the workbench opencli plugin [inventory] (enterprise=tencent). Allow?',
    });
    expect(pluginApprovalQuestion(COMMAND, {})).toEqual({
      zh: 'agent 想执行工作台 [inventory] opencli 插件的 [build] 命令（这次没带参数），允许吗？',
      en: 'The agent wants to run the [build] command of the workbench opencli plugin [inventory] (no arguments). Allow?',
    });
  });

  it('read ⇒ 不问', () => {
    expect(pluginApprovalFor({ ...COMMAND, access: 'read' })({ arguments: {} })).toEqual({ kind: 'read' });
  });

  it('write ⇒ ask，带上那句通用文案与理由', () => {
    const verdict = pluginApprovalFor(COMMAND)({ name: 'inventory_build', arguments: { enterprise: 'tencent' } });
    expect(verdict).toEqual({
      kind: 'ask',
      reason: 'inventory build 在 opencli 里标着 write',
      question: {
        zh: 'agent 想执行工作台 [inventory] opencli 插件的 [build] 命令（enterprise=tencent），允许吗？',
        en: 'The agent wants to run the [build] command of the workbench opencli plugin [inventory] (enterprise=tencent). Allow?',
      },
      fallback: {
        zh: 'agent 想执行工作台 [inventory] opencli 插件的 [build] 命令（enterprise=tencent），允许吗？',
        en: 'The agent wants to run the [build] command of the workbench opencli plugin [inventory] (enterprise=tencent). Allow?',
      },
    });
  });

  it('★ 拿不到 access ⇒ 也 ask，理由写清是 fail-safe', () => {
    const verdict = pluginApprovalFor({ ...COMMAND, access: '' })({ arguments: {} });
    expect(verdict?.kind).toBe('ask');
    expect(verdict?.kind === 'ask' ? verdict.reason : '').toContain('fail-safe');
  });
});
