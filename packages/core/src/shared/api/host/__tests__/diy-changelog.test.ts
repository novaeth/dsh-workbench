import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHANGELOG_FILE } from '@dsh-workbench/shared/host';
import { moduleVersionOf, writeChangelogEntry } from '../diy-changelog';

function moduleOf(version = '0.1.0'): string {
  const dir = mkdtempSync(join(tmpdir(), 'wb-diy-changelog-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'probe', version }));
  return dir;
}

describe('writeChangelogEntry', () => {
  it('文件不在就从骨架起，写入的格式跟文档站一致', () => {
    const dir = moduleOf();
    try {
      const written = writeChangelogEntry(dir, {
        version: '0.1.0',
        kind: 'added',
        note: '第一条',
        date: '2026-10-26',
      });
      expect(written.file).toBe(join(dir, CHANGELOG_FILE));
      expect(written.section).toContain('### ✨ 新增');
      const text = readFileSync(written.file, 'utf8');
      expect(text.startsWith('# 更新日志')).toBe(true);
      expect(text).toContain('## v0.1.0');
      expect(text).toContain('`2026-10-26`');
      expect(text).toContain('- 第一条');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('同一版本第二次写只在对应分类下追加', () => {
    const dir = moduleOf();
    try {
      writeChangelogEntry(dir, { version: '0.1.0', kind: 'fixed', note: '修一条', date: '2026-10-26' });
      writeChangelogEntry(dir, { version: '0.1.0', kind: 'fixed', note: '再修一条', date: '2026-10-26' });
      const text = readFileSync(join(dir, CHANGELOG_FILE), 'utf8');
      expect(text.match(/## v0\.1\.0/g)).toHaveLength(1);
      expect(text).toContain('- 修一条');
      expect(text).toContain('- 再修一条');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('moduleVersionOf', () => {
  it('读 package.json 的 version；读不到就给空串', () => {
    const dir = moduleOf('2.3.4');
    try {
      expect(moduleVersionOf(dir)).toBe('2.3.4');
      rmSync(join(dir, 'package.json'));
      expect(moduleVersionOf(dir)).toBe('');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
