import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Translate, UnitManifest } from '@dsh-workbench/shared';
import { zh } from '@dsh-workbench/shared';
import { approvalFor, type ApprovalCall } from '@dsh-workbench/shared/host';
import { pluginToolIndexOf, shellApprovalPlan, type ApprovalPlanView } from '@/app/layouts/approval-detail';
import { panelsApprovalFor } from '../model/approval';
import { ASK_TOOLS, WRITE_CALLS, stopRuns } from './approval-samples';

const GOLDEN = new URL('../../../../test/golden/approval-screens.md', import.meta.url);

const t: Translate = (key, params) => {
  const template = (zh as Record<string, string>)[key] ?? key;
  return Object.entries(params ?? {}).reduce(
    (text, [name, value]) => text.replace(`{${name}}`, String(value)),
    template,
  );
};

function displayWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    const wide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2014 && code <= 0x2014) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x1f300 && code <= 0x1f9ff);
    width += wide ? 2 : 1;
  }
  return width;
}

function pad(text: string, width: number): string {
  return `${text}${' '.repeat(Math.max(0, width - displayWidth(text)))}`;
}

function box(title: string, body: readonly string[]): readonly string[] {
  const width = Math.max(60, displayWidth(title) + 6, ...body.map(displayWidth));
  const top = `┌─ ${title} ${'─'.repeat(Math.max(0, width - displayWidth(title) - 4))}┐`;
  return [
    top,
    `│ ${pad('● 等待审批', width)} │`,
    `├${'─'.repeat(width + 2)}┤`,
    ...body.map((line) => `│ ${pad(line, width)} │`),
    `├${'─'.repeat(width + 2)}┤`,
    `│ ${pad('', width - displayWidth('[ 拒绝 ]  [ 允许一次 ]'))}${'[ 拒绝 ]  [ 允许一次 ]'} │`,
    `└${'─'.repeat(width + 2)}┘`,
  ];
}

function planLines(plan: ApprovalPlanView | undefined): readonly string[] {
  if (plan === undefined) return ['详情座：（无 —— 谁都没认领，参数里的 command 兜底还能画）'];
  if (plan.rows.length === 0) return ['详情座：外壳认领了，不画（agent 塞的 command 进不来）'];
  const label = Math.max(...plan.rows.map((row) => displayWidth(row.label)));
  return [
    ...plan.rows.map((row) => `${pad(row.label, label)}  ${row.value}`),
    ...(plan.warn === undefined ? [] : [`⚠ ${plan.warn}`]),
  ];
}

async function screenOf(tool: string): Promise<readonly string[]> {
  const args = (WRITE_CALLS[tool] ?? {}) as Record<string, unknown>;
  const call: ApprovalCall = { name: tool, arguments: args };
  const decision = await approvalFor(call, { writes: true, policy: panelsApprovalFor(stopRuns()) });
  const title = decision?.kind === 'ask' ? decision.displayReason.zh : '（不问）';

  return [
    `## ${tool}`,
    '',
    ...box(title, ['', title, '', ...planLines(shellApprovalPlan({ tool, args }, t))]),
    '',
  ];
}

const PLUGIN_TOOL = 'inventory_build';

interface PluginCommand {
  readonly plugin: string;
  readonly name: string;
  readonly description: string;
  readonly access: 'read' | 'write' | 'unknown';
  readonly browser: boolean;
  readonly siteSession: string;
  readonly args: readonly {
    readonly name: string;
    readonly type: string;
    readonly required: boolean;
    readonly positional: boolean;
    readonly valueRequired: boolean;
    readonly choices: readonly string[];
    readonly help: string;
  }[];
}

const PLUGIN_COMMAND: PluginCommand = {
  plugin: 'inventory',
  name: 'build',
  description: 'Inventory 一键构建',
  access: 'write',
  browser: true,
  siteSession: 'ephemeral',
  args: [
    {
      name: 'enterprise',
      type: 'string',
      required: true,
      positional: false,
      valueRequired: true,
      choices: [],
      help: '企业 ID',
    },
  ],
};

const PLUGIN_UNIT: UnitManifest = {
  id: 'plugin:opencli-plugin-inventory',
  title: { zh: 'inventory', en: 'inventory' },
  titleKey: 'dsh-workbench.unit.plugin_inventory.title',
  card: null,
  tools: [
    {
      name: PLUGIN_TOOL,
      writes: true,
      runtime: { plugin: 'inventory', command: 'build', args: ['enterprise'] },
    },
  ],
  host: { inject: [] },
};

