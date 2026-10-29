import { describe, expect, it } from 'vitest';
import { en } from '../en.js';
import { zh } from '../zh.js';

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? '').sort();
}

const zhKeys = Object.keys(zh).sort();
const enKeys = Object.keys(en).sort();

describe('dictionaries', () => {
  it('两种语言的键集合完全一致', () => {
    expect(enKeys).toEqual(zhKeys);
  });

  it('没有空文案（空值会静默显示成空白）', () => {
    for (const [language, dictionary] of [['zh', zh], ['en', en]] as const) {
      for (const [key, value] of Object.entries(dictionary)) {
        expect(value.trim(), `${language}.${key}`).not.toBe('');
      }
    }
  });

  it('同一个键在两语言里的占位符一致', () => {
    for (const key of zhKeys) {
      const zhText = (zh as Record<string, string>)[key] ?? '';
      const enText = (en as Record<string, string>)[key] ?? '';
      expect(placeholders(enText), key).toEqual(placeholders(zhText));
    }
  });

  it('复数键成对出现（`.one` 必须有 `.other`，否则英文会缺一档）', () => {
    const oneKeys = zhKeys.filter((key) => key.endsWith('.one'));
    expect(oneKeys.length).toBeGreaterThan(0);
    for (const key of oneKeys) {
      expect(zhKeys, key).toContain(`${key.slice(0, -'.one'.length)}.other`);
    }
  });
});
