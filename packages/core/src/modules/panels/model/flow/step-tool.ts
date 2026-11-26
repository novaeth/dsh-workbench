import type { DshHostContext, DshToolDefinition, DshToolRunContext } from '@dsh-workbench/shared/host';
import { hostSurface, sessionIdOf } from '@dsh-workbench/shared/host';
import { toolRegistryOf } from '../tool-registry-guard';
import { DIY_STEP_TOOL } from '../../unit';
import { plainJson } from '../diy-context';
import { positionOf, titleOf } from './position';
import { PROGRESS_OUTPUT } from './progress-output';
import type { DiyFlowRuns } from './runs';
import { packNoteOf } from './pack-note';

const STEP_FIELDS: Readonly<Record<string, readonly string[]>> = {
  probe: ['sites'],
  scan: ['needsSupplement', 'gaps'],
  build: ['unit'],
  install: ['unit', 'installed'],
  verify: ['passed', 'unverified'],
  ledger: ['design'],
  finish: ['done'],
};

function nextOf(step: string, destination: string | null): string {
  if (step === 'plan') {
    return destination === 'headless' ? '补上方案四段（用 workbench_diy_plan）' : '补上方案四段与 ascii（用 workbench_diy_plan）';
  }
  if (step === 'verify' && !hostSurface().capabilities.pageDebug) {
    return '本机没有页面调试能力：按只读取证逐条验证，无法验证的写入 unverified（workbench_diy_step）';
  }
  return `${STEP_NEXT[step] ?? step}（workbench_diy_step）`;
}

const STEP_NEXT: Readonly<Record<string, string>> = {
  probe: '站探完成后提交读取到的站点',
  scan: '检查完录制结果后提交「是否需要补录」与缺口',
  build: '编写完成后提交模块标识',
  install: '安装完成后提交模块标识与安装结果',
  verify: '验证一遍后提交通过的与未验证的',
  ledger: '提交本次的设计文件名',
  finish: '材料齐全后提交 done；缺口不要掩盖，如实保留',
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function destinationOf(input: Readonly<Record<string, unknown>>): string | null {
  const destination = input['destination'];
  return typeof destination === 'string' ? destination : null;
}

export function registerDiyStepTool(ctx: DshHostContext, runs: DiyFlowRuns): Array<() => void> {
  const tools = toolRegistryOf(ctx, '跳过 DIY 步骤工具注册');
  if (tools === undefined) return [];

  const stepTool: DshToolDefinition = {
    name: DIY_STEP_TOOL,
    description:
      'DIY 流程前进一步：提交这一步的结果后，流程才会继续。' +
      '需要提交哪些字段见当前步骤的工具返回；不在流程中时不要调用。',
    parameters: {
      type: 'object',
      properties: {
        sites: { type: 'array', description: '读取到的站点 / 表。', items: { type: 'string' } },
        needsSupplement: { type: 'boolean', description: '本次是否需要再补录一段。' },
        gaps: {
          type: 'array',
          description: '仍缺少的材料（补录要补的内容），一条一句。',
          items: { type: 'string' },
        },
        unit: { type: 'string', description: '模块标识。' },
        installed: { type: 'boolean', description: '是否安装成功。' },
        passed: { type: 'array', description: '已验证且通过的。', items: { type: 'string' } },
        unverified: { type: 'array', description: '未验证的，写明原因。', items: { type: 'string' } },
        design: { type: 'string', description: '本次设计保存到哪个文件。' },
        cancel: {
          type: 'boolean',
          description: '终止这条流程时给 true（用户改变主意、无法完成，或这件事本就不该做成模块）。',
        },
        reason: { type: 'string', description: '终止原因，一句话，向用户展示。' },
      },
      additionalProperties: false,
    },
    output: PROGRESS_OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const session = sessionIdOf(exec);
      if (session === null) throw new Error('当前会话没有 id，无法提交到流程');
      const running = runs.stepOf(session);
      if (running === null) throw new Error('当前会话没有运行中的流程；先用 workbench_diy_plan 创建');
      const record = asRecord(raw);
      if (record['cancel'] === true) {
        const reason = typeof record['reason'] === 'string' ? record['reason'].trim() : '';
        if (reason === '') throw new Error('终止流程必须给原因：用户会在卡片上看到这句话');
        runs.stop(session);
        return plainJson({ ok: true, step: '', index: 0, total: 0, remaining: 0, done: true, text: `已终止：${reason}` });
      }
      const fields = STEP_FIELDS[running.id];
      if (fields === undefined) {
        throw new Error(`当前停在「${titleOf(running.id, destinationOf(runs.inputOf(session)))}」；这一步用 workbench_diy_plan 提交`);
      }
      const missing = fields.filter((field) => record[field] === undefined);
      if (missing.length > 0) {
        throw new Error(
          `当前停在「${titleOf(running.id, destinationOf(runs.inputOf(session)))}」，需要提交 ${fields.join(' / ')}；缺少 ${missing.join(' / ')}`,
        );
      }
      const value: Record<string, unknown> = {};
      for (const field of fields) value[field] = record[field];
      const advanced = await runs.advance(session, value);
      if (!advanced.ok) throw new Error(advanced.problem ?? '这一步未提交成功');
      const destination = destinationOf(runs.inputOf(session));
      const step = advanced.step;
      const packNote = packNoteOf(ctx, exec, step?.id ?? null);
      const values = runs.valuesOf(session);
      const at = positionOf(step?.id ?? null, destination, values);
      return plainJson({
        ok: true,
        step: step?.id ?? '',
        index: at.index,
        total: at.total,
        remaining: at.remaining,
        done: step === null,
        text:
          step === null
            ? `流程已完成：共 ${at.total} 步，全部提交。`
            : `停在第 ${at.index}/${at.total} 步（${titleOf(step.id, destination, values)}）。下一步：${
                nextOf(step.id, destination)
              }。${packNote === '' ? '' : ` ${packNote}`}`,
      });
    },
  };

  return [tools.register(stepTool)];
}
