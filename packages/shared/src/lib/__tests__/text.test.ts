import { describe, expect, it } from 'vitest';
import { excerpt, parseJsonLoose } from '../text.js';

describe('parseJsonLoose', () => {
  it('干净 JSON 直接解析', () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonLoose('[1,2]')).toEqual([1, 2]);
  });

  it('前面有噪音时从第一个结构符开始解析', () => {
    expect(parseJsonLoose('正在检查更新…\n[{"code":2133}]')).toEqual([{ code: 2133 }]);
    expect(parseJsonLoose('warn: x\n{"ok":true}')).toEqual({ ok: true });
  });

  it('尾部有噪音时截到最后闭合符', () => {
    expect(parseJsonLoose('[1,2]\n完成')).toEqual([1, 2]);
  });

  it('★ 噪音行自己带方括号时也不认错起点（真机：acme 的调试命令先打两行带 [] 的话）', () => {
    const stdout = [
      '数据源 [dify_dataset] 调试成功',
      '结构类型: 3, 字段: code, name',
      '[',
      '  {',
      '    "code": "dify_dataset",',
      '    "success": "成功",',
      '    "detail": "structure=3, keys=[code, name], fields=[{code=知识库ID}]"',
      '  }',
      ']',
    ].join('\n');

    expect(parseJsonLoose(stdout)).toEqual([
      {
        code: 'dify_dataset',
        success: '成功',
        detail: 'structure=3, keys=[code, name], fields=[{code=知识库ID}]',
      },
    ]);
  });

  it('解析不出来给 undefined，让调用方报 demo-bad-output', () => {
    expect(parseJsonLoose('')).toBeUndefined();
    expect(parseJsonLoose('not json at all')).toBeUndefined();
    expect(parseJsonLoose('[1,2')).toBeUndefined();
  });
});

describe('excerpt', () => {
  it('剥掉图片语法（它没有文字信息）', () => {
    expect(excerpt('![picture](/api/project/1/files/2/imagePreview)', 80)).toBe('');
  });

  it('链接只留可见文字，标记符号压平', () => {
    expect(excerpt('见 [设计稿](https://x/y) 与 **重点**', 80)).toBe('见 设计稿 与 重点');
  });

  it('压平换行与多余空白，模板正文变成一行', () => {
    expect(excerpt('\n【复现步骤】\n\n\n【预期结果】\n', 80)).toBe('【复现步骤】 【预期结果】');
  });

  it('超长时按字符截断并加省略号', () => {
    const long = '一二三四五六七八九十'.repeat(10);
    const out = excerpt(long, 12);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBe(13);
  });

  it('空输入给空串', () => {
    expect(excerpt(undefined, 20)).toBe('');
    expect(excerpt('   ', 20)).toBe('');
  });
});
