import type { ReactNode } from '../lib/react.js';
import { h } from '../lib/react.js';
import { IconRightUpOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import './Link.css';

/**
 * `Link` 的契约：目标地址、文案与外链开关。
 */
export interface LinkProps {
  readonly href: string;
  readonly children?: ReactNode | undefined;
  readonly title?: string | undefined;
  readonly external?: boolean | undefined;
  readonly className?: string | undefined;
}

/**
 * 唯一的外链写法：自带新窗口、`rel="noopener noreferrer"`、正文色与行尾那颗小箭头。
 * @param props.href - 目标地址，必给。
 * @param props.children - 链接文字（别自己再带 `→`）。
 * @param props.title - 原生 title 提示；不给就不写这个属性。
 * @param props.external - 默认 true：新窗口打开并画那颗 ↗；站内跳转给 false，箭头也一起不画。
 * @param props.className - 追加在基础类名之后，不是替换。
 * @returns 一个 `<a>`。
 */
export function Link({ href, children, title, external = true, className }: LinkProps) {
  return (
    <a
      className={className === undefined ? 'wb-link' : `wb-link ${className}`}
      href={href}
      {...(title === undefined ? {} : { title })}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {children}
      {external ? <IconRightUpOutlineRegular size={12} /> : null}
    </a>
  );
}
