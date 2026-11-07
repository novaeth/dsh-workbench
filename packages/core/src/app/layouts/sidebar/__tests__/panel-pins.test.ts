import { describe, expect, it } from 'vitest';
import { isPanelShown, withPanelPinned } from '../panel-pins';

describe('面板列固定/收起：跟 dsh 官方 sidebar 的 unpinned 语义一致', () => {
  it('★ 未收起的都显示；收起的从面板列里拿掉', () => {
    expect(isPanelShown('schedules', [])).toBe(true);
    expect(isPanelShown('schedules', ['schedules'])).toBe(false);
  });

  it('★ 插件入口永远显示（官方写死 id === "plugins" 不进更多菜单）', () => {
    expect(isPanelShown('plugins', ['plugins'])).toBe(true);
    expect(withPanelPinned([], 'plugins', false)).toEqual([]);
    expect(withPanelPinned(['plugins'], 'plugins', true)).toEqual(['plugins']);
  });

  it('★ 收起 = 进 unpinned；固定 = 从 unpinned 里删掉', () => {
    expect(withPanelPinned([], 'schedules', false)).toEqual(['schedules']);
    expect(withPanelPinned(['schedules', 'market'], 'schedules', true)).toEqual(['market']);
  });

  it('★ 已经是要的状态就不换引用（setState 靠这个跳过重渲染）', () => {
    const unpinned = ['schedules'];

    expect(withPanelPinned(unpinned, 'schedules', false)).toBe(unpinned);
    expect(withPanelPinned(unpinned, 'market', true)).toBe(unpinned);
  });
});
