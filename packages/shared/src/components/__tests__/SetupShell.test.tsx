import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/react.js', () => ({
  h: (type: unknown, props: unknown, ...children: unknown[]) => ({ type, props, children }),
}));

import type { ReactNode } from '../../lib/react.js';
import { CenteredState } from '../ResourceStates.js';
import { Note } from '../Note.js';
import { SaveBar } from '../SaveBar.js';
import { SetupShell, type SetupStep, type UnitSetup } from '../SetupShell.js';

interface AnyElement {
  readonly type: unknown;
  readonly props: Record<string, unknown>;
  readonly children: unknown[];
}

const labels = {
  back: '上一步',
  next: '下一步',
  finish: '完成',
  save: '保存',
  saving: '保存中',
  cancel: '取消',
  reading: '正在读',
  failed: '读不到',
};

function step(extra: Partial<SetupStep> = {}): SetupStep {
  return {
    id: 'identity',
    title: '身份',
    render: () => 'identity-body',
    ...extra,
  };
}

function twoSteps(): readonly SetupStep[] {
  return [step(), step({ id: 'envs', title: '环境', render: () => 'envs-body' })];
}

function setup(extra: Partial<UnitSetup> = {}): UnitSetup {
  const steps = [step()];
  return {
    phase: 'needs-setup',
    steps,
    step: steps[0],
    values: {},
    setValues: () => {},
    busy: false,
    error: null,
    canLeave: true,
    canBack: false,
    next: () => {},
    back: () => {},
    retry: () => {},
    saveAll: () => {},
    ...extra,
  };
}

function asElement(node: unknown): AnyElement {
  return node as AnyElement;
}

function textOf(node: unknown): string {
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (node === null || typeof node !== 'object') return '';
  const element = asElement(node);
  return (element.children ?? []).map(textOf).join('');
}

function find(node: unknown, match: (element: AnyElement) => boolean): AnyElement | undefined {
  if (node === null || typeof node !== 'object') return undefined;
  const element = asElement(node);
  if (match(element)) return element;
  for (const child of element.children ?? []) {
    const found = find(child, match);
    if (found !== undefined) return found;
  }
  return undefined;
}

function findButton(root: unknown, label: string): AnyElement | undefined {
  return find(root, (element) => textOf(element) === label && typeof element.props['onClick'] === 'function');
}

describe('初始化外壳', () => {
  it('★ 正在读：只给一句读的字，不画步骤条', () => {
    const root = asElement(SetupShell({ setup: setup({ phase: 'checking' }), labels }));
    expect(root.type).toBe(CenteredState);
    expect(root.props['title']).toBe('正在读');
  });

  it('★ 读不到：标题换成失败那句，原始错误进 detail', () => {
    const root = asElement(
      SetupShell({ setup: setup({ phase: 'blocked', error: 'boom' }), labels }),
    );
    expect(root.type).toBe(CenteredState);
    expect(root.props['title']).toBe('读不到');
    expect(root.props['detail']).toBe('boom');
  });

  it('★ 分步：步骤条 + 当前步正文 + 下一步', () => {
    const next = vi.fn();
    const steps = twoSteps();
    const root = SetupShell({
      setup: setup({ steps, step: steps[0], next }),
      labels,
    });
    expect(textOf(root)).toContain('identity-body');
    const nextButton = findButton(root, '下一步');
    expect(nextButton).toBeDefined();
    (nextButton?.props['onClick'] as () => void)();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('★ 最后一步：按钮文案是“完成”', () => {
    const steps = twoSteps();
    const root = SetupShell({ setup: setup({ steps, step: steps[1] }), labels });
    const finish = findButton(root, '完成');
    expect(finish).toBeDefined();
  });

  it('★ 当前步不让走：下一步禁用', () => {
    const steps = twoSteps();
    const root = SetupShell({ setup: setup({ steps, step: steps[0], canLeave: false }), labels });
    const nextButton = findButton(root, '下一步');
    expect(nextButton?.props['disabled']).toBe(true);
  });

  it('★ 错误：用 problem 的 Note 说一句', () => {
    const root = SetupShell({ setup: setup({ error: '名字太长' }), labels });
    const note = find(root, (element) => element.type === Note);
    expect(note?.props['tone']).toBe('problem');
    expect(textOf(note)).toBe('名字太长');
  });

  it('★ 编辑模式：步骤摊成一页，底下是 SaveBar，取消走回调', () => {
    const saveAll = vi.fn();
    const onCancel = vi.fn();
    const root = SetupShell({
      setup: setup({ phase: 'ready', saveAll }),
      labels,
      mode: 'edit',
      onCancel,
    });
    const bar = find(root, (element) => element.type === SaveBar);
    expect(bar).toBeDefined();
    expect(bar?.props['onSave']).toBe(saveAll);
    (bar?.props['onCancel'] as () => void)();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(textOf(root)).toContain('identity-body');
  });

  it('★ 已就绪：把主页换进来，不再画流程', () => {
    const home = (): ReactNode => 'home-body';
    const root = SetupShell({ setup: setup({ phase: 'ready' }), labels, renderHome: home });
    expect(textOf(root)).toBe('home-body');
    expect(find(root, (element) => element.type === Note)).toBeUndefined();
  });

  it('★ 已就绪但没给主页：什么都不画', () => {
    expect(SetupShell({ setup: setup({ phase: 'ready' }), labels })).toBeNull();
  });
});
