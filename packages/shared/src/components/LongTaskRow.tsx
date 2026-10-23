import { longTaskDot, longTaskStopPress, longTaskStopStage, LONG_TASK_STOP_ARM_MS, type LongTaskStatus } from '../api/long-task.js';
import { Link } from './Link.js';
import { Fragment, h, useEffect, useState } from '../lib/react.js';
import {
  CodeBlock,
  DisclosureRow,
  IconCodeOutlineRegular,
  IconFlatListOutlineRegular,
  IconStopFillRegular,
  StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives';
import './LongTaskRow.css';

/**
 * 长任务行尾的一个链接：地址与文字。
 */
export interface LongTaskRowLink {
  readonly href: string;
  readonly text: string;
}

/**
 * `LongTaskRow` 那颗两按停止钮的契约：确认之后真发的那一下、三句词、在飞与失败两态。
 * `label` 是没上膛时那颗钮的 aria-label（dsh 的词：`停止任务 {label}`）；`askLabel` 是上膛时那颗钮上显示的字（`确认停止`）；
 * `armedLabel` 是上膛时的 aria-label，不给就用 `askLabel`（`再次点击确认停止`）；`busy` = 这一趟正在被停、钮禁用；
 * `failed` 给了才在问题那行后面再画一行。
 */
export interface LongTaskRowStop {
  readonly onStop: () => void;
  readonly label: string;
  readonly askLabel: string;
  readonly armedLabel?: string | undefined;
  readonly busy?: boolean | undefined;
  readonly failed?: string | null | undefined;
}

/**
 * `LongTaskRow` 的契约：状态、标题、问题、链接，两处可展开的原始输出，与最右边那颗可选的停止钮。
 */
export interface LongTaskRowProps {
  readonly status: LongTaskStatus;
  readonly headline: string;
  readonly problem?: string | undefined;
  readonly links?: readonly LongTaskRowLink[] | undefined;
  readonly steps?: readonly string[] | undefined;
  readonly raw?: string | undefined;
  readonly stepsTitle?: string | undefined;
  readonly rawTitle?: string | undefined;
  readonly copyLabel?: string | undefined;
  readonly copiedLabel?: string | undefined;
  readonly stop?: LongTaskRowStop | undefined;
}

function RowLink({ href, text }: LongTaskRowLink) {
  return (
    <Link href={href} className="wb-longTaskLink">
      {text}
    </Link>
  );
}

/**
 * 长任务那一行：状态点 + 标题 + 链接，跑失败时把步骤与原始输出收在两处可展开里。
 * 发布、扫描、迁移这类跑得久的事都用它，别自己画进度。
 * @param props.status - `longTaskDot` 认的五态之一，决定状态点颜色与要不要画"失败"那两块。
 * @param props.headline - 这一行在干什么（一句话）。
 * @param props.problem - 失败原因；不给不画。
 * @param props.links - 行尾的链接，通常指向产物或日志。
 * @param props.steps - 步骤文本；只在失败时画，且要同时给 `stepsTitle` 才成一块可展开。
 * @param props.raw - 原始输出；只在失败时画，且要同时给 `rawTitle` 才成一块可展开。
 * @param props.stepsTitle - 步骤那块展开行的标题；`rawTitle` 同理是原始输出那块。
 * @param props.copyLabel - 复制钮文案：给了才画复制钮；`copiedLabel` 是复制成功后那句。
 * @param props.stop - 给了才在最右边画那颗两按停止钮；**不给就一个像素都不变**。只在生产方认 `signal` 时给。
 * @returns 一行长任务。
 */
export function LongTaskRow(props: LongTaskRowProps) {
  const [stepsOpen, setStepsOpen] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const failed = props.status === 'failed';
  const problem = props.problem ?? '';
  const raw = (props.raw ?? '').trim();
  const steps = props.steps ?? [];
  const stop = props.stop;
  const busy = stop?.busy === true;
  const stopWhy = stop?.failed ?? '';

  useEffect(() => {
    if (!armed) return undefined;
    const timer = setTimeout(() => setArmed(false), LONG_TASK_STOP_ARM_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  const onStopPress = (): void => {
    if (stop === undefined) return;
    const press = longTaskStopPress(longTaskStopStage({ armed, busy }));
    if (press === 'ignore') return;
    if (press === 'arm') {
      setArmed(true);
      return;
    }
    setArmed(false);
    stop.onStop();
  };

  return (
    <div className="wb-longTask">
      <p className="wb-longTaskHead">
        <StateDot state={longTaskDot(props.status)} size={10} />
        <span className="wb-longTaskHeadline">{props.headline}</span>
        {(props.links ?? []).map((link) => (
          <RowLink href={link.href} key={`${link.text}@${link.href}`} text={link.text} />
        ))}
        {stop === undefined ? null : (
          <button
            type="button"
            className={`wb-longTaskStop${armed ? ' wb-longTaskStopArmed' : ''}`}
            data-stop-state={longTaskStopStage({ armed, busy })}
            aria-label={armed ? stop.armedLabel ?? stop.askLabel : stop.label}
            disabled={busy}
            onClick={onStopPress}
            onBlur={() => setArmed(false)}
          >
            <IconStopFillRegular size={12} />
            {armed ? <span className="wb-longTaskStopLabel">{stop.askLabel}</span> : null}
          </button>
        )}
      </p>
      {problem === '' ? null : <p className="wb-longTaskProblem">{problem}</p>}
      {stopWhy === '' ? null : <p className="wb-longTaskStopWhy">{stopWhy}</p>}
      {!failed ? null : (
        <Fragment>
          {steps.length === 0 || props.stepsTitle === undefined ? null : (
            <DisclosureRow
              className="wb-longTaskDump"
              icon={<IconFlatListOutlineRegular size={14} />}
              title={props.stepsTitle}
              open={stepsOpen}
              expandable
              expandOnRowClick
              previewChevron
              onToggle={() => setStepsOpen(!stepsOpen)}
            >
              <CodeBlock
                code={steps.join('\n')}
                className="wb-longTaskDump"
                showHeader={props.copyLabel !== undefined}
                copyLabel={props.copyLabel ?? ''}
                copiedLabel={props.copiedLabel ?? ''}
              />
            </DisclosureRow>
          )}
          {raw === '' || props.rawTitle === undefined ? null : (
            <DisclosureRow
              className="wb-longTaskDump"
              icon={<IconCodeOutlineRegular size={14} />}
              title={props.rawTitle}
              open={rawOpen}
              expandable
              expandOnRowClick
              previewChevron
              onToggle={() => setRawOpen(!rawOpen)}
            >
              <CodeBlock
                code={raw}
                className="wb-longTaskDump"
                showHeader={props.copyLabel !== undefined}
                copyLabel={props.copyLabel ?? ''}
                copiedLabel={props.copiedLabel ?? ''}
              />
            </DisclosureRow>
          )}
        </Fragment>
      )}
    </div>
  );
}
