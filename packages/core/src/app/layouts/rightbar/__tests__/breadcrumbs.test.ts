import { describe, expect, it } from 'vitest';
import type { Translate } from '@dsh-workbench/shared';
import { stepLabel } from '../Breadcrumbs';

const t: Translate = (key) => key;

const titleKeyOf = (kind: string): string | undefined =>
  kind === 'issues' ? 'issues.title' : undefined;

describe('stepLabel', () => {
  it('看板层用外壳自己的标题（它确实是外壳的层）', () => {
    expect(stepLabel({ kind: 'board' }, titleKeyOf, t)).toBe('board.title');
  });

  it('内层用**提供这一层的套件**给的文案键', () => {
    expect(stepLabel({ kind: 'issues' }, titleKeyOf, t)).toBe('issues.title');
  });

  it('★ 换一个套件提供的层，标题跟着换 —— 不是所有内层都叫 issues.title', () => {
    const otherOwner = (kind: string): string | undefined =>
      kind === 'builds' ? 'builds.title' : undefined;

    expect(stepLabel({ kind: 'builds' }, otherOwner, t)).toBe('builds.title');
    expect(stepLabel({ kind: 'issues' }, titleKeyOf, t)).toBe('issues.title');
  });

  it('没人提供这一层 → 一句可读的兜底（不猜、也不写死）', () => {
    expect(stepLabel({ kind: 'nobody' }, titleKeyOf, t)).toBe('panels.unknownStep');
  });
});
