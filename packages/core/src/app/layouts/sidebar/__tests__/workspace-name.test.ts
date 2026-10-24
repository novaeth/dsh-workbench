import { describe, expect, it } from 'vitest';
import {
  basenameOf,
  displayNameOf,
  matchWorkspaces,
  nameTooLong,
  titleFor,
  WORKSPACE_NAME_MAX,
} from '../workspace-name';

const at = (path: string, title?: string) => ({ path, title: title ?? basenameOf(path) });

describe('basenameOf', () => {
  it('取最后一段', () => {
    expect(basenameOf('/Users/you/项目/dsh-workbench')).toBe('dsh-workbench');
  });

  it('忽略结尾斜杠', () => {
    expect(basenameOf('/a/b/c/')).toBe('c');
    expect(basenameOf('relative/dir/')).toBe('dir');
  });

  it('没有段时返回自己或空', () => {
    expect(basenameOf('/')).toBe('');
    expect(basenameOf('')).toBe('');
    expect(basenameOf('solo')).toBe('solo');
  });

  it('认 windows 分隔符', () => {
    expect(basenameOf('C:\\work\\repo')).toBe('repo');
    expect(basenameOf('C:\\work\\repo\\')).toBe('repo');
  });
});

describe('displayNameOf', () => {
  it('title 就是目录名时不显示中文名', () => {
    expect(displayNameOf(at('/a/dsh-workbench'))).toEqual({ dir: 'dsh-workbench', name: '' });
  });

  it('title 与目录名不同时当中文名', () => {
    expect(displayNameOf(at('/a/dsh-workbench', '工作台外壳'))).toEqual({
      dir: 'dsh-workbench',
      name: '工作台外壳',
    });
  });

  it('默认工作区哨兵值不算中文名', () => {
    expect(displayNameOf({ path: '/a/dsh-workbench', title: 'default-workspace' }).name).toBe('');
  });

  it('空白 title 不算中文名', () => {
    expect(displayNameOf({ path: '/a/x', title: '   ' }).name).toBe('');
  });

  it('根路径退回路径自己当目录名', () => {
    expect(displayNameOf({ path: '/', title: '/' })).toEqual({ dir: '/', name: '' });
  });
});

describe('matchWorkspaces', () => {
  const items = [
    at('/Users/you/项目/个人项目/dsh-workbench', '工作台外壳'),
    at('/Users/you/项目/个人项目/modules-repo', '面板模块仓'),
    at('/Users/you/项目/个人项目/delivery-app'),
    at('/Users/you/项目/个人项目/workflow-app'),
  ];

  it('空查询返回全部', () => {
    expect(matchWorkspaces(items, '   ')).toHaveLength(items.length);
  });

  it('按目录名命中，且不分大小写', () => {
    expect(matchWorkspaces(items, 'modules-repo').map((item) => basenameOf(item.path))).toEqual([
      'modules-repo',
    ]);
  });

  it('按中文名命中', () => {
    expect(matchWorkspaces(items, '模块').map((item) => basenameOf(item.path))).toEqual([
      'modules-repo',
    ]);
  });

  it('按路径片段命中', () => {
    expect(matchWorkspaces(items, '个人项目/').length).toBe(items.length);
  });

  it('没命中就是空数组', () => {
    expect(matchWorkspaces(items, 'zzz')).toEqual([]);
  });

  it('不返回新对象（保 identity，列表行才不白重画）', () => {
    expect(matchWorkspaces(items, '工作台')[0]).toBe(items[0]);
  });
});

describe('titleFor', () => {
  it('留空 = 恢复成目录名', () => {
    expect(titleFor(at('/a/dsh-workbench', '工作台外壳'), '  ')).toBe('dsh-workbench');
  });

  it('填了就trim后用作 title', () => {
    expect(titleFor(at('/a/dsh-workbench'), ' 工作台外壳 ')).toBe('工作台外壳');
  });

  it('根路径留空时回落到路径自己', () => {
    expect(titleFor({ path: '/', title: '/' }, '')).toBe('/');
  });
});

describe('nameTooLong', () => {
  it('正好到上限可以通过', () => {
    expect(nameTooLong('x'.repeat(WORKSPACE_NAME_MAX))).toBe(false);
  });

  it('多一个字就不行', () => {
    expect(nameTooLong('x'.repeat(WORKSPACE_NAME_MAX + 1))).toBe(true);
  });

  it('首尾空白不算长度', () => {
    expect(nameTooLong(`  ${'x'.repeat(WORKSPACE_NAME_MAX)}  `)).toBe(false);
  });
});
