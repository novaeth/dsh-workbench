import { describe, expect, it } from 'vitest';
import type { WorkbenchPage } from '../model/diy-browser';
import { desktopPageText } from '../model/diy-page';

const blank: WorkbenchPage = {
  ok: false,
  url: 'about:blank',
  title: '',
  where: '',
  board: '',
  open: null,
  shown: false,
};

describe('Desktop 里 DIY 页面工具的说明', () => {
  it('★ 说清是 Electron 窗口不是 Chrome 标签，并给一条能照做的下一步', () => {
    const text = desktopPageText(blank);

    expect(text).toContain('dsh-app://app/');
    expect(text).toContain('Chrome');
    expect(text).toContain('about:blank');
    expect(text).toContain('屏调试');
    expect(text).toContain('read=<地址>');
    expect(text).toContain('_record_*');
    expect(text).toContain('diy_status');
  });

  it('没有绑到页时也不硬编一个 URL', () => {
    const text = desktopPageText();

    expect(text).not.toContain('现在绑到的是');
    expect(text).toContain('没有可绑的目标');
  });
});
