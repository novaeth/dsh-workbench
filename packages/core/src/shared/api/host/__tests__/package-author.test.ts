import { describe, expect, it } from 'vitest';
import { authorOf } from '../package-author';

describe('package.json 的作者字段', () => {
  it('★ 字符串原样；对象拼成「名字 <邮箱>」', () => {
    expect(authorOf({ author: '张三' })).toBe('张三');
    expect(authorOf({ author: { name: '张三', email: 'z@example.com' } })).toBe('张三 <z@example.com>');
    expect(authorOf({ author: { name: '张三' } })).toBe('张三');
  });

  it('★ 没有或形状不对时给空串，不拼半个作者', () => {
    expect(authorOf({})).toBe('');
    expect(authorOf({ author: null })).toBe('');
    expect(authorOf({ author: { email: 'z@example.com' } })).toBe('');
  });
});
