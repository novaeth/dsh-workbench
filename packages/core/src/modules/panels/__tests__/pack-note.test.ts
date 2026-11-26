import { describe, expect, it } from 'vitest';
import type { DshHostContext, DshToolRunContext } from '@dsh-workbench/shared/host';
import { packNoteOf } from '../model/flow/pack-note';

describe('packNoteOf', () => {
  it('没有下一步时不说包', () => {
    expect(packNoteOf({} as DshHostContext, {} as DshToolRunContext, null)).toBe('');
  });
});
