import { aiError, type AiPart } from '@dsh-workbench/shared/host';

export interface AttachmentStore {
  saveImage(input: { data: Uint8Array; mediaType: string; name?: string }): Promise<unknown>;
}

export async function contentBlocksOf(
  parts: readonly AiPart[],
  store: AttachmentStore | undefined,
  missingStoreText: string,
): Promise<readonly unknown[]> {
  const blocks: unknown[] = [];
  for (const part of parts) {
    if (part.kind === 'text') {
      blocks.push({ type: 'text', text: part.text });
      continue;
    }
    if (store === undefined) throw aiError('unsupported-input', missingStoreText);
    const ref = await store.saveImage({
      data: part.data,
      mediaType: part.mediaType,
      ...(part.name === undefined ? {} : { name: part.name }),
    });
    blocks.push({ type: 'image', attachment: ref });
  }
  return blocks;
}
