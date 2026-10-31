import type { FlowDefinition } from '@dsh-workbench/core/contract';
import type { LongTaskStatus } from '@dsh-workbench/shared';

export const FLOW_TARGET = 'sample';
export const RUN_TASK = '__UNIT__-sample';
export const RUN_RESOURCE = '__UNIT__-run';

export interface SampleRun {
  readonly id: string;
  readonly status: LongTaskStatus;
  readonly step: string;
  readonly steps: readonly string[];
  readonly why?: string | undefined;
}

export function sampleFlow(): FlowDefinition {
  return {
    id: 'sample',
    title: '读目录 → 汇总',
    target: { $ref: 'in.path' },
    steps: [
      { id: 'read', title: '读目录', action: 'read' },
      {
        id: 'summarize',
        title: '汇总',
        action: 'summarize',
        with: {
          files: { $ref: 'steps.read.files' },
          dirs: { $ref: 'steps.read.dirs' },
          bytes: { $ref: 'steps.read.bytes' },
        },
      },
    ],
  };
}

export function headlineOf(run: SampleRun): string {
  if (run.status === 'ok') return '样板流程跑完了';
  if (run.status === 'failed') return '样板流程失败';
  if (run.status === 'stopped') return '样板流程已停止';
  if (run.status === 'needs-login') return '样板流程要登录';
  return run.step === '' ? '样板流程正在跑' : `样板流程：${run.step}`;
}

export function runIsLive(run: SampleRun): boolean {
  return run.status === 'running' || run.status === 'needs-login';
}
