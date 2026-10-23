import type { ReactNode } from '../lib/react.js';
import { Button, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import { h } from '../lib/react.js';
import './Activity.css';

/**
 * `ActivityBlock` 的契约：块头与块内容。
 */
export interface ActivityBlockProps {
  readonly head?: ReactNode | undefined;
  readonly children?: ReactNode | undefined;
}

/**
 * "它做过什么"那一块：上面一行块头、下面一列活动行，卡里放时间线就用它。
 * @param props.head - 块头（如"最近 10 次"）；不给不画那一行。
 * @param props.children - 块内容，通常是一串 `ActivityLine`。
 * @returns 一个 div。
 */
export function ActivityBlock({ head, children }: ActivityBlockProps) {
  return (
    <div className="wb-activityBlock">
      {head === undefined ? null : <div className="wb-activityBlockHead">{head}</div>}
      {children}
    </div>
  );
}

/**
 * `ActivityLine` 的契约：状态点、正文、时间与行尾动作。
 */
export interface ActivityLineProps {
  readonly dot?: ReactNode | undefined;
  readonly text: ReactNode;
  readonly at?: ReactNode | undefined;
  readonly actions?: ReactNode | undefined;
}

/**
 * 一条活动：状态点 + 正文 + 时间，行尾可挂动作；时间一律用它，别自己拼。
 * @param props.dot - 行首那枚状态点；不给就只留正文。
 * @param props.text - 这一条干了什么。
 * @param props.at - 时间那一格（相对时间文本）；不给不画。
 * @param props.actions - 行尾动作，通常是一两颗 `ActivityAction`；不给不画。
 * @returns 一行。
 */
export function ActivityLine({ dot, text, at, actions }: ActivityLineProps) {
  return (
    <div className="wb-activityLine">
      {dot}
      <span className="wb-activityLineText">{text}</span>
      {at === undefined ? null : <span className="wb-activityLineAt">{at}</span>}
      {actions === undefined ? null : <span className="wb-activityLineActions">{actions}</span>}
    </div>
  );
}

/**
 * `ActivityAction` 的契约：一颗图标钮、一个外链，或一个失败态。
 */
export interface ActivityActionProps {
  readonly label: string;
  readonly hint?: string | undefined;
  readonly icon: ReactNode;
  readonly href?: string | undefined;
  readonly onClick?: (() => void) | undefined;
  readonly failed?: boolean | undefined;
}

/**
 * 活动行尾那颗动作：给 `href` 就是外链，否则是图标钮并带上 tooltip。
 * @param props.label - 读屏名，也是 `hint` 不给时的 tooltip 文案。
 * @param props.hint - tooltip 上那句更细的说明；不给退化成 `label`。
 * @param props.icon - 那颗图标。
 * @param props.href - 给了就渲染成新窗口外链；与 `onClick` 同时给时以它为准。
 * @param props.onClick - 图标钮的点击回调。
 * @param props.failed - 上一次动作失败了：钮换成危险色（默认 false）。
 * @returns 一个 `<a>` 或一颗 `Button`。
 */
export function ActivityAction({ label, hint, icon, href, onClick, failed }: ActivityActionProps) {
  const tip = hint ?? label;
  if (href !== undefined) {
    return (
      <a
        className="wb-iconButton"
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        title={tip}
        aria-label={label}
      >
        {icon}
      </a>
    );
  }
  return (
    <Tooltip side="bottom" align="end" gap={6} portal label={tip}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={failed === true ? 'wb-iconButton wb-activityActionFailed' : 'wb-iconButton'}
        aria-label={label}
        icon={icon}
        onClick={onClick}
      />
    </Tooltip>
  );
}
