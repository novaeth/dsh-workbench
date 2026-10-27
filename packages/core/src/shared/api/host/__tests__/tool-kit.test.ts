import { describe, expect, it } from 'vitest';
import type { DshToolRunContext } from '@dsh-workbench/shared';
import { jsonText, sessionWorkspace, TEXT_OUTPUT, textOutput, textRender } from '@dsh-workbench/shared/host';

const at = (cwd: string | undefined): DshToolRunContext =>
  cwd === undefined ? {} : ({ agent: { session: { header: { cwd } } } } as DshToolRunContext);

describe('sessionWorkspace', () => {
  it('取 dsh 给的事实；没有 / 空白都是 null（绝不编一个路径）', () => {
    expect(sessionWorkspace(at('/w/a'))).toBe('/w/a');
    expect(sessionWorkspace(at(undefined))).toBeNull();
    expect(sessionWorkspace(at('   '))).toBeNull();
    expect(sessionWorkspace(undefined)).toBeNull();
  });

  it('两边的空白修掉（会话头偶尔带空格，路径不该带着它去查库）', () => {
    expect(sessionWorkspace(at('  /w/a  '))).toBe('/w/a');
  });
});

describe('textOutput / textRender', () => {
  it('textRender 优先给 value.text（模型看到的就是它）', () => {
    expect(textRender({}, { text: '给模型看的', 别的: 1 })).toEqual([{ type: 'text', text: '给模型看的' }]);
  });

  it('拿不到 text 就退回整份 JSON（工具漏给 text 时至少还有东西可看）', () => {
    expect(textRender({}, { a: 1 })).toEqual([{ type: 'text', text: '{"a":1}' }]);
    expect(textRender({}, null)).toEqual([{ type: 'text', text: 'null' }]);
  });

  it('textOutput 就是一条文本块', () => {
    expect(textOutput('你好')).toEqual([{ type: 'text', text: '你好' }]);
  });
});

describe('TEXT_OUTPUT / jsonText', () => {
  it('输出声明用同一份渲染，且放行额外字段（平台字段类型是联合类型，声明不了）', () => {
    expect(TEXT_OUTPUT.render).toBe(textRender);
    expect(TEXT_OUTPUT.schema.additionalProperties).toBe(true);
  });

  it('jsonText 紧凑（缩进会把 token 翻一倍）', () => {
    expect(jsonText({ a: 1, b: [1, 2] })).toBe('{"a":1,"b":[1,2]}');
  });
});
