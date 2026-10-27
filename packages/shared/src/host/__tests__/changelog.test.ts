import { describe, expect, it } from 'vitest';
import {
  CHANGELOG_FILE,
  appendChangelogEntry,
  changelogHasEntry,
  changelogSectionOf,
  changelogSkeleton,
  parseChangelog,
} from '../changelog.js';

const SAMPLE = [
  '# 更新日志',
  '',
  '## v1.2.0',
  '',
  '`2026-10-26`',
  '',
  '### ✨ 新增',
  '',
  '- 模块详情能看说明与更新日志',
  '',
  '### 🐛 修复',
  '',
  '- 发布审批会显示这一版的更新日志',
  '',
  '## v1.1.0',
  '',
  '`2026-10-01`',
  '',
  '- 旧版本的一条',
  '',
].join('\n');

describe('parseChangelog', () => {
  it('按 v 前缀的版本标题切段，正文保留分类与列表', () => {
    const sections = parseChangelog(SAMPLE);
    expect(sections.map((one) => one.version)).toEqual(['1.2.0', '1.1.0']);
    expect(sections[0]?.body).toContain('`2026-10-26`');
    expect(sections[0]?.body).toContain('### ✨ 新增');
    expect(sections[0]?.body).toContain('- 模块详情能看说明与更新日志');
    expect(sections[1]?.body).toContain('- 旧版本的一条');
  });

  it('文件名常量是 CHANGELOG.md', () => {
    expect(CHANGELOG_FILE).toBe('CHANGELOG.md');
  });
});

describe('changelogSectionOf / changelogHasEntry', () => {
  it('认 v 前缀、方括号与不带方括号的版本标题', () => {
    expect(changelogSectionOf(SAMPLE, 'v1.2.0')).toContain('更新日志');
    expect(changelogSectionOf(SAMPLE, '1.1.0')).toContain('旧版本的一条');
    expect(changelogSectionOf('# 更新日志\n\n## [1.0.0] - 2026-10-01\n\n- 一条\n', '1.0.0')).toBe('- 一条');
  });

  it('只有版本标题和日期不算一条记录', () => {
    const empty = '# 更新日志\n\n## v1.0.0\n\n`2026-10-26`\n\n### ✨ 新增\n';
    expect(changelogHasEntry(empty, '1.0.0')).toBe(false);
    expect(changelogHasEntry(SAMPLE, '1.2.0')).toBe(true);
    expect(changelogHasEntry(SAMPLE, '9.9.9')).toBe(false);
  });
});

describe('appendChangelogEntry', () => {
  it('新版本插在最前面，带日期行与 emoji 分类', () => {
    const next = appendChangelogEntry(SAMPLE, { version: '1.3.0', kind: 'added', note: '新的东西', date: '2026-10-27' });
    expect(parseChangelog(next).map((one) => one.version)).toEqual(['1.3.0', '1.2.0', '1.1.0']);
    expect(next).toContain('## v1.3.0');
    expect(next).toContain('`2026-10-27`');
    expect(next).toContain('### ✨ 新增');
    expect(changelogHasEntry(next, '1.3.0')).toBe(true);
  });

  it('已有版本号往对应分类下追加，不新建一段', () => {
    const next = appendChangelogEntry(SAMPLE, { version: '1.2.0', kind: 'fixed', note: '又修了一条' });
    const sections = parseChangelog(next);
    expect(sections.filter((one) => one.version === '1.2.0')).toHaveLength(1);
    expect(sections[0]?.body).toContain('- 又修了一条');
    expect(sections[0]?.body.indexOf('- 又修了一条')).toBeGreaterThan(
      sections[0]?.body.indexOf('- 发布审批会显示这一版的更新日志') ?? 0,
    );
  });

  it('空文件从骨架起，只留标题', () => {
    const next = appendChangelogEntry('', { version: '0.1.0', kind: 'added', note: '第一次发布' });
    expect(next.startsWith('# 更新日志')).toBe(true);
    expect(next).not.toContain('Unreleased');
    expect(parseChangelog(next).map((one) => one.version)).toEqual(['0.1.0']);
  });

  it('这一版还没有该分类时补一个小节', () => {
    const next = appendChangelogEntry(SAMPLE, { version: '1.2.0', kind: 'removed', note: '删掉旧入口' });
    expect(changelogSectionOf(next, '1.2.0')).toContain('### 🗑️ 移除');
    expect(changelogHasEntry(next, '1.2.0')).toBe(true);
  });
});

describe('changelogSkeleton', () => {
  it('只有标题，不给假条目', () => {
    expect(changelogSkeleton()).toBe('# 更新日志\n');
  });
});
