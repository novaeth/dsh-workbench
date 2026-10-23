import type { ReactNode } from 'react';
import { h } from '../lib/react.js';
import './ResourceStates.css';

/**
 * 骨架屏：读数期间已经知道大概形状时用它（连形状都不知道就用 `CenteredState` 那句"正在读"）。
 * @param props.rows - 画几行骨架（默认 4）；整块 `aria-hidden`，不读给读屏。
 * @returns 一叠占位条。
 */
export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="wb-skeleton" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} className="wb-skeletonRow">
          <span className="wb-skeletonBar wb-skeletonBarTitle" />
          <span className="wb-skeletonBar wb-skeletonBarMeta" />
        </span>
      ))}
    </div>
  );
}

/**
 * `CenteredState` 的契约：图标、标题、说明、明细与动作。
 */
export interface CenteredStateProps {
  icon: ReactNode;
  title: ReactNode;
  hint?: string;
  detail?: string;
  action?: ReactNode;
  compact?: boolean;
}

/**
 * 居中一屏：要他先选一个 / 正在读 / 读不到时用它占住卡片版面。
 * @param props.icon - 标题上方那枚图标；给 `null` 就只留标题（加载与报错常见）。
 * @param props.title - 正中那行大字。
 * @param props.hint - 标题下的一行说明。
 * @param props.detail - 更细的一行（如原始错误码与那句话）；"读不到"时把错误放这里，绝不显示 0。
 * @param props.action - 底部动作（如"重试"）；不给不画。
 * @param props.compact - 紧凑档（默认 false），卡里空间小的时候给 true。
 * @returns 一个 `role="status"` 的居中块。
 */
export function CenteredState({ icon, title, hint, detail, action, compact = false }: CenteredStateProps) {
  return (
    <div className={compact ? 'wb-centered wb-centeredCompact' : 'wb-centered'} role="status">
      {icon === null ? null : (
        <span className="wb-centeredHero" aria-hidden="true">
          {icon}
        </span>
      )}
      <div className="wb-centeredTitle">{title}</div>
      {hint === undefined ? null : <div className="wb-centeredHint">{hint}</div>}
      {detail === undefined ? null : <div className="wb-centeredDetail">{detail}</div>}
      {action === undefined ? null : <div className="wb-centeredAction">{action}</div>}
    </div>
  );
}

/**
 * 就绪但空：它只是 `CenteredState` 的简写，标题就是那句空态文案。
 * @param props.text - 空态那句话。
 * @param props.icon - 标题上方的图标；默认 `null`，不画图标。
 * @param props.compact - 紧凑档，默认 false。
 * @returns 一个居中块。
 */
export function EmptyState({ text, icon = null, compact = false }: { text: string; icon?: ReactNode; compact?: boolean }) {
  return <CenteredState icon={icon} title={text} compact={compact} />;
}
