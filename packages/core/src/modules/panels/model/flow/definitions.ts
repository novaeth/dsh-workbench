import type { FlowDefinition, FlowNodeStep } from '@dsh-workbench/shared/host';
import { README_SECTION_KEYS, SHOT_KINDS } from '@dsh-workbench/shared/host';
import {
  DIY_RECORD_PREPARE_TOOL,
  DIY_RECORD_STOP_TOOL,
} from '../../unit';

export interface DiyFlow extends Omit<FlowDefinition, 'steps'> {
  readonly steps: readonly FlowNodeStep[];
}

const WRITE = ['write', 'edit'] as const;

export const HEADLESS_TITLES: Readonly<Record<string, string>> = {
  install: '安装模块',
  verify: '检查模块功能',
};

const schemaOf = (
  required: readonly string[],
  properties: Record<string, unknown>,
): Record<string, unknown> => ({ type: 'object', required, properties });

const isBuild = { $in: [{ $ref: 'in.destination' }, ['board', 'headless']] } as const;

type PlanSectionKey = (typeof README_SECTION_KEYS)[number];

const PLAN_SECTION_HINTS: Readonly<Record<PlanSectionKey, string>> = {
  see: '用户一眼能看到什么。',
  do: '用户自己能点击或修改什么。',
  agent: 'agent 能为用户做什么，执行前是否需要批准。',
  data: '数据从哪来、用谁的登录，以及只读取还是写入。',
};

const PLAN_SECTION_PROPERTIES: Record<string, unknown> = Object.fromEntries(
  README_SECTION_KEYS.map((key) => [
    key,
    { type: 'array', items: { type: 'string' }, description: PLAN_SECTION_HINTS[key] },
  ]),
);

export const PLAN_DRAFT_PROPERTIES: Record<string, unknown> = {
  cells: { type: 'string', description: '看板分几格，每格显示什么。' },
  steps: { type: 'string', description: '从抓取数据到生成卡片一共几步。' },
  minutes: { type: 'string', description: '用户大约需要等几分钟。' },
  shots: {
    type: 'array',
    description: '一两张界面预览：每张把界面上的真实文案按从上到下的顺序画进 ascii 字段，并配一句图注。无看板时不要提交。',
    items: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: [...SHOT_KINDS], description: '图的类型：卡片 / 审批 / 状态 / 其他。' },
        caption: { type: 'string', description: '图注：写清这张图画的是卡片、设置面还是审批屏。' },
        ascii: { type: 'string', description: 'ascii 内容：用界面上的真实文案，不留占位词。' },
      },
      required: ['caption', 'ascii'],
    },
  },
  ...PLAN_SECTION_PROPERTIES,
};

const PLAN_SCHEMA = schemaOf([...README_SECTION_KEYS], PLAN_DRAFT_PROPERTIES);

const PROBE_SCHEMA = schemaOf(['sites'], { sites: { type: 'array' } });

const BUILD_SCHEMA = schemaOf(['unit'], { unit: { type: 'string' } });

const INSTALL_SCHEMA = schemaOf(['unit', 'installed'], { unit: { type: 'string' }, installed: { type: 'boolean' } });

const VERIFY_SCHEMA = schemaOf(['passed', 'unverified'], { passed: { type: 'array' }, unverified: { type: 'array' } });

const LEDGER_SCHEMA = schemaOf(['design'], { design: { type: 'string' } });
const lockedTools = { deny: [...WRITE] } as const;
const openTools = {} as const;

export const DIY_BOARD_FLOW: DiyFlow = {
  id: 'diy-board',
  title: '创建看板模块',
  steps: [
    { id: 'probe', title: '查看数据来源', when: isBuild, tools: lockedTools, schema: PROBE_SCHEMA },
    { id: 'plan', title: '确认方案', when: isBuild, tools: lockedTools, schema: PLAN_SCHEMA },
    { id: 'build', title: '创建模块', when: isBuild, tools: openTools, schema: BUILD_SCHEMA },
    { id: 'install', title: '添加模块到面板', when: isBuild, tools: lockedTools, schema: INSTALL_SCHEMA },
    { id: 'verify', title: '检查模块显示', when: isBuild, tools: lockedTools, schema: VERIFY_SCHEMA },
    { id: 'ledger', title: '保存这次的设计', when: isBuild, tools: openTools, schema: LEDGER_SCHEMA },
  ],
};

export const DIY_TWEAK_FLOW: DiyFlow = {
  id: 'diy-tweak',
  title: '修改模块',
  steps: [
    { id: 'plan', title: '补充方案', tools: lockedTools, schema: PLAN_SCHEMA },
    { id: 'build', title: '修改模块', tools: openTools, schema: BUILD_SCHEMA },
    { id: 'install', title: '替换模块', tools: lockedTools, schema: INSTALL_SCHEMA },
    { id: 'verify', title: '只检查该模块', tools: lockedTools, schema: VERIFY_SCHEMA },
    { id: 'ledger', title: '保存这次的设计', tools: openTools, schema: LEDGER_SCHEMA },
  ],
};

export const DIY_BOARD_STEPS = DIY_BOARD_FLOW.steps.map((step) => step.id);

const RECORD_SCHEMA = schemaOf(['rows'], { rows: { type: 'array' } });

const SCAN_SCHEMA = schemaOf(['needsSupplement', 'gaps'], {
  needsSupplement: { type: 'boolean' },
  gaps: { type: 'array', items: { type: 'string' } },
});

const SUPPLEMENT_SCHEMA = RECORD_SCHEMA;

const FINISH_SCHEMA = {
  type: 'object',
  required: ['done'],
  properties: { done: { type: 'boolean' } },
} as const;

export const DIY_WRITE_RECORD_FLOW: DiyFlow = {
  id: 'diy-write-record',
  title: '录制一次写入',
  steps: [
    {
      id: 'record',
      title: '录制',
      tools: { deny: [DIY_RECORD_STOP_TOOL] },
      schema: RECORD_SCHEMA,
    },
    {
      id: 'scan',
      title: '检查录制结果',
      tools: { deny: [DIY_RECORD_PREPARE_TOOL, DIY_RECORD_STOP_TOOL] },
      schema: SCAN_SCHEMA,
    },
    {
      id: 'supplement',
      title: '补录',
      when: { $not: { $eq: [{ $ref: 'steps.scan.needsSupplement' }, { $lit: false }] } },
      tools: { deny: [DIY_RECORD_STOP_TOOL] },
      schema: SUPPLEMENT_SCHEMA,
    },
    {
      id: 'finish',
      title: '完成',
      tools: { deny: [DIY_RECORD_PREPARE_TOOL] },
      schema: FINISH_SCHEMA,
    },
  ],
};

export function flowFor(destination: unknown): DiyFlow {
  if (destination === 'tweak') return DIY_TWEAK_FLOW;
  if (destination === 'write-record') return DIY_WRITE_RECORD_FLOW;
  return DIY_BOARD_FLOW;
}

export function flowById(id: string): DiyFlow | null {
  if (id === DIY_TWEAK_FLOW.id) return DIY_TWEAK_FLOW;
  if (id === DIY_WRITE_RECORD_FLOW.id) return DIY_WRITE_RECORD_FLOW;
  if (id === DIY_BOARD_FLOW.id) return DIY_BOARD_FLOW;
  return null;
}
