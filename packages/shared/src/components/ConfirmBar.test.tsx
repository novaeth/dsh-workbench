import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ConfirmBar, type ConfirmRow } from './ConfirmBar.js';
import { FormActions, type FormAction } from './FormActions.js';
import { Note } from './Note.js';
import { Rows } from './Rows.js';

interface AnyElement {
  readonly type: unknown;
  readonly props: Record<string, unknown>;
  readonly key?: unknown;
}

function action(key: string, kind?: FormAction['kind']): FormAction {
  return { key, label: key, kind, onClick: () => {} };
}

function row(key: string): ConfirmRow {
  return { key, label: `名字-${key}`, value: `值-${key}` };
}

function bar(extra: Record<string, unknown> = {}): AnyElement {
  return ConfirmBar({
    title: '发布到 prod？',
    actions: [action('publish', 'primary')],
    ...extra,
  }) as unknown as AnyElement;
}

function childrenOf(node: AnyElement): AnyElement[] {
  return ((node.props['children'] as unknown[]) ?? []).filter(
    (one): one is AnyElement => typeof one === 'object' && one !== null,
  );
}

describe('确认条（契约类 wb-confirmBar）', () => {
  it('★ 是一个 role="group" 的条，读屏名默认取字符串标题', () => {
    const root = bar();

    expect(root.props['role']).toBe('group');
    expect(root.props['aria-label']).toBe('发布到 prod？');
    expect(childrenOf(root)[0]?.props['className']).toBe('wb-confirmBarTitle');
  });

  it('显式给了 label 就用它；标题不是字符串又没给 label 就不设读屏名', () => {
    expect(bar({ label: '发布确认' }).props['aria-label']).toBe('发布确认');
    expect(bar({ title: 42 }).props['aria-label']).toBeUndefined();
  });

  it('busy 只喂 aria-busy，不改动作那一块', () => {
    const root = bar({ busy: true, actions: [action('publish', 'primary'), action('cancel')] });

    expect(root.props['aria-busy']).toBe(true);
    expect(childrenOf(root)[1]?.props['actions']).toHaveLength(2);
  });

  it('★ 三件都借现成的：键值走 Rows、失败那句走 Note(tone=problem, role=alert)、动作走 FormActions', () => {
    const actions = [action('publish', 'primary'), action('cancel')];
    const root = bar({ rows: [row('env')], problem: '源上没有这个包', actions });
    const children = childrenOf(root);

    expect(children[0]?.props['className']).toBe('wb-confirmBarTitle');
    expect(children[1]?.type).toBe(Rows);
    expect(children[2]?.type).toBe(Note);
    expect(children[2]?.props['tone']).toBe('problem');
    expect(children[2]?.props['role']).toBe('alert');
    expect(children[3]?.type).toBe(FormActions);
    expect(children[3]?.props['actions']).toBe(actions);
  });

  it('★ 没给的那几块不占位：只要标题与动作区', () => {
    expect(childrenOf(bar())).toHaveLength(2);
    expect(childrenOf(bar({ rows: [] }))).toHaveLength(2);
    expect(childrenOf(bar({ hint: '这一趟会重启一次' }))).toHaveLength(3);
  });

  it('★ 键值那几格走 Row 的 label / value 两格（key 交给 React 认列表），不是自己画两栏', () => {
    const root = bar({ rows: [row('env'), row('branch')] });
    const rowNodes = childrenOf(childrenOf(root)[1] as AnyElement);

    expect(rowNodes.map((one) => one.props['label'])).toEqual(['名字-env', '名字-branch']);
    expect(rowNodes.map((one) => one.props['value'])).toEqual(['值-env', '值-branch']);
    expect(rowNodes.map((one) => one.key)).toEqual(['env', 'branch']);
  });
});

const CSS = readFileSync(new URL('./ConfirmBar.css', import.meta.url), 'utf8');

function declarations(selector: string): string[] {
  for (const block of CSS.split('}')) {
    const [head, ...rest] = block.split('{');
    if (rest.length === 0 || head === undefined) continue;
    if (head.trim() !== selector) continue;
    return rest
      .join('{')
      .split(';')
      .map((one) => one.replace(/\s+/g, ' ').trim())
      .filter((one) => one !== '');
  }
  throw new Error(`ConfirmBar.css 里没有这条规则：${selector}`);
}

describe('确认条的版式（ADR-0073 §2.2）', () => {
  it('★ 占满自己那一格（有内边距与描边 ⇒ 配 border-box），别在横向父容器里退回内容宽', () => {
    const rule = declarations('.wb-confirmBar');

    expect(rule).toContain('width: 100%');
    expect(rule).toContain('box-sizing: border-box');
  });

  it('★ 一档间距、描边与圆角都走令牌', () => {
    const rule = declarations('.wb-confirmBar');

    expect(rule).toContain('gap: var(--wb-len-8)');
    expect(rule).toContain('padding: var(--wb-len-10) var(--wb-len-12)');
    expect(rule).toContain('border: 0.5px solid var(--dsw-alias-border-l3)');
    expect(rule).toContain('border-radius: var(--dsw-radius-md)');
  });

  it('★ 标题与说明的大小走令牌，标题比说明重一档', () => {
    const title = declarations('.wb-confirmBarTitle');
    const hint = declarations('.wb-confirmBarHint');

    expect(title).toContain('font-size: var(--dsw-font-xxs-12-font-size)');
    expect(title).toContain('line-height: var(--wb-line-18)');
    expect(title).toContain('font-weight: 600');
    expect(hint).toContain('font-size: var(--dsw-font-xxxs-11-font-size)');
    expect(hint).toContain('line-height: var(--wb-line-16)');
  });
});
