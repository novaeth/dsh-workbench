import type { FlowDefinition } from './types.js';

/**
 * 这条流程里有没有某一类节点（子流程也算）；宿主据此决定要不要开对应的通道。
 * @param flow 流程定义。
 * @param kind 节点种类：`agent` 或 `ai`。
 * @returns 有这类节点为真。
 */
export function flowUses(flow: FlowDefinition, kind: 'agent' | 'ai'): boolean {
  for (const step of flow.steps) {
    if (kind in step) return true;
    if ('flow' in step && flowUses(step.flow, kind)) return true;
  }
  return false;
}
