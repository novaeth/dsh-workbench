import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const HERE = new URL('../', import.meta.url);
const read = (name: string): string => readFileSync(new URL(name, HERE), 'utf8');

describe('设置折叠区：收起是右箭头，展开才转向下', () => {
  it('★ 收起态用右箭头，展开时旋转 90 度（源码断言：这一层没有渲染测试基建）', () => {
    const source = read('workbench-settings/SettingsDisclosure.tsx');
    const css = read('workbench-settings/SettingsDisclosure.module.css');

    expect(source).toContain('IconChevronRightOutlineRegular');
    expect(source).not.toContain('IconChevronDownOutlineRegular');
    expect(source).toContain('aria-expanded={open}');
    expect(css).toContain("[aria-expanded='true'] .chevron");
    expect(css).toContain('transform: rotate(90deg);');
    expect(css).not.toContain('transform: rotate(180deg);');
  });
});
