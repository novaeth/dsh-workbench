import { describe, expect, it, vi } from 'vitest';
import { firstProblemOf, revealFirstProblem } from './form-problem.js';

function rootWith(problem: unknown): { readonly root: ParentNode; readonly queries: string[] } {
  const queries: string[] = [];
  const root = {
    querySelector: (selector: string) => {
      queries.push(selector);
      return selector === '[data-wb-problem]' ? problem : null;
    },
  } as unknown as ParentNode;
  return { root, queries };
}

interface ProblemStub {
  readonly element: Element;
  readonly queries: string[];
  readonly scrollIntoView: ReturnType<typeof vi.fn>;
  readonly focus: ReturnType<typeof vi.fn>;
}

function problemStub(options: { readonly scroll: boolean }): ProblemStub {
  const queries: string[] = [];
  const scrollIntoView = vi.fn();
  const focus = vi.fn();
  const element = {
    scrollIntoView,
    querySelector: (selector: string) => {
      queries.push(selector);
      return { focus };
    },
  } as unknown as Element;
  if (!options.scroll) {
    delete (element as { scrollIntoView?: unknown }).scrollIntoView;
  }
  return { element, queries, scrollIntoView, focus };
}

describe('firstProblemOf / revealFirstProblem', () => {
  it('没有错误行就返回 null / false，什么也不碰', () => {
    const empty = rootWith(null);
    const missing = problemStub({ scroll: true });

    expect(firstProblemOf(empty.root)).toBeNull();
    expect(revealFirstProblem(rootWith(null).root)).toBe(false);
    expect(missing.focus).not.toHaveBeenCalled();
    expect(missing.scrollIntoView).not.toHaveBeenCalled();
  });

  it('第一处 [data-wb-problem] 就是它', () => {
    const problem = problemStub({ scroll: true });
    const found = rootWith(problem.element);

    expect(firstProblemOf(found.root)).toBe(problem.element);
    expect(found.queries).toEqual(['[data-wb-problem]']);
  });

  it('带进视口 + 聚焦里面第一个可聚焦控件，返回 true', () => {
    const problem = problemStub({ scroll: true });

    expect(revealFirstProblem(rootWith(problem.element).root)).toBe(true);
    expect(problem.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(problem.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    expect(problem.queries).toHaveLength(1);
    expect(problem.queries[0]).toContain('input:not([disabled])');
    expect(problem.focus).toHaveBeenCalledTimes(1);
  });

  it('没有 scrollIntoView 也不炸（jsdom 缺它）：照样聚焦、照样返回 true', () => {
    const problem = problemStub({ scroll: false });

    expect(() => revealFirstProblem(rootWith(problem.element).root)).not.toThrow();
    expect(revealFirstProblem(rootWith(problem.element).root)).toBe(true);
    expect(problem.focus).toHaveBeenCalledTimes(2);
  });
});
