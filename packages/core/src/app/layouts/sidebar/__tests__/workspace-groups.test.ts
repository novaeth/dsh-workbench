import { describe, expect, it } from 'vitest';
import { workspaceSections } from '../workspace-groups';

const HEADINGS = { workspaces: '工作区', defaultWorkspace: '默认工作区', workshop: '工坊' };

const at = (path: string, title: string) => ({ path, title });

const PROJECTS = [
  at('/Users/you/项目/公司项目/team-app', 'team-app'),
  at('/Users/you/项目/个人项目/dsh-workbench', 'dsh工作台'),
];
const DEFAULT = at('/Users/you/Documents/deepseek-harness/default-workspace', 'default-workspace');
const WORKSHOP = at('/Users/you/.dsh/workbench/diy', '工作台DIY');

describe('workspaceSections', () => {
  it('三类各归各的：用户的项目 / dsh 的默认工作区 / 工坊', () => {
    const sections = workspaceSections([...PROJECTS, DEFAULT, WORKSHOP], HEADINGS);
    expect(sections.map((section) => section.id)).toEqual(['workspaces', 'defaultWorkspace', 'workshop']);
    expect(sections[0]?.items).toEqual(PROJECTS);
    expect(sections[1]?.items).toEqual([DEFAULT]);
    expect(sections[2]?.items).toEqual([WORKSHOP]);
  });

  it('显示顺序是 项目 → 默认工作区 → 工坊（自带的那两处都收在用户的项目后面）', () => {
    const sections = workspaceSections([WORKSHOP, DEFAULT, ...PROJECTS], HEADINGS);
    expect(sections.flatMap((section) => section.items)).toEqual([...PROJECTS, DEFAULT, WORKSHOP]);
  });

  it('有默认工作区或工坊时，用户那一组才画「工作区」标题（没东西要区分就不画）', () => {
    expect(workspaceSections([...PROJECTS, DEFAULT, WORKSHOP], HEADINGS).map((one) => one.heading)).toEqual([
      '工作区',
      '默认工作区',
      '工坊',
    ]);
    expect(workspaceSections(PROJECTS, HEADINGS)).toEqual([
      { id: 'workspaces', heading: null, items: PROJECTS },
    ]);
  });

  it('认默认工作区用的是 dsh 自己那一条（title === default-workspace，官方文案「默认工作区」）', () => {
    expect(workspaceSections([DEFAULT], HEADINGS)).toEqual([
      { id: 'defaultWorkspace', heading: '默认工作区', items: [DEFAULT] },
    ]);
    const renamed = at(DEFAULT.path, '文档暂存');
    expect(workspaceSections([renamed], HEADINGS)).toEqual([
      { id: 'workspaces', heading: null, items: [renamed] },
    ]);
  });

  it('只剩工坊那一条时，只画「工坊」那一段', () => {
    expect(workspaceSections([WORKSHOP], HEADINGS)).toEqual([
      { id: 'workshop', heading: '工坊', items: [WORKSHOP] },
    ]);
  });

  it('工坊优先于默认工作区（同一条不会被分到两段里）', () => {
    const both = at(WORKSHOP.path, 'default-workspace');
    expect(workspaceSections([both], HEADINGS)).toEqual([
      { id: 'workshop', heading: '工坊', items: [both] },
    ]);
  });

  it('没命中任何一条就是空（空态那句话说给调用点）', () => {
    expect(workspaceSections([], HEADINGS)).toEqual([]);
  });
});

describe('workspaceSections：按「待审批 → 通知 → 在跑 → 无状态」排', () => {
  const rankOf = (item: { readonly path: string }): number => RANKS[item.path] ?? 3;
  const RANKS: Record<string, number> = {
    '/a/approval': 0,
    '/a/fresh': 1,
    '/a/running': 2,
  };

  it('★★ 四条状态各一条时，顺序按优先级来（与传进来的顺序无关）', () => {
    const rows = [at('/a/idle', 'idle'), at('/a/running', 'running'), at('/a/fresh', 'fresh'), at('/a/approval', 'approval')];
    const sections = workspaceSections(rows, HEADINGS, { rankOf });
    expect(sections[0]?.items.map((item) => item.title)).toEqual(['approval', 'fresh', 'running', 'idle']);
  });

  it('★ 同一档里保持传进来的先后（稳定排序，不按名字乱动）', () => {
    const rows = [at('/a/b', 'b'), at('/a/a', 'a'), at('/c/c', 'c')];
    const sections = workspaceSections(rows, HEADINGS, { rankOf });
    expect(sections[0]?.items.map((item) => item.title)).toEqual(['b', 'a', 'c']);
  });

  it('不给 rankOf 就原样（老行为一个字不改）', () => {
    const rows = [at('/a/idle', 'idle'), at('/a/approval', 'approval')];
    expect(workspaceSections(rows, HEADINGS)[0]?.items).toEqual(rows);
  });
});
