import type { ReactNode } from '../lib/react.js';
import { h } from '../lib/react.js';
import './ApprovalPlan.css';

/**
 * 审批详情里的一行：左边标签、右边值。
 */
export interface ApprovalPlanRow {
  readonly label: ReactNode;
  readonly value: ReactNode;
}

/**
 * `ApprovalPlan` 的契约：详情行，外加附注与警告两格。
 */
export interface ApprovalPlanProps {
  readonly rows: readonly ApprovalPlanRow[];
  readonly hint?: ReactNode | undefined;
  readonly warn?: ReactNode | undefined;
  readonly children?: ReactNode | undefined;
}

/**
 * 审批屏那张"这次要做什么"的表：一行一项，上面可给一句附注、下面可给一句警告。
 * @param props.rows - 详情行，按给的顺序渲染；空数组时只剩附注与警告。
 * @param props.hint - 表上面那句说明；不给不画。
 * @param props.warn - 表下面那句警告；不给不画。
 * @param props.children - 插在表与 `warn` 之间的补充内容。
 * @returns 一个 div。
 */
export function ApprovalPlan({ rows, hint, warn, children }: ApprovalPlanProps) {
  return (
    <div className="wb-approvalPlan">
      {hint === undefined ? null : <p className="wb-approvalHint">{hint}</p>}
      <dl className="wb-approvalRows">
        {rows.map((row, index) => (
          <div className="wb-approvalRow" key={String(index)}>
            <dt className="wb-approvalLabel">{row.label}</dt>
            <dd className="wb-approvalValue">{row.value}</dd>
          </div>
        ))}
      </dl>
      {children}
      {warn === undefined ? null : <p className="wb-approvalWarn">{warn}</p>}
    </div>
  );
}
