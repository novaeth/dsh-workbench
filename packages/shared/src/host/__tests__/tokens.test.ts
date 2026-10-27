import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DSH_THEME_PACKAGE,
  SHELL_PACKAGE,
  nearestTokens,
  readTokens,
  tokenEntriesIn,
  tokenFamilyOf,
} from '../tokens.js';

const THEME_CSS = [
  ':root{--dsw-static-neutral-bluish-00:#fff;--dsw-font-family:system-ui;',
  '--dsw-font-s-14:14px/22px var(--dsw-font-family);',
  '--dsw-alias-bg-layer-1:var(--dsw-static-neutral-bluish-00)}',
  'body[data-ds-dark-theme]{--dsw-static-neutral-bluish-00:#111;',
  '--dsw-alias-bg-layer-1:var(--dsw-static-neutral-bluish-00)}',
].join('');

const SHELL_CSS = [
  ':root{--wb-len-16:16px;--wb-gap-xs:6px}',
  '.card{color:var(--dsw-alias-bg-layer-1);padding:var(--wb-len-16)}',
].join('');

function fakeTree(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-tokens-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'fixture', private: true }));

  const theme = join(root, 'node_modules', ...DSH_THEME_PACKAGE.split('/'));
  mkdirSync(join(theme, 'lib'), { recursive: true });
  writeFileSync(join(theme, 'package.json'), JSON.stringify({ name: DSH_THEME_PACKAGE, version: '9.9.9' }));
  writeFileSync(join(theme, 'lib', 'client.js'), `const css = ${JSON.stringify(THEME_CSS)};`);

  const shell = join(root, 'node_modules', ...SHELL_PACKAGE.split('/'));
  mkdirSync(shell, { recursive: true });
  writeFileSync(join(shell, 'package.json'), JSON.stringify({ name: SHELL_PACKAGE, version: '1.2.3' }));
  writeFileSync(join(shell, 'client.js'), `const css = ${JSON.stringify(SHELL_CSS)};`);
  return root;
}

describe('tokenEntriesIn', () => {
  it('只认前缀，浅色与深色分开取，同一个方案里只留第一处', () => {
    const entries = tokenEntriesIn(THEME_CSS, '--dsw-');
    expect(entries.map((one) => one.name)).toEqual([
      '--dsw-alias-bg-layer-1',
      '--dsw-font-family',
      '--dsw-font-s-14',
      '--dsw-static-neutral-bluish-00',
    ]);
    const layer = entries.find((one) => one.name === '--dsw-alias-bg-layer-1');
    expect(layer?.values).toEqual({ light: '#fff', dark: '#111' });
  });

  it('值里的 var() 按同一个方案解析到底，解析不了的原样留着', () => {
    const entries = tokenEntriesIn(`${THEME_CSS}:root{--dsw-radius-md:12px;--dsw-shadow-lv1:0 0 2px var(--dsw-missing)}`, '--dsw-');
    const font = entries.find((one) => one.name === '--dsw-font-s-14');
    expect(font?.values.light).toBe('14px/22px system-ui');
    const shadow = entries.find((one) => one.name === '--dsw-shadow-lv1');
    expect(shadow?.values.light).toBe('0 0 2px var(--dsw-missing)');
  });

  it('没有声明就给空数组，不把别的令牌带进来', () => {
    expect(tokenEntriesIn('.x{color:red}', '--dsw-')).toEqual([]);
    expect(tokenEntriesIn('', '--dsw-')).toEqual([]);
  });
});

describe('readTokens', () => {
  it('按起始目录解析出装着的主题与外壳，各带版本、文件与值', () => {
    const root = fakeTree();
    const set = readTokens([root]);
    expect(set.dsw?.package).toBe(DSH_THEME_PACKAGE);
    expect(set.dsw?.version).toBe('9.9.9');
    expect(set.dsw?.file.endsWith(join('lib', 'client.js'))).toBe(true);
    expect(set.wb?.version).toBe('1.2.3');
    expect(set.wb?.entries.map((one) => one.name)).toEqual(['--wb-gap-xs', '--wb-len-16']);
  });

  it('一个都解析不到就给两个空位，不抛', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-tokens-empty-'));
    expect(readTokens([root])).toEqual({ dsw: null, wb: null });
  });

  it('同一个起始目录上，前面那个包没装就接着往后找', () => {
    const themeOnly = fakeTree();
    const shellOnly = fakeTree();
    const set = readTokens([themeOnly, shellOnly]);
    expect(set.dsw?.version).toBe('9.9.9');
    expect(set.wb?.version).toBe('1.2.3');
  });
});

describe('nearestTokens', () => {
  it('拼错两个字母以内给最近的几个，差太远的不要', () => {
    const names = ['--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2', '--dsw-alias-label-primary'];
    expect(nearestTokens('--dsw-alias-bg-layr-1', names)).toEqual(['--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2']);
    expect(nearestTokens('--dsw-alias-bg-layer-9', names)).toEqual(['--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2']);
    expect(nearestTokens('--complete-other-thing', names)).toEqual([]);
  });
});

describe('tokenFamilyOf', () => {
  it('取前缀后面那一段，用来分桶', () => {
    expect(tokenFamilyOf('--dsw-alias-bg-layer-1')).toBe('alias');
    expect(tokenFamilyOf('--wb-len-16')).toBe('len');
    expect(tokenFamilyOf('--dsw-radius-md')).toBe('radius');
  });
});
