import { describe, expect, it } from 'vitest';
import { pageSchema, SESSION_PROP, UNIT_PROP } from './diy-schema';

describe('工坊工具的参数表：unit / session 是每把都有的那两格', () => {
  it('★ 每把都收 unit 与 session，且不收别的（additionalProperties: false）', () => {
    const schema = pageSchema({ key: { type: 'string' } });

    expect(Object.keys(schema['properties'] as Record<string, unknown>)).toEqual(['unit', 'key', 'session']);
    expect(schema['additionalProperties']).toBe(false);
    expect(schema['required']).toBeUndefined();
  });

  it('★ 自己那几格必填的就写进 required；没有必填就不写这一格', () => {
    expect(pageSchema({ key: { type: 'string' } }, ['key'])['required']).toEqual(['key']);
    expect(pageSchema()['required']).toBeUndefined();
    expect(Object.keys(pageSchema()['properties'] as Record<string, unknown>)).toEqual(['unit', 'session']);
  });

  it('★ 两格的说明只住这一份（改一处，二十几把工具一起变）', () => {
    expect(UNIT_PROP.description).toContain('工作区里的 unit');
    expect(SESSION_PROP.description).toContain('会话名');
  });
});
