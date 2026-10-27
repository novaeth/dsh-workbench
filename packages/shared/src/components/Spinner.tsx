import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives';
import { h } from '../lib/react.js';
import './Spinner.css';

/**
 * `Spinner` 的契约：直径像素与可选的读屏标签。
 */
export interface SpinnerProps {
  readonly size?: number;
  readonly label?: string | undefined;
}

/**
 * 转圈：加载态一律用它（`FormActions` 与 `ChoiceGroup` 内部也是它），别自己写动画。
 * @param props.size - 直径像素（默认 14，与 dsh 紧凑控件同高）。
 * @param props.label - 给了才读屏可见（`role="status"`）；不给整颗 `aria-hidden`，此时旁边必须有文字。
 * @returns 一枚 `StateDot state="ongoing"`，自身不带文字。
 */
export function Spinner({ size = 14, label }: SpinnerProps) {
  return (
    <span
      className="wb-spinner"
      {...(label === undefined ? { 'aria-hidden': true } : { role: 'status', 'aria-label': label })}
    >
      <StateDot state="ongoing" size={size} />
    </span>
  );
}
