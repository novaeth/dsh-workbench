import type { DshHostContext, DshToolDefinition, DshToolRunContext } from '@dsh-workbench/shared/host';
import {
  README_SECTION_KEYS,
  README_SOURCE_FILE,
  hostSurface,
  readJsonObject,
  sessionIdOf,
} from '@dsh-workbench/shared/host';
import { join } from 'node:path';
import { registerTools } from '../tool-registry-guard';
import { DIY_STEP_TOOL } from '../../unit';
import { modulesOf, plainJson, workspaceOf } from '../diy-context';
import { HEADLESS_LABELS, SECTION_LABELS } from './definitions';
import { positionOf, titleOf } from './position';
import { PROGRESS_OUTPUT } from './progress-output';
import type { DiyFlowRuns } from './runs';
import { packNoteOf } from './pack-note';
import { planBaselineOf, type PlanBaseline } from './plan-step';

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
    return destination === 'headless'
      ? '补上输出 / 触发 / 批准 / 数据四段（用 workbench_diy_plan）'
      : '补上方案四段与界面预览（用 workbench_diy_plan）';
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

export type DiyModuleDirectoryOf = (unit: string, exec: DshToolRunContext) => Promise<string | null>;

function normalizedText(value: unknown): string | null {
  if (typeof value === 'string') return value.replace(/\s+/gu, ' ').trim();
  if (typeof value !== 'object' || value === null) return null;
  const text = (value as { text?: unknown }).text;
  return typeof text === 'string' ? text.replace(/\s+/gu, ' ').trim() : null;
}

function readmeItems(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const items = value.map(normalizedText);
  if (items.some((one) => one === null || one === '')) return null;
  return (items as string[]).sort();
}

function firstDifference(expected: readonly string[], actual: readonly string[]): string | null {
  const remaining = [...actual];
  for (const item of expected) {
    const at = remaining.indexOf(item);
    if (at === -1) return `缺少「${item}」`;
    remaining.splice(at, 1);
  }
  return remaining.length === 0 ? null : `多出「${remaining[0] ?? ''}」`;
}

function unitOf(values: Readonly<Record<string, unknown>>): string {
  for (const step of ['build', 'install']) {
    const value = values[step];
    if (typeof value !== 'object' || value === null) continue;
    const unit = (value as { unit?: unknown }).unit;
    if (typeof unit === 'string' && unit.trim() !== '') return unit.trim();
  }
  return '';
}

function readReadme(dir: string): Readonly<Record<string, unknown>> | null {
  return readJsonObject(join(dir, README_SOURCE_FILE)) ?? null;
}

async function checkLedgerBaseline(
  ctx: DshHostContext,
  runs: DiyFlowRuns,
  session: string,
  exec: DshToolRunContext,
  baseline: PlanBaseline | undefined,
  moduleDirectoryOf: DiyModuleDirectoryOf | undefined,
): Promise<string> {
  if (baseline === undefined) return '本次没有方案基线可比对。';
  const unit = unitOf(runs.valuesOf(session));
  if (unit === '') throw new Error('找不到本次的模块标识，无法比对已批准的方案；先补齐创建步骤的模块标识。');
  const dir =
    moduleDirectoryOf !== undefined
      ? await moduleDirectoryOf(unit, exec)
      : await (async () => {
          const { root } = await workspaceOf(ctx, exec);
          return modulesOf(ctx, root).modules.find((one) => one.unit === unit)?.dir ?? null;
        })();
  if (dir === null) {
    throw new Error(`当前工作区没有模块「${unit}」，无法比对已批准的方案；先确认模块标识，再提交设计记录。`);
  }
  const readme = readReadme(dir);
  if (readme === null) {
    throw new Error(`读不到模块「${unit}」的 ${README_SOURCE_FILE}；先补齐模块说明，再提交设计记录。`);
  }
  const destination = destinationOf(runs.inputOf(session));
  const labels = destination === 'headless' ? HEADLESS_LABELS : SECTION_LABELS;
  for (const key of README_SECTION_KEYS) {
    const actual = readmeItems(readme[key]);
    if (actual === null) throw new Error(`模块说明的「${labels[key]}」读不到；先补齐这一段，再提交设计记录。`);
    const expected = baseline[key].map(normalizedText);
    if (expected.some((one) => one === null)) return '本次没有方案基线可比对。';
    const difference = firstDifference((expected as string[]).sort(), actual);
    if (difference !== null) {
      throw new Error(
        `方案与模块说明不一致：「${labels[key]}」${difference}。` +
          '把模块说明改成与已批准的方案一致；或先终止流程，带新的 summary 重新走方案审批。',
      );
    }
  }
  return '';
}

function stepToolOf(
  ctx: DshHostContext,
  runs: DiyFlowRuns,
  moduleDirectoryOf?: DiyModuleDirectoryOf,
): DshToolDefinition {
  return {
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
      const input = runs.inputOf(session);
      const destination = destinationOf(input);
      const summary = typeof input['summary'] === 'string' ? input['summary'] : '';
      const baseline = planBaselineOf(runs.valuesOf(session), summary);
      const baselineNote =
        running.id === 'ledger'
          ? await checkLedgerBaseline(ctx, runs, session, exec, baseline, moduleDirectoryOf)
          : '';
      const advanced = await runs.advance(session, value);
      if (!advanced.ok) throw new Error(advanced.problem ?? '这一步未提交成功');
      const step = advanced.step;
      const packNote = packNoteOf(ctx, exec, step?.id ?? null);
      const values = runs.valuesOf(session);
      const at = positionOf(step?.id ?? null, destination, values);
      const text =
        step === null
          ? `流程已完成：共 ${at.total} 步，全部提交。`
          : `停在第 ${at.index}/${at.total} 步（${titleOf(step.id, destination, values)}）。下一步：${
              nextOf(step.id, destination)
            }。${packNote === '' ? '' : ` ${packNote}`}`;
      return plainJson({
        ok: true,
        step: step?.id ?? '',
        index: at.index,
        total: at.total,
        remaining: at.remaining,
        done: step === null,
        baseline: baseline ?? { available: false },
        text: `${text}${baselineNote === '' ? '' : baselineNote}`,
      });
    },
  };
}

export function registerDiyStepTool(
  ctx: DshHostContext,
  runs: DiyFlowRuns,
  moduleDirectoryOf?: DiyModuleDirectoryOf,
): Array<() => void> {
  return registerTools(ctx, '跳过 DIY 步骤工具注册', [stepToolOf(ctx, runs, moduleDirectoryOf)]);
}
