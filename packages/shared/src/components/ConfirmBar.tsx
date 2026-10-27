import type { ReactNode } from '../lib/react.js';
import { h } from '../lib/react.js';
import { FormActions, type FormAction } from './FormActions.js';
import { Note } from './Note.js';
import { Row, Rows } from './Rows.js';
import './ConfirmBar.css';

/**
 * `ConfirmBar` 的一格键值：`label` 在左、`value` 在右（走 `Rows` 的标签列）。
 */
export interface ConfirmRow {
  readonly key: string;
  readonly label: ReactNode;
  readonly value: ReactNode;
}

/**
 * `ConfirmBar` 的契约：标题、说明、键值、失败那句与动作。
 */
export interface ConfirmBarProps {
  readonly title: ReactNode;
  readonly hint?: ReactNode | undefined;
  readonly rows?: readonly ConfirmRow[] | undefined;
  readonly actions: readonly FormAction[];
  readonly problem?: ReactNode | undefined;
  readonly busy?: boolean | undefined;
  readonly label?: string | undefined;
}

/**
 * 「先问一句再动手」那一条：标题 + 说明 + 键值 + 失败那句 + 动作区，形状一次收口。
 * **要不要问**归调用点，这一件只回答"问的时候长什么样"。
 * @param props.title - 那一句问话（"发布到 prod？"）。
 * @param props.hint - 标题下面那句说明或正文；不给不占位。
 * @param props.rows - 键值两格（键值列宽与分隔线归 `Rows` / `Row`）；不给或空数组不渲染。值那一格可以放控件。
 * @param props.actions - 动作清单（归 `FormActions`：一个区一颗 `primary`、永远在右、窄了折行）。
 * @param props.problem - 失败那句（走 `Note tone="problem"`，读屏是 `alert`）；不给不占位。
 * @param props.busy - 整条在忙（只喂 `aria-busy`；按钮自己的转圈与禁用归 `actions` 里那一颗）。
 * @param props.label - 读屏的组名；不给时 `title` 是字符串就拿它顶上，两者都没有就不设。
 * @returns 一个 `role="group"` 的条；`actions` 空数组时最后那一块不渲染。
 */
export function ConfirmBar({ title, hint, rows, actions, problem, busy, label }: ConfirmBarProps) {
  const name = label ?? (typeof title === 'string' ? title : undefined);
  return (
    <div className="wb-confirmBar" role="group" aria-label={name} aria-busy={busy}>
      <p className="wb-confirmBarTitle">{title}</p>
      {hint === undefined ? null : <p className="wb-confirmBarHint">{hint}</p>}
      {rows === undefined || rows.length === 0 ? null : (
        <Rows>
          {rows.map((row) => (
            <Row key={row.key} label={row.label} value={row.value} />
          ))}
        </Rows>
      )}
      {problem === undefined ? null : (
        <Note tone="problem" role="alert">
          {problem}
        </Note>
      )}
      <FormActions actions={actions} />
    </div>
  );
}
