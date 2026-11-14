import type { PlanStep, PlanStepResult } from '@dsh-workbench/shared/host';
import { failure } from './result.js';
import type { SaveBytes } from './types.js';

export async function attachOf(
  step: PlanStep,
  one: PlanStepResult<unknown>,
  saveBytes: SaveBytes | undefined,
): Promise<PlanStepResult<unknown>> {
  if (!one.ok) return one;
  const box = one.data as { readonly base64?: unknown; readonly contentType?: unknown } | undefined;
  if (typeof box?.base64 !== 'string') {
    return failure('parse', '这一步不是二进制，存不成附件', { pageCode: 'attachment-shape' });
  }
  const base64 = box.base64;
  const bytes = /^[A-Za-z0-9+/]*={0,2}$/.test(base64) && base64.length % 4 === 0 ? Buffer.from(base64, 'base64') : undefined;
  const size = (box as { readonly size?: unknown }).size;
  if (bytes === undefined || (typeof size === 'number' && bytes.length !== size)) {
    return failure('parse', '附件内容是坏的（base64 不完整）', { pageCode: 'attachment-broken' });
  }
  if (saveBytes === undefined) {
    return failure('invalid-request', '这个运行时不支持保存附件', { pageCode: 'no-attachment-service' });
  }
  try {
    const ref = await saveBytes({
      data: Uint8Array.from(bytes),
      contentType:
        typeof box.contentType === 'string' && box.contentType !== '' ? box.contentType : 'application/octet-stream',
      name: step.name,
    });
    return { ...one, data: ref };
  } catch (error) {
    return failure('command', `附件没存下来：${error instanceof Error ? error.message : String(error)}`, {
      pageCode: 'attachment-save-failed',
    });
  }
}
