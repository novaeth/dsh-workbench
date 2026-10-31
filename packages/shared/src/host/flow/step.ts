import type { LongTaskStep } from '../../contract/long-task.js';
import type { FlowStepEvent } from './types.js';

/**
 * 把流程的一步事件翻成长任务步骤流的默认一行。
 * `running` → `start`、`ok` → `succeed`、`skipped` → `info`、`failed` → `fail`、
 * `needs-login` → `info`（带 `loginUrl`）；文字取 `message ?? title`。
 * 要改文案或过滤步骤，就在模块里自己映射 —— 这只是默认值。
 * @param event `flow.run({ onStep })` 收到的那条事件。
 * @returns 能直接交给长任务 `run({ onStep })` 的一行。
 */
export function longTaskStepOf(event: FlowStepEvent): LongTaskStep {
  const text = event.message ?? event.title;
  if (event.status === 'failed') return { kind: 'fail', text };
  if (event.status === 'needs-login') {
    return { kind: 'info', text, ...(event.loginUrl === undefined ? {} : { loginUrl: event.loginUrl }) };
  }
  if (event.status === 'ok') return { kind: 'succeed', text };
  if (event.status === 'skipped') return { kind: 'info', text };
  return { kind: 'start', text };
}
