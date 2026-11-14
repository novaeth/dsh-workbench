import { describe, expect, it } from 'vitest';
import { contentBlocksOf } from '../ai-blocks';

const image = {
  kind: 'image',
  data: new Uint8Array([1, 2, 3]),
  mediaType: 'image/png',
  name: 'a.png',
} as const;

describe('内容块', () => {
  it('文字与图片按顺序拼成块，图片经附件服务落成引用', async () => {
    const saved: unknown[] = [];
    const blocks = await contentBlocksOf(
      [{ kind: 'text', text: '看图' }, image],
      {
        saveImage: async (input) => {
          saved.push(input);
          return { attachmentId: 'a-1' };
        },
      },
      '缺附件服务',
    );
    expect(blocks).toEqual([
      { type: 'text', text: '看图' },
      { type: 'image', attachment: { attachmentId: 'a-1' } },
    ]);
    expect(saved).toEqual([{ data: image.data, mediaType: 'image/png', name: 'a.png' }]);
  });

  it('没有附件服务时给图报 unsupported-input', async () => {
    await expect(contentBlocksOf([image], undefined, '缺附件服务')).rejects.toMatchObject({
      code: 'unsupported-input',
      message: '缺附件服务',
    });
  });

  it('只有文字时不需要附件服务', async () => {
    expect(await contentBlocksOf([{ kind: 'text', text: 'x' }], undefined, '缺附件服务')).toEqual([
      { type: 'text', text: 'x' },
    ]);
  });
});
