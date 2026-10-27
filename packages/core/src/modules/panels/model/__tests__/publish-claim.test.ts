import { describe, expect, it } from 'vitest';

import { publishClaimDenyOf } from '../publish-claim';

describe('publishClaimDenyOf', () => {
  it('冲突和占用各给一句话，点名是谁', () => {
    expect(publishClaimDenyOf({ state: 'conflict', owner: '甲' }, '@demo/probe')).toContain('@demo/probe');
    expect(publishClaimDenyOf({ state: 'conflict', owner: '甲' }, '@demo/probe')).toContain('甲');
    expect(publishClaimDenyOf({ state: 'path-taken', entry: '@demo/other' }, '@demo/probe')).toContain('@demo/other');
  });

  it('没冲突就不拦', () => {
    expect(publishClaimDenyOf({ state: 'owned', owner: '甲' }, 'x')).toBeUndefined();
    expect(publishClaimDenyOf({ state: 'new' }, 'x')).toBeUndefined();
    expect(publishClaimDenyOf(undefined, 'x')).toBeUndefined();
  });
});
