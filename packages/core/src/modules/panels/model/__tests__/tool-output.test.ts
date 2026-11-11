import { describe, expect, it } from 'vitest';
import { OUTPUT, textOutput } from '../tool-output';

describe('工具返回的文本外壳', () => {
  it('默认只认 text 一格，其余字段放行', () => {
    expect(OUTPUT.schema).toEqual({
      type: 'object',
      properties: { text: { type: 'string' } },
      additionalProperties: true,
    });
  });

  it('要额外字段就叠在 text 后面，不改 text 的口径', () => {
    const output = textOutput({ sources: { type: 'array', items: { type: 'object' } } });

    expect(Object.keys(output.schema.properties ?? {})).toEqual(['text', 'sources']);
  });

  it('render 拿 text 直接上屏；没有 text 就退成 JSON', () => {
    expect(OUTPUT.render(undefined, { text: '好了' })).toEqual([{ type: 'text', text: '好了' }]);
    expect(OUTPUT.render(undefined, { other: 1 })).toEqual([{ type: 'text', text: '{"other":1}' }]);
  });
});
