import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hashTargetsSection } from '../rightbar/kit-preview-hash';

const HERE = new URL('../', import.meta.url);
const read = (name: string): string => readFileSync(new URL(name, HERE), 'utf8');

describe('点导航 chip 落到一节：命中自己的 id 就展开（§17 预览）', () => {
  it('纯函数：只认自己那一条（含浏览器把中文锚点转成百分号编码的那一档）', () => {
    expect(hashTargetsSection('kit-forms', '#kit-forms')).toBe(true);
    expect(hashTargetsSection('kit-表单的行', '#kit-%E8%A1%A8%E5%8D%95%E7%9A%84%E8%A1%8C')).toBe(true);
    expect(hashTargetsSection('kit-表单的行', '#kit-表单的行')).toBe(true);
    expect(hashTargetsSection('kit-forms', '#kit-form')).toBe(false);
    expect(hashTargetsSection('kit-forms', '#other')).toBe(false);
    expect(hashTargetsSection('kit-forms', '')).toBe(false);
    expect(hashTargetsSection('kit-forms', 'kit-forms')).toBe(false);
    expect(hashTargetsSection('', '#kit-forms')).toBe(false);
    expect(hashTargetsSection('kit-forms', '#kit-%ZZ')).toBe(false);
  });

  it('★ 一节真的监听 hashchange、首次挂载就对一次、命中就展开（源码断言：这一层没有渲染测试基建）', () => {
    const source = read('rightbar/kit-preview-frame.tsx');

    expect(source).toContain('hashTargetsSection(anchor, window.location.hash)');
    expect(source).toContain("window.addEventListener('hashchange', sync)");
    expect(source).toContain("window.removeEventListener('hashchange', sync)");
    expect(source).toContain('setOpen(true)');
    expect(source).toContain('sync();');
  });
});
