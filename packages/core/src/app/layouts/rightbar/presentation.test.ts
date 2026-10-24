import { describe, expect, it } from 'vitest';
import { RIGHTBAR_FULLSCREEN_WIDTH } from '@dsh-workbench/shared';
import { rightbarPresentation } from './presentation';

describe('rightbarPresentation', () => {
  it('宽屏且放得下：占一条轨道，不全屏', () => {
    expect(rightbarPresentation({ shown: true, viewportWidth: 1440, canShow: true })).toEqual({
      track: true,
      fullscreen: false,
    });
  });

  it('窄屏一律全屏覆盖（跟出场同一档：viewportWidth < 768）', () => {
    expect(
      rightbarPresentation({
        shown: true,
        viewportWidth: RIGHTBAR_FULLSCREEN_WIDTH - 1,
        canShow: true,
      }),
    ).toEqual({ track: false, fullscreen: true });
  });

  it('全屏那档不再占轨道（窄屏不能在对话区旁边再挤一条）', () => {
    expect(rightbarPresentation({ shown: true, viewportWidth: 390, canShow: true }).track).toBe(false);
  });

  it('放不下也全屏（宽度够但列宽被解成 0）', () => {
    expect(rightbarPresentation({ shown: true, viewportWidth: 1440, canShow: false })).toEqual({
      track: false,
      fullscreen: true,
    });
  });

  it('收起时不占轨道也不全屏', () => {
    expect(rightbarPresentation({ shown: false, viewportWidth: 390, canShow: false })).toEqual({
      track: false,
      fullscreen: false,
    });
  });
});
