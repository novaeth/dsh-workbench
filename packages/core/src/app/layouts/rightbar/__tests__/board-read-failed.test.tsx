import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BoardReadFailed } from '../BoardReadFailed';

const t = ((key: string) => key) as never;

describe('面板列读失败的阻断态', () => {
  it('★ 有码时把码与原因都放进详情，能渲染不抛', () => {
    const render = (): string =>
      renderToStaticMarkup(h(BoardReadFailed, { t, detail: '磁盘读不了', code: 'READ_FAILED', onRetry: () => undefined }));

    expect(render).not.toThrow();
  });

  it('★ 认识的诊断码走它自己的标题，不是通用那句', () => {
    const source = renderToStaticMarkup(
      h(BoardReadFailed, { t, detail: '磁盘读不了', code: 'READ_FAILED', onRetry: () => undefined, busy: false }),
    );
    const fallback = renderToStaticMarkup(
      h(BoardReadFailed, { t, detail: '磁盘读不了', code: 'NOPE', onRetry: () => undefined, busy: false }),
    );

    expect(source).not.toBe(fallback);
  });

  it('★ 清单读失败：标题说清单，不栽到「面板配置」上', () => {
    const html = renderToStaticMarkup(
      h(BoardReadFailed, { t, detail: '清单读不了', manifestsOnly: true, onRetry: () => undefined }),
    );

    expect(html).toContain('panels.manifestsReadFailed');
    expect(html).not.toContain('panels.boardReadFailed');
  });

  it('没有码时只放原因', () => {
    expect(() => renderToStaticMarkup(h(BoardReadFailed, { t, detail: '网络断了', onRetry: () => undefined }))).not.toThrow();
  });
});
