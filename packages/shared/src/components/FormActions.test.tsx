import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { FormActions, type FormAction, type FormActionKind } from './FormActions.js';
import { SaveBar } from './SaveBar.js';

function action(key: string, kind?: FormActionKind): FormAction {
  return { key, label: key, ...(kind === undefined ? {} : { kind }), onClick: () => {} };
}

function buttonsOf(node: unknown): { props: Record<string, unknown> }[] {
  return (node as { props: { children: unknown[] } }).props.children as { props: Record<string, unknown> }[];
}

function labelsOf(node: unknown): unknown[] {
  return buttonsOf(node).map((one) => one.props['children']);
}

describe('FormActions', () => {
  it('★ 顺序由组件决定：给乱序数组，primary 仍在末尾、danger 紧挨它左侧、其余保持调用点顺序', () => {
    const node = FormActions({
      actions: [action('save', 'primary'), action('retry'), action('remove', 'danger'), action('edit')],
    });

    expect(labelsOf(node)).toEqual(['retry', 'edit', 'remove', 'save']);
    expect(buttonsOf(node).map((one) => one.props['variant'])).toEqual([
      'ghost',
      'ghost',
      'outline',
      'primary',
    ]);
  });

  it('没有 primary 时 danger 仍是最后一个（固定槽位，不随调用点顺序漂）', () => {
    const node = FormActions({ actions: [action('remove', 'danger'), action('reset')] });

    expect(labelsOf(node)).toEqual(['reset', 'remove']);
  });

  it('★ 两颗 primary 给可诊断信号（点名 key），但不吞、不挪、不丢', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const node = FormActions({ actions: [action('keep', 'primary'), action('also', 'primary')] });

      expect(spy).toHaveBeenCalledTimes(1);
      const message = String(spy.mock.calls[0]?.[0]);
      expect(message).toContain('[dsh-workbench]');
      expect(message).toContain('keep');
      expect(message).toContain('also');
      expect(labelsOf(node)).toEqual(['keep', 'also']);
    } finally {
      spy.mockRestore();
    }
  });

  it('一颗 primary 不报', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      FormActions({ actions: [action('save', 'primary'), action('cancel')] });
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('★ 空数组不渲空壳', () => {
    expect(FormActions({ actions: [] })).toBeNull();
  });

  it('danger 是 outline + 危险类，绝不是 primary 填充', () => {
    const node = FormActions({ actions: [action('remove', 'danger')] });
    const only = buttonsOf(node)[0];

    expect(only?.props['variant']).toBe('outline');
    expect(only?.props['className']).toBe('wb-formActionDanger');
  });

  it('busy 那颗禁用并带 Spinner；disabled 单独算', () => {
    const node = FormActions({
      actions: [
        { key: 'save', label: '保存', kind: 'primary', onClick: () => {}, busy: true },
        { key: 'cancel', label: '取消', onClick: () => {}, disabled: true },
      ],
    });
    const [cancel, save] = buttonsOf(node);

    expect(save?.props['disabled']).toBe(true);
    expect(save?.props['icon']).toBeTruthy();
    expect(cancel?.props['disabled']).toBe(true);
    expect(cancel?.props['icon']).toBeUndefined();
  });
});

const CSS = readFileSync(new URL('./FormActions.css', import.meta.url), 'utf8');

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
  throw new Error(`FormActions.css 里没有这条规则：${selector}`);
}

describe('操作区的版式（ADR-0054 §2 规则四）', () => {
  it('★ 窄容器换行 + 整组右对齐 + 唯一一档间距', () => {
    const rule = declarations('.wb-formActions');

    expect(rule).toContain('flex-wrap: wrap');
    expect(rule).toContain('justify-content: flex-end');
    expect(rule).toContain('gap: var(--wb-len-8)');
  });

  it('★ 危险色走现成令牌（文字 / 描边 / 悬停）', () => {
    const rule = declarations('.wb-formActionDanger');

    expect(rule).toContain('color: var(--dsw-alias-state-error-primary)');
    expect(rule.some((one) => one.startsWith('border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary)'))).toBe(
      true,
    );
    expect(rule.some((one) => one.startsWith('--dsw-alias-interactive-bg-hover:'))).toBe(true);
  });
});

describe('SaveBar 自吃狗粮（ADR-0054 §10）', () => {
  it('两个动作喂给 FormActions：取消是 default、保存是 primary（顺序不再由它摆）', () => {
    const node = SaveBar({
      busy: false,
      labels: { cancel: '取消', save: '保存', saving: '保存中…' },
      onCancel: () => {},
      onSave: () => {},
    }) as unknown as { props: { actions: readonly FormAction[] } };

    expect(node.props.actions.map((one) => [one.key, one.kind])).toEqual([
      ['cancel', 'default'],
      ['save', 'primary'],
    ]);
  });

  it('busy 时保存那颗显示 saving 文案、禁用且带忙碌标记', () => {
    const node = SaveBar({
      busy: true,
      labels: { cancel: '取消', save: '保存', saving: '保存中…' },
      onCancel: () => {},
      onSave: () => {},
    }) as unknown as { props: { actions: readonly FormAction[] } };
    const save = node.props.actions[1];

    expect(save?.label).toBe('保存中…');
    expect(save?.disabled).toBe(true);
    expect(save?.busy).toBe(true);
  });
});
