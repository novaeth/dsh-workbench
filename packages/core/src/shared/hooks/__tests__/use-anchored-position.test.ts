import { describe, expect, it } from 'vitest';
import { anchoredPositionOf } from '../use-anchored-position';

const viewport = { width: 1000, height: 700 };

describe('锚定浮层的位置：上游把 useAnchoredPosition 撤了，得自己算', () => {
  it('★ 默认挂在锚点下方；align=end 时右边缘对齐锚点右边缘', () => {
    const style = anchoredPositionOf({
      anchor: { top: 100, right: 500, bottom: 130, left: 440 },
      panel: { width: 300, height: 200 },
      viewport,
      align: 'end',
      gap: 6,
      margin: 12,
    });
    expect(style).toMatchObject({ top: '136px', left: '200px' });
  });

  it('★ 下方放不下就翻到上方', () => {
    const style = anchoredPositionOf({
      anchor: { top: 600, right: 500, bottom: 630, left: 440 },
      panel: { width: 300, height: 200 },
      viewport,
      align: 'start',
      gap: 6,
      margin: 12,
    });
    expect(style).toMatchObject({ top: '394px', left: '440px' });
  });

  it('★ 左右都夹在视口里，至少留一个 margin', () => {
    const left = anchoredPositionOf({
      anchor: { top: 0, right: 40, bottom: 20, left: 10 },
      panel: { width: 300, height: 100 },
      viewport,
      align: 'end',
      gap: 6,
      margin: 12,
    });
    expect(left.left).toBe('12px');

    const right = anchoredPositionOf({
      anchor: { top: 0, right: 990, bottom: 20, left: 960 },
      panel: { width: 300, height: 100 },
      viewport,
      align: 'start',
      gap: 6,
      margin: 12,
    });
    expect(right.left).toBe('688px');
  });
});
