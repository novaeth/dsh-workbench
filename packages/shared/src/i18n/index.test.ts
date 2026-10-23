import { describe, expect, it } from 'vitest';
import { en } from './en.js';
import { dictionaries } from './index.js';
import { zh } from './zh.js';

describe('dictionaries', () => {
  it('同时导出两种语言，且就是那两份字典', () => {
    expect(dictionaries.zh).toBe(zh);
    expect(dictionaries.en).toBe(en);
  });

  it('只有这两种语言（多出来的键会被 locale 服务忽略，属于死代码）', () => {
    expect(Object.keys(dictionaries).sort()).toEqual(['en', 'zh']);
  });
});
