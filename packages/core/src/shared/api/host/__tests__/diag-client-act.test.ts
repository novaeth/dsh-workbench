import { describe, expect, it } from 'vitest';
import { createDiagRecorder } from '@dsh-workbench/shared/host';
import { diagClientAction, DIAG_CLIENT_RESOURCE } from '../diag-client-act';

function recorderOf(): ReturnType<typeof createDiagRecorder> {
  let seq = 0;
  return createDiagRecorder({ nextCorrId: () => `c-${String(++seq)}`, level: 'info' });
}

describe('客户端失败上报', () => {
  it('★★ 带关联号的上报落一条 CLIENT_FAILED，屏幕与步骤都在', () => {
    const recorder = recorderOf();
    const action = diagClientAction(recorder);

    expect(action.resource).toBe(DIAG_CLIENT_RESOURCE);
    const result = action.handle({
      corrId: 'abc12345',
      screen: 'panels',
      step: 'suite',
      reason: '渲染炸了\n第二行',
    });

    expect(result).toEqual({ ok: true, corrId: 'abc12345' });
    const [record] = recorder.recent();
    expect(record?.code).toBe('CLIENT_FAILED');
    expect(record?.class).toBe('bug');
    expect(record?.corrId).toBe('abc12345');
    expect(record?.subject).toEqual({ route: 'panels', unit: 'suite' });
    expect(record?.detail?.['reason']).toBe('渲染炸了');
  });

  it('★ 同一个关联号重复上报只落一条；没带号码就用宿主生成的', () => {
    const recorder = recorderOf();
    const action = diagClientAction(recorder);

    action.handle({ corrId: 'same0001', screen: 'panels' });
    action.handle({ corrId: 'same0001', screen: 'panels' });
    expect(recorder.recent({ code: 'CLIENT_FAILED' })).toHaveLength(1);

    const made = action.handle({ screen: 'settings', reason: 'x' });
    expect(made).toEqual({ ok: true, corrId: 'c-1' });
  });
});
