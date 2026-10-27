import { describe, expect, it } from 'vitest';
import type { TokenEntry, TokenSet } from '@dsh-workbench/shared/host';
import { PRUNE_CHARS } from '../diy-components';
import { renderTokensText } from '../diy-tokens';

function entry(name: string, light: string | null, dark: string | null = light): TokenEntry {
  return { name, values: { light, dark } };
}

const set: TokenSet = {
  dsw: {
    package: '@deepseek-ai/dsh-client-ui-theme',
    version: '0.2.1-rc.2',
    file: '/dsh/node_modules/@deepseek-ai/dsh-client-ui-theme/lib/client.js',
    entries: [
      entry('--dsw-alias-bg-layer-1', '#fff', '#232324'),
      entry('--dsw-alias-label-primary', '#171b21', '#f2f3f5'),
      entry('--dsw-font-s-14', '14px/22px system-ui'),
      entry('--dsw-radius-md', '12px'),
      entry('--dsw-static-neutral-bluish-700', '#61666b'),
      entry('--dsw-alias-turn-trigger-bg', '#f5f5f5', '#2a2a2a'),
    ],
  },
  wb: {
    package: '@dsh-workbench/core',
    version: '0.3.11',
    file: '/w/core/client.js',
    entries: [entry('--wb-len-16', '16px'), entry('--wb-gap-xs', '6px')],
  },
};

const searched = ['/dsh/profiles', '/w/core'];

describe('workbench_diy_components · 令牌清单', () => {
  it('默认只给来源、族与计数，外加下一次怎么问（不铺名字）', () => {
    const text = renderTokensText(set, { name: '', bucket: '', all: false, searched });
    expect(text).toContain('--dsw-* 6 个（dsh 主题 0.2.1-rc.2）');
    expect(text).toContain('--wb-* 2 个（外壳 0.3.11）');
    expect(text).toContain('按族：alias 3');
    expect(text).toContain('bucket=alias');
    expect(text).toContain('bucket=wb');
    expect(text).toContain('name=--dsw-alias-bg-layer-1');
    expect(text).not.toContain('--dsw-alias-label-primary');
    expect(text).not.toContain('外壳自己');
  });

  it('给名字回浅/深值', () => {
    const layer = renderTokensText(set, { name: '--dsw-alias-bg-layer-1', bucket: '', all: false, searched });
    expect(layer).toContain('--dsw-alias-bg-layer-1 在清单里（dsh 主题 0.2.1-rc.2）');
    expect(layer).toContain('浅 #fff / 深 #232324');
    const once = renderTokensText(set, { name: '--dsw-radius-md', bucket: '', all: false, searched });
    expect(once).toContain('值 12px');
    const wb = renderTokensText(set, { name: '--wb-len-16', bucket: '', all: false, searched });
    expect(wb).toContain('--wb-len-16 在清单里（外壳 0.3.11）');
    expect(wb).toContain('值 16px');
  });

  it('★ 名字不在清单里：点明没有、给近似的、说下一步怎么问（不猜一个假的）', () => {
    const text = renderTokensText(set, { name: '--dsw-alias-bg-cart', bucket: '', all: false, searched });
    expect(text).toContain('--dsw-alias-bg-cart 清单里没有它');
    expect(text).toContain('近似的名字：');
    expect(text).toContain('--dsw-alias-bg-layer-1');
    expect(text).toContain('name=');
  });

  it('按族列全；wb 自成一族；问错族时把能问的列出来', () => {
    const alias = renderTokensText(set, { name: '', bucket: 'alias', all: false, searched });
    expect(alias).toContain('--dsw-alias-* 3 个');
    expect(alias).toContain('--dsw-alias-turn-trigger-bg');
    const wb = renderTokensText(set, { name: '', bucket: 'wb', all: false, searched });
    expect(wb).toContain('--wb-len-16');
    expect(wb).toContain('--wb-gap-xs');
    const wrong = renderTokensText(set, { name: '', bucket: 'nonsense', all: false, searched });
    expect(wrong).toContain('没有「nonsense」这一族');
    expect(wrong).toContain('alias（3）');
    expect(wrong).toContain('wb（2）');
  });

  it('all 给全表；太长就截断并说清截了、下一问去哪', () => {
    expect(renderTokensText(set, { name: '', bucket: '', all: true, searched })).toContain('--dsw-static-neutral-bluish-700');
    const many: TokenSet = {
      dsw: {
        package: 'p',
        version: '1',
        file: 'f',
        entries: Array.from({ length: 600 }, (_unused, index) => entry(`--dsw-alias-filler-${index}`, '#000')),
      },
      wb: null,
    };
    const text = renderTokensText(many, { name: '', bucket: '', all: true, searched });
    expect(text.length).toBeLessThanOrEqual(PRUNE_CHARS + 120);
    expect(text).toContain('截了');
    expect(text).toContain('bucket=alias');
  });

  it('★ 读不到 dsh 主题：说读不到、找过哪，别把 --wb-* 说成没有', () => {
    const text = renderTokensText({ dsw: null, wb: set.wb }, { name: '', bucket: '', all: false, searched });
    expect(text).toContain('--dsw-* 没读到');
    expect(text).toContain('/dsh/profiles');
    expect(text).toContain('--wb-* 2 个');
    expect(text).toContain('bucket=wb');
  });

  it('一个都读不到时按名字问：明说没法验，不编造', () => {
    const text = renderTokensText({ dsw: null, wb: null }, { name: '--dsw-alias-bg-layer-1', bucket: '', all: false, searched });
    expect(text).toContain('没法验');
    expect(text).toContain('--dsw-* 没读到');
  });
});
