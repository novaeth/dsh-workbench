import type { ReactNode } from '../lib/react.js';
import { h } from '../lib/react.js';
import './Note.css';

/**
 * `Note` 的契约：语气、标签名与读屏角色。
 */
export interface NoteProps {
  readonly tone?: 'muted' | 'problem';
  readonly as?: 'p' | 'span';
  readonly role?: 'alert' | 'status';
  readonly children?: ReactNode | undefined;
}

/**
 * 一句话说明或一句报错：卡片里的提示条用它，不承载交互。
 * @param props.tone - `problem` 是报错色；默认 `muted`，普通说明色。
 * @param props.as - `span` 是跟在别的行里，`p`（默认）独占一段。
 * @param props.role - 读屏角色：变化中的提示给 `status`、报错给 `alert`；不给不设。
 * @param props.children - 那句话本身。
 * @returns 一个 `span` 或 `p`。
 */
export function Note({ tone = 'muted', as, role, children }: NoteProps) {
  const className = tone === 'problem' ? 'wb-problem' : 'wb-note';
  return as === 'span' ? (
    <span className={className} role={role}>
      {children}
    </span>
  ) : (
    <p className={className} role={role}>
      {children}
    </p>
  );
}
