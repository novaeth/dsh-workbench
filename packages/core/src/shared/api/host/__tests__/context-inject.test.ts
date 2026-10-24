import { describe, expect, it, vi } from 'vitest';
import { buildMarker } from '@dsh-workbench/shared';
import { buildContextMessage, collectContextRefs, createContextInjector, CONTEXT_SOURCE_KIND } from '../context-inject';

const msg = (kind: string, text: string) => ({ source: { kind }, content: [{ type: 'text', text }] });
const issue = { kind: 'issue', parts: ['team', 'proj', '1346'] } as const;

describe('collectContextRefs', () => {
  it('只扫用户消息的文本块', () => {
    const refs = collectContextRefs([
      msg('assistant', `助手也提到 ${buildMarker(issue)} 但不算引用`),
      msg('user', `看看 ${buildMarker(issue)}`),
    ]);

    expect(refs).toEqual([issue]);
  });

  it('跨消息、同一条重复只算一次', () => {
    const refs = collectContextRefs([msg('user', buildMarker(issue)), msg('user', buildMarker(issue))]);

    expect(refs).toHaveLength(1);
  });

  it('没有标记 → 空', () => {
    expect(collectContextRefs([msg('user', '普通一句话')])).toEqual([]);
  });
});

describe('buildContextMessage', () => {
  it('来源是本插件自有 kind（v4 不接受通用 plugin）+ notice 形式带摘要', () => {
    const message = buildContextMessage('正文', '工作台引用：1 条') as {
      role: string;
      content: { type: string; text: string }[];
      source: { kind: string; form: string; summary: string };
      id: string;
    };

    expect(message.role).toBe('user');
    expect(message.content).toEqual([{ type: 'text', text: '正文' }]);
    expect(message.source).toEqual({ kind: CONTEXT_SOURCE_KIND, form: 'notice', summary: '工作台引用：1 条' });
    expect(typeof message.id).toBe('string');
  });
});

describe('createContextInjector', () => {
  it('按 kind 取渲染器：只问认领这个 kind 的那个（不再挨个试、不依赖挂载顺序）', async () => {
    const issueRender = vi.fn(async () => '缺陷 #1346 的正文');
    const commitRender = vi.fn(async () => '提交的正文');
    const injector = createContextInjector({
      renderers: new Map([
        ['issue', issueRender],
        ['commit', commitRender],
      ]),
    });

    const message = (await injector.inject([msg('user', buildMarker(issue))], {})) as {
      content: { text: string }[];
    };

    expect(issueRender).toHaveBeenCalledTimes(1);
    expect(commitRender).not.toHaveBeenCalled();
    expect(message.content[0]?.text).toContain('#1346');
  });

  it('没人认领这个 kind → 不注入（不塞空消息）', async () => {
    const injector = createContextInjector({ renderers: new Map() });

    expect(await injector.inject([msg('user', buildMarker(issue))], {})).toBeUndefined();
  });

  it('渲染器回空串 → 不注入（空消息对模型只有害）', async () => {
    const injector = createContextInjector({ renderers: new Map([['issue', async () => '']]) });

    expect(await injector.inject([msg('user', buildMarker(issue))], {})).toBeUndefined();
  });

  it('同一个 agent 的同一条引用只注入一次', async () => {
    const render = vi.fn(async () => '正文');
    const injector = createContextInjector({ renderers: new Map([['issue', render]]) });
    const agent = {};

    const firstCall = await injector.inject([msg('user', buildMarker(issue))], agent);
    const secondCall = await injector.inject([msg('user', buildMarker(issue))], agent);

    expect(firstCall).toBeDefined();
    expect(secondCall).toBeUndefined();
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('**渲染抛错也不许抛出去**：退化成一句可读说明（否则整轮会被打成失败）', async () => {
    const warn = vi.fn();
    const injector = createContextInjector({
      logger: { warn },
      renderers: new Map([
        [
          'issue',
          async () => {
            throw new Error('没有可用的项目目录');
          },
        ],
      ]),
    });

    const message = (await injector.inject([msg('user', buildMarker(issue))], {})) as {
      content: { text: string }[];
    };

    expect(message.content[0]?.text).toContain('渲染不出来');
    expect(warn).toHaveBeenCalled();
  });

  it('换一个 agent 会重新注入（作用域按会话/主体）', async () => {
    const injector = createContextInjector({ renderers: new Map([['issue', async () => '正文']]) });

    expect(await injector.inject([msg('user', buildMarker(issue))], { a: 1 })).toBeDefined();
    expect(await injector.inject([msg('user', buildMarker(issue))], { b: 2 })).toBeDefined();
  });
});
