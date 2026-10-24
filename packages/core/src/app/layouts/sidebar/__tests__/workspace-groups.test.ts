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