async function pluginScreen(): Promise<readonly string[]> {
  const args = { enterprise: 'tencent', approval_note: '把预发那条构建发出去' };
  const call: ApprovalCall = { name: PLUGIN_TOOL, arguments: args };
  const decision = await approvalFor(call, {
    writes: true,
    policy: (() => {
      const question = {
        zh: `agent 想执行工作台 [${PLUGIN_COMMAND.plugin}] opencli 插件的 [${PLUGIN_COMMAND.name}] 命令，允许吗？`,
        en: `The agent wants to run the [${PLUGIN_COMMAND.name}] command of the workbench opencli plugin [${PLUGIN_COMMAND.plugin}]. Allow?`,
      };
      return {
        kind: 'ask' as const,
        reason: `${PLUGIN_COMMAND.plugin} ${PLUGIN_COMMAND.name} 在 opencli 里标着 write`,
        question,
        fallback: question,
        noteInDetail: true,
      };
    }),
    declaredNote: true,
  });
  const title = decision?.kind === 'ask' ? decision.displayReason.zh : '（不问）';

  return [
    `## ${PLUGIN_TOOL}（opencli 插件 [inventory] 的 [build] 命令）`,
    '',
    ...box(
      title,
      ['', title, '', ...planLines(shellApprovalPlan({ tool: PLUGIN_TOOL, args }, t, pluginToolIndexOf([PLUGIN_UNIT])))],
    ),
    '',
  ];
}

async function document(): Promise<string> {
  const parts = [
    '# 审批屏清单（黄金文件）',
    '',
    '每一族上屏长什么样：dsh 那条「等待审批」· 我们的标题（`displayReason`）· 详情座',
    '（外壳那张表或模块自己的 renderer 画的 `ApprovalPlan`）· 按钮。',
    '',
    '**这一份只许手改**：门禁只比对、不写它。改文案或排版 ⇒ 这一条判据红 ⇒ 说明为什么，',
    '再照新的真实输出手改这一份。生成器与判据 =',
    '`packages/core/src/modules/panels/__tests__/approval-screens.test.ts`。',
    '',
    '**详情座有两种「空」**：`（无 —— 谁都没认领，参数里的 command 兜底还能画）` 是**谁都不认领**，',
    '座位会落到 `args.command` 那一档；`外壳认领了，不画` 是**外壳把这个工具占了**（外壳自己的工具必须占，',
    '否则 agent 塞一个没声明过的 `command` 就会被当命令原文画上屏 —— 见 ADR-0065 §3）。',
    '',
    '**2026-10-21 加 `workbench_long_tasks_stop` 那一屏**（ADR-0070）：面板那族的第四族工具，标题那一句取',
    '`fallback`（面板族没有宿主明细，`compose()` 没有 detail 就用它），点名"哪一趟 + 谁起的"；详情座画',
    '"要停的那次任务"那一行 + 一行 warn。这一份仍是只许手改 —— 门禁只比对、不写它。',
    '',
    '**2026-10-27 加 `workbench_market_enable` 那一屏**：把索引源设为可发布，标题同样取 `fallback`，',
    '点名是哪个索引源，并说清只改本机配置、不碰仓库；详情座由外壳认领（agent 塞的 `command` 进不来）。',
    '',
    '**2026-10-27 加 `workbench_market_disable` 那一屏**：把索引源改回只读；和 enable 一样只改本机配置、',
    '不碰仓库，只有可发布的源才问。',
    '',
    '**2026-10-28 加 opencli 插件命令那一屏**：标题只留动作（插件 + 命令）；参数与 agent 那句话全进详情座 ——',
    '外壳按清单里那条工具的 `opencli` 那一格认领，画 插件 / 命令 / `agent 说` / 参数各一行。',
    '',
  ];
  for (const tool of ASK_TOOLS) parts.push(...(await screenOf(tool)));
  parts.push(...(await pluginScreen()));
  return parts.join('\n');
}

describe('审批屏黄金文件：每一族上屏长什么样，一眼可见', () => {
  it('★ 与 test/golden/approval-screens.md 逐字一致（只许手改，门禁里没有写路径）', async () => {
    const actual = await document();
    if (process.env['WB_SCREENS_PRINT'] === '1') process.stdout.write(actual);

    const golden = readFileSync(GOLDEN, 'utf8');
    const actualLines = actual.split('\n');
    const goldenLines = golden.split('\n');
    const at = actualLines.findIndex((line, index) => line !== goldenLines[index]);
    const line = at < 0 ? goldenLines.length : at;

    expect(actualLines.length, `行数：黄金 ${goldenLines.length} · 现在 ${actualLines.length}`).toBe(
      goldenLines.length,
    );
    expect(
      actualLines[line] ?? '',
      `第 ${line + 1} 行不一样（黄金 → 现在）；改了就说明为什么，再手改 test/golden/approval-screens.md`,
    ).toBe(goldenLines[line] ?? '');
  });
});
