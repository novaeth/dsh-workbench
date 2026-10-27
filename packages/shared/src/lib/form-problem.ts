const PROBLEM_SELECTOR = '[data-wb-problem]';

const FOCUSABLE_SELECTOR = [
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * 找 `root` 里第一个带 `[data-wb-problem]` 标记的元素 —— 表单校验失败时，调用方拿它定位「哪一格错了」。
 * @param root - 要搜的范围（表单容器，或 document）。
 * @returns 第一个出问题的元素；一个标记都没有就给 `null`。
 */
export function firstProblemOf(root: ParentNode): Element | null {
  return root.querySelector(PROBLEM_SELECTOR);
}

/**
 * 把第一个出问题的元素滚进视野、并把焦点交给它里面第一个可聚焦控件（输入框 / 按钮 / 链接等）。
 * @param root - 要搜的范围。
 * @returns 找到并滚过给 `true`；没有问题给 `false`（不滚、不抢焦点）；元素不可滚或没有可聚焦控件也不报错，只是少做一步。
 */
export function revealFirstProblem(root: ParentNode): boolean {
  const problem = firstProblemOf(root);
  if (problem === null) return false;
  problem.scrollIntoView?.({ block: 'nearest' });
  problem.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus?.();
  return true;
}
