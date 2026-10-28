import type { ReactNode, Ref } from 'react';
import { Fragment, h } from '../lib/react.js';
import {
  IconChevronDownOutlineRegular,
  TextShimmer,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { Spinner } from './Spinner.js';

/**
 * 下拉触发器那颗按钮：图标 + 当前值 + 箭头，交给 `Menu` 当 anchor；宽窄两档共用一个形状。
 * @param args.id - 触发器 id。
 * @param args.className - 触发器类名（已含 variant 与 iconOnly 的档）。
 * @param args.disabled - 是否禁用。
 * @param args.invalid - 置真写 `aria-invalid`。
 * @param args.open - 列表是否开着，写进 `aria-expanded`。
 * @param args.ariaLabel - 读屏名。
 * @param args.title - 原生提示。
 * @param args.icon - 值左边那枚图标；不给不占位。
 * @param args.value - 已渲染好的当前值节点（文本或占位）。
 * @param args.iconOnly - 只画图标（窄栏那颗切换钮），值与箭头都不画。
 * @param args.onOpen - 点它做什么，通常是把列表打开。
 * @param args.ref - 挂到这颗 `<button>` 上，取消后回焦点、菜单开着头条滚轮要用它。
 * @returns 一颗 `<button>`。
 */
export function selectTriggerNode(args: {
  readonly id: string | undefined;
  readonly className: string;
  readonly disabled: boolean;
  readonly invalid: boolean;
  readonly open: boolean;
  readonly ariaLabel: string | undefined;
  readonly title: string | undefined;
  readonly icon: ReactNode | undefined;
  readonly value: ReactNode;
  readonly iconOnly: boolean;
  readonly onOpen: () => void;
  readonly ref: Ref<HTMLButtonElement> | undefined;
}): ReactNode {
  return (
    <button
      type="button"
      ref={args.ref}
      id={args.id}
      className={args.className}
      disabled={args.disabled}
      aria-haspopup="listbox"
      aria-expanded={args.open}
      aria-invalid={args.invalid || undefined}
      aria-label={args.ariaLabel}
      title={args.title}
      onClick={args.onOpen}
    >
      {args.iconOnly ? (
        <span className="wb-selectIcon">{args.icon}</span>
      ) : (
        <Fragment>
          {args.icon === undefined ? null : <span className="wb-selectIcon">{args.icon}</span>}
          <span className="wb-selectValue">{args.value}</span>
          <span className="wb-selectChevron">
            <IconChevronDownOutlineRegular size={14} />
          </span>
        </Fragment>
      )}
    </button>
  );
}

/**
 * 名单还没读到时的触发器：禁用 + `aria-busy` 的按钮，`SelectField` 在 `loading` 那档画它。
 * @param args.id - 触发器 id。
 * @param args.className - 触发器类名；它后面会接上 loading 那档的类。
 * @param args.invalid - 置真写 `aria-invalid`。
 * @param args.ariaLabel - 读屏名。
 * @param args.loadingText - 占位文案；不给就是 `…`。
 * @returns 一颗禁用且 `aria-busy` 的按钮。
 */
export function selectLoadingNode(args: {
  readonly id: string | undefined;
  readonly className: string;
  readonly invalid: boolean;
  readonly ariaLabel: string | undefined;
  readonly loadingText: string | undefined;
}): ReactNode {
  return (
    <button
      type="button"
      id={args.id}
      className={`${args.className} wb-selectLoading`}
      disabled
      aria-busy="true"
      aria-invalid={args.invalid || undefined}
      aria-label={args.ariaLabel}
      title={args.loadingText}
    >
      <span className="wb-selectValue">
        <TextShimmer active>{args.loadingText ?? '…'}</TextShimmer>
      </span>
      <span className="wb-selectChevron">
        <Spinner size={14} />
      </span>
    </button>
  );
}
