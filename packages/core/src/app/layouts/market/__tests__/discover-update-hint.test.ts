import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const HERE = new URL('../', import.meta.url);
const read = (name: string): string => readFileSync(new URL(name, HERE), 'utf8');

const ROWS = read('discover-rows.tsx');
const CSS = read('MarketPage.module.css');

describe('发现列表那一格：有新版就用黄字说的是「有新版本」', () => {
  it('★ 只有 update-available 才挂黄字那枚类（已装、没新版的不上色）', () => {
    expect(ROWS).toContain("const update = latest.install === 'update-available';");
    expect(ROWS).toContain('className={update ? styles.discoverUpdateAction : undefined}');
  });

  it('★ 黄字取 warn 令牌，不写字面色值', () => {
    expect(CSS).toContain('.discoverUpdateAction {');
    expect(CSS).toContain('color: var(--dsw-alias-state-warn-primary);');
  });
});
