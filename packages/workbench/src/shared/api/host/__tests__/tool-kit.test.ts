import { describe, expect, it } from 'vitest';
import type { DshToolRunContext } from '@dsh-workbench/shared';
import { WorkbenchDataError } from '@dsh-workbench/shared/host';
import { commandHintFor, jsonText, sessionWorkspace, TEXT_OUTPUT, textOutput, textRender } from '@dsh-workbench/shared/host';

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

describe('commandHintFor（命令没跑起来时的那句话）', () => {
  const hint = commandHintFor({ plugin: 'acme', suiteId: 'acme-things' });

  it('`cli-unclassified`：把"照做哪一步"写进 message（模型只看得到 message）', async () => {
    const original = new WorkbenchDataError('cli-unclassified', 'opencli 这条命令没跑通（退出码 1）', {
      detail: "error: unknown command 'thing-fields'",
      hint: '先确认命令存在。',
    });

    try {
      await hint('thing-fields', async () => {
        throw original;
      });
      throw new Error('预期抛错，但它成功了');
    } catch (error) {
      const thrown = error as WorkbenchDataError;
      expect(thrown.code).toBe('cli-unclassified');
      expect(thrown.message.startsWith('opencli 这条命令没跑通（退出码 1）')).toBe(true);
      expect(thrown.detail).toBe("error: unknown command 'thing-fields'");
      expect(thrown.message).toContain('thing-fields');
      expect(thrown.message).toContain('workbench_modules');
      expect(thrown.message).toContain('这份 acme 插件');
      expect(thrown.message).toContain('id=acme-things');
      expect(thrown.hint).toContain('opencli acme thing-fields --help');
      expect(thrown.hint).toContain('先确认命令存在。');
      expect(original.message).not.toContain('workbench_modules');
      expect(original.hint).toBe('先确认命令存在。');
    }
  });

  it('原来的 hint / helpUrl / project 都带过去（补一句话不许丢料）', async () => {
    const original = new WorkbenchDataError('cli-unclassified', '没跑通', {
      hint: '原话。',
      helpUrl: 'https://example.invalid/help',
      project: { team: 't' },
    });

    try {
      await hint('thing-fields', async () => Promise.reject(original));
      throw new Error('预期抛错，但它成功了');
    } catch (error) {
      const thrown = error as WorkbenchDataError;
      expect(thrown.helpUrl).toBe('https://example.invalid/help');
      expect(thrown.project).toEqual({ team: 't' });
      expect(thrown.hint).toContain('原话。');
      expect(thrown.detail).toBeUndefined();
    }
  });

  it('有信封的失败（cli-command-failed）原样抛出：那种错命令已经跑起来了，别赖插件版本', async () => {
    const original = new WorkbenchDataError('cli-command-failed', 'UNKNOWN：不能流转到「x」', {
      hint: '可流转到：待验证。',
    });
    await expect(hint('thing-transfer', async () => Promise.reject(original))).rejects.toBe(original);
  });

  it('非 CLI 类的错原样抛出（参数校验 / 平台身份跟插件版本无关）', async () => {
    const original = new WorkbenchDataError('workbench/unknown-field', '没有这个字段');
    await expect(hint('thing-transfer', async () => Promise.reject(original))).rejects.toBe(original);
  });

  it('不是数据层错误（普通 Error）也原样抛出', async () => {
    const original = new Error('model 调错参数');
    await expect(hint('thing-transfer', async () => Promise.reject(original))).rejects.toBe(original);
  });

  it('成功时原样返回结果（不包一层、不动值）', async () => {
    const value = [1, 2];
    await expect(hint('thing-statuses', async () => value)).resolves.toBe(value);
  });

  it('两家绑出来的话只差各自的名字（机制一份，知识各一份）', async () => {
    const message = async (bound: ReturnType<typeof commandHintFor>): Promise<string> => {
      try {
        await bound('cmd', async () => {
          throw new WorkbenchDataError('cli-unclassified', '没跑通');
        });
        throw new Error('预期抛错');
      } catch (error) {
        return (error as WorkbenchDataError).message;
      }
    };

    const a = await message(commandHintFor({ plugin: 'acme', suiteId: 'acme-things' }));
    const b = await message(commandHintFor({ plugin: 'acme', suiteId: 'acme-others' }));
    expect(a).toContain('acme-things');
    expect(a).not.toContain('acme-others');
    expect(b).toContain('acme-others');
    expect(a.replace('acme-things', 'X')).toBe(b.replace('acme-others', 'X'));
  });
});
