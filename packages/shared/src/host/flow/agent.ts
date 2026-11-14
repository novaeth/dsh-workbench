import { flowUses } from './scan.js';
import type { FlowDefinition } from './types.js';

const MAX_SUMMARY = 40;

/**
 * 这条流程里有没有 agent 节点（子流程也算）；宿主据此决定要不要开一个 agent 通道。
 * @param flow 流程定义。
 * @returns 有 agent 节点为真。
 */
export function flowUsesAgents(flow: FlowDefinition): boolean {
  return flowUses(flow, 'agent');
}

/**
 * 把一个子 agent 的停止原因翻成步骤失败那一行的人话。
 * @param stopReason 子 agent 的停止原因（dsh 的开放联合，认不出就原样带上）。
 * @returns 失败文案。
 */
export function agentStopReasonText(stopReason: string): string {
  if (stopReason === 'aborted') return 'agent 被停下了';
  if (stopReason === 'error') return 'agent 出错了';
  if (stopReason === 'max-tokens') return 'agent 到输出上限还没给结论';
  if (stopReason === 'refusal') return 'agent 拒绝了这个任务';
  return `agent 没跑完（${stopReason}）`;
}

/**
 * 从一步的结果里取一行摘要：文本取第一段非空行，超过 40 字截断；非文本不给摘要。
 * @param value 这一步进 `steps` 的值。
 * @returns 一行摘要；取不到就是 `undefined`。
 */
export function agentSummaryOf(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const line = value
    .split('\n')
    .map((part) => part.trim())
    .find((part) => part !== '');
  if (line === undefined) return undefined;
  return line.length <= MAX_SUMMARY ? line : `${line.slice(0, MAX_SUMMARY - 1)}…`;
}
