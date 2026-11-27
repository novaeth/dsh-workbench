import { h } from '../../lib/react.js';
import {
  longTaskProgressIsValid,
  longTaskProgressPercent,
  type LongTaskProgress,
} from '../../contract/long-task.js';
import './ProgressBar.css';

/**
 * 进度条的色档：与卡片指标的档位同一套令牌。
 */
export type ProgressBarTone = 'neutral' | 'ok' | 'warn' | 'bad' | 'busy';

/**
 * `ProgressBar` 的契约：走到哪、一共多少、多高、什么色。
 */
export interface ProgressBarProps {
  /** 进度：`done` / `total` 两个数。不合法时整根条不画。 */
  readonly progress: LongTaskProgress;
  /** 条高像素：6 是卡片指标档，4 是长任务普通档，2 是紧凑档（左栏列表）。默认 4。 */
  readonly size?: 6 | 4 | 2;
  /** 色档，默认按「在走」取主色。 */
  readonly tone?: ProgressBarTone;
  /** 读屏用的名字；给了才挂读屏可见的进角色。 */
  readonly label?: string | undefined;
}

const FILL: Readonly<Record<ProgressBarTone, string>> = {
  neutral: 'wb-progressFillNeutral',
  ok: 'wb-progressFillOk',
  warn: 'wb-progressFillWarn',
  bad: 'wb-progressFillBad',
  busy: 'wb-progressFillBusy',
};

/**
 * 一根进度条：轨道 + 填充，宽度按百分比。
 * @param props 进度、条高、色档与读屏名。
 * @returns 有进度时是一根带 `progressbar` 角色的条；没有合法进度时什么都不画。
 */
export function ProgressBar({ progress, size = 4, tone = 'busy', label }: ProgressBarProps) {
  if (!longTaskProgressIsValid(progress)) return null;
  const width = longTaskProgressPercent(progress) ?? 0;
  return (
    <div
      className={`wb-progress wb-progress-${String(size)}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={progress.total}
      aria-valuenow={progress.done}
      aria-valuetext={`${String(progress.done)}/${String(progress.total)}`}
      {...(label === undefined ? {} : { 'aria-label': label })}
    >
      <div
        className={`wb-progressFill ${FILL[tone]}`}
        style={{ width: `${String(width)}%` }}
      />
    </div>
  );
}
