import type { FormEvent, ReactNode } from 'react';
import {
  LONG_TASK_LINK_MAX,
  longTaskDot,
  longTaskIsLive,
  longTaskProgressIsValid,
  longTaskStopPress,
  longTaskStopStage,
  LONG_TASK_STOP_ARM_MS,
  type LongTaskInterventionField,
  type LongTaskProgress,
  type LongTaskStatus,
  type LongTaskStepRow,
} from '../../contract/long-task.js';
import { ProgressBar, type ProgressBarTone } from '../feedback/ProgressBar.js';
import { Link } from '../layout/Link.js';
import { Fragment, h, useEffect, useState } from '../../lib/react.js';
import {
  Button,
  CodeBlock,
  DisclosureRow,
  IconCodeOutlineRegular,
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
  readonly pending?: string | undefined;
}

/**
 * 跑在 `needs-login` 时那颗「去登录」：文案与点击。
 */
export interface LongTaskRowLogin {
  readonly label: string;
  readonly onOpen: () => void;
}

/**
 * 人工干预节点上的一个动作：文案与点击；`busy` 为真时那颗钮禁用（请求在飞）。
 */
export interface LongTaskRowInterventionAction {
  readonly key: string;
  readonly label: string;
  readonly primary?: boolean | undefined;
  readonly busy?: boolean | undefined;
  readonly onPress: () => void;
}

interface InterventionSubmit {
  readonly label: string;
  readonly busy?: boolean | undefined;
  readonly failed?: string | null | undefined;
  readonly onSubmit: (values: Readonly<Record<string, string>>) => void;
}

/**
 * 人工干预节点（`needs-human`）：要人做什么、为什么、行内动作，以及动作失败时那一行。
 * 需要人填结构化回执时给 `fields` 与 `submit`：每项一个 label + 输入框，提交把整份值交给 `submit.onSubmit`。
 */
export interface LongTaskRowIntervention {
  readonly title: string;
  readonly hint?: string | undefined;
  readonly actions?: readonly LongTaskRowInterventionAction[] | undefined;
  readonly fields?: readonly LongTaskInterventionField[] | undefined;
  readonly submit?: InterventionSubmit | undefined;
  readonly failed?: string | null | undefined;
}

/**
 * `LongTaskRow` 的契约：状态、标题、问题、链接、登录钮，两处可展开的原始输出，与最右边那颗可选的停止钮。
 */
export interface LongTaskRowProps {
  /** 六态之一，决定默认的点与「失败」那一块。 */
  readonly status: LongTaskStatus;
  /** 这一行在干什么（一句话）。 */
  readonly headline: string;
  /** 当前步骤；运行中 / 停止后给，不给不画。 */
  readonly step?: string | undefined;
  /** 状态词 · 耗时那一行；不给不画。 */
  readonly meta?: string | undefined;
  /** 点的档位覆盖；不给就用 `longTaskDot(status)`。 */
  readonly dot?: 'done' | 'ongoing' | 'error' | 'idle' | 'warning' | undefined;
  /** 点的读屏文案；不给就不挂 `aria-label`。 */
  readonly dotLabel?: string | undefined;
  /** 第几次重试那行的文案；只在 `attempt > 1` 时用，不给不画。 */
  readonly attemptLabel?: ((attempt: number) => string) | undefined;
  /** 紧凑档（默认 false）；进度条降到 2px，数字由调用点并进 `meta`。 */
  readonly dense?: boolean | undefined;
  /** 这一趟走到哪了；不合法或没给就一根条都不画。 */
  readonly progress?: LongTaskProgress | undefined;
  /** 进度条的读屏名；不给就不挂 `aria-label`。 */
  readonly progressLabel?: string | undefined;
  /** 失败原因；不给不画。 */
  readonly problem?: string | undefined;
  /** 行尾的链接，通常指向产物或日志。 */
  readonly links?: readonly LongTaskRowLink[] | undefined;
  /** 旧的纯文本步骤；只在没有 `history` 时作为回退画。 */
  readonly steps?: readonly string[] | undefined;
  /** 结构化步骤；有它就一行一步，每步的链接挂在行尾。 */
  readonly history?: readonly LongTaskStepRow[] | undefined;
  /** 原始输出；给了 `rawTitle` 才成一块可展开。 */
  readonly raw?: string | undefined;
  /** 步骤那块展开行的标题；`rawTitle` 同理是原始输出那块。 */
  readonly stepsTitle?: string | undefined;
  /** 原始输出那块展开行的标题；不给就不展开原始输出。 */
  readonly rawTitle?: string | undefined;
  /** 复制钮文案：给了才画复制钮；`copiedLabel` 是复制成功后那句。 */
  readonly copyLabel?: string | undefined;
  /** 复制成功后的文案；不给用默认。 */
  readonly copiedLabel?: string | undefined;
  /** `needs-login` 时那颗「去登录」；不给不画。 */
  readonly login?: LongTaskRowLogin | undefined;
  /** `needs-human` 时的「要人做什么」那一行与动作；不给不画。 */
  readonly intervention?: LongTaskRowIntervention | undefined;
  /** 给了才在最右边画那颗两按停止钮；**不给就一个像素都不变**。`pending` 是「已请求停止，等模块确认」那句。 */
  readonly stop?: LongTaskRowStop | undefined;
}

function RowLink({ href, text }: LongTaskRowLink) {
  return (
    <Link href={href} className="wb-longTaskLink">
      {text}
    </Link>
  );
}

const STEP_DOT: Readonly<
  Record<LongTaskStepRow['kind'], 'done' | 'ongoing' | 'error' | 'idle' | 'warning'>
> = {
  start: 'ongoing',
  succeed: 'done',
  fail: 'error',
  warn: 'warning',
  info: 'idle',
};

const HTTP_PATTERN = /^https?:\/\//i;

function StepRow({
  row,
  live,
  last,
  attemptLabel,
}: {
  readonly row: LongTaskStepRow;
  readonly live: boolean;
  readonly last: boolean;
  readonly attemptLabel?: ((attempt: number) => string) | undefined;
}) {
  const links = (row.links ?? [])
    .filter((link) => HTTP_PATTERN.test(link.href))
    .slice(0, LONG_TASK_LINK_MAX);
  const state = row.kind === 'start' ? (live && last ? 'ongoing' : 'idle') : STEP_DOT[row.kind];
  const attempt =
    row.attempt !== undefined && row.attempt > 1 && attemptLabel !== undefined
      ? attemptLabel(row.attempt)
      : undefined;
  const content = (
    <Fragment>
      <span className="wb-longTaskStepText">{row.text}</span>
      {links.map((link) => (
        <Link className="wb-longTaskStepLink" href={link.href} key={`${link.href}@${link.text}`}>
          {link.text}
        </Link>
      ))}
      {attempt === undefined ? null : <span className="wb-longTaskStepAttempt">{attempt}</span>}
    </Fragment>
  );
  if (row.kind === 'info') {
    return (
      <li className="wb-longTaskStepRow wb-longTaskStepDetail" data-kind="info">
        {content}
      </li>
    );
  }
  return (
    <li className="wb-longTaskStepRow" data-kind={row.kind}>
      <StateDot state={state} size={8} />
      {content}
    </li>
  );
}

function DumpBlock(props: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly children: ReactNode;
}) {
  return (
    <DisclosureRow
      className="wb-longTaskDump"
      icon={props.icon}
      title={props.title}
      open={props.open}
      expandable
      expandOnRowClick
      previewChevron
      onToggle={props.onToggle}
    >
      {props.children}
    </DisclosureRow>
  );
}

interface InterventionFormProps {
  readonly fields: readonly LongTaskInterventionField[];
  readonly submit: InterventionSubmit;
}

function InterventionForm({ fields, submit }: InterventionFormProps) {
  const [values, setValues] = useState<Readonly<Record<string, string>>>({});
  const submitBusy = submit.busy === true;
  const requiredMissing = fields.some(
    (field) => field.required === true && (values[field.key] ?? '').trim() === '',
  );
  const submitFailed = submit.failed ?? '';

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (submitBusy || requiredMissing) return;
    submit.onSubmit({ ...values });
  };

  return (
    <Fragment>
      <form className="wb-longTaskForm" onSubmit={onSubmit}>
        {fields.map((field) => (
          <label className="wb-longTaskField" key={field.key}>
            <span className="wb-longTaskFieldLabel">
              {field.label}
              {field.required === true ? <span className="wb-longTaskFieldRequired">*</span> : null}
            </span>
            <input
              className="wb-longTaskFieldInput"
              type={field.kind === 'secret' ? 'password' : 'text'}
              autoComplete="off"
              placeholder={field.placeholder}
              value={values[field.key] ?? ''}
              onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
            />
          </label>
        ))}
        <Button type="submit" size="sm" variant="primary" disabled={submitBusy || requiredMissing}>
          {submit.label}
        </Button>
      </form>
      {submitFailed === '' ? null : <p className="wb-longTaskNeedWhy">{submitFailed}</p>}
    </Fragment>
  );
}

function StopControl({ stop, onFired }: { stop: LongTaskRowStop; onFired: () => void }) {
  const [armed, setArmed] = useState(false);
  const busy = stop.busy === true;

  useEffect(() => {
    if (!armed) return undefined;
    const timer = setTimeout(() => setArmed(false), LONG_TASK_STOP_ARM_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  const onPress = (): void => {
    const press = longTaskStopPress(longTaskStopStage({ armed, busy }));
    if (press === 'ignore') return;
    if (press === 'arm') {
      setArmed(true);
      return;
    }
    setArmed(false);
    onFired();
    stop.onStop();
  };

  return (
    <button
      type="button"
      className={`wb-longTaskStop${armed ? ' wb-longTaskStopArmed' : ''}`}
      data-stop-state={longTaskStopStage({ armed, busy })}
      aria-label={armed ? stop.armedLabel ?? stop.askLabel : stop.label}
      disabled={busy}
      onClick={onPress}
      onBlur={() => setArmed(false)}
    >
      <IconStopFillRegular size={12} />
      {armed ? <span className="wb-longTaskStopLabel">{stop.askLabel}</span> : null}
    </button>
  );
}

function InterventionNeed({ intervention }: { intervention: LongTaskRowIntervention }) {
  const fields = intervention.fields ?? [];
  const submit = intervention.submit;
  return (
    <Fragment>
      <p className="wb-longTaskNeed">
        <span className="wb-longTaskNeedTitle">{intervention.title}</span>
        {intervention.hint === undefined ? null : (
          <span className="wb-longTaskNeedHint">{intervention.hint}</span>
        )}
        {(intervention.actions ?? []).map((action) => (
          <Button
            key={action.key}
            type="button"
            size="sm"
            variant={action.primary === true ? 'primary' : 'outline'}
            disabled={action.busy === true}
            onClick={action.onPress}
          >
            {action.label}
          </Button>
        ))}
      </p>
      {fields.length === 0 || submit === undefined ? null : (
        <InterventionForm fields={fields} submit={submit} />
      )}
      {intervention.failed === undefined || intervention.failed === null || intervention.failed === '' ? null : (
        <p className="wb-longTaskNeedWhy">{intervention.failed}</p>
      )}
    </Fragment>
  );
}

/**
 * 长任务那一行：点 + 标题 + 链接，可选一行当前步骤与一行状态 · 耗时；步骤收在可展开里。
 * 发布、扫描、迁移这类跑得久的事都用它，别自己画进度。
 * @returns 一行长任务。
 */
export function LongTaskRow(props: LongTaskRowProps) {
  const [stepsOpen, setStepsOpen] = useState(props.status === 'failed');
  const [rawOpen, setRawOpen] = useState(false);
  const [stopFired, setStopFired] = useState(false);
  const failed = props.status === 'failed';
  const live = longTaskIsLive(props.status);
  const dot = props.dot ?? longTaskDot(props.status);
  const step = props.step ?? '';
  const meta = props.meta ?? '';
  const history = props.history ?? [];
  const problem = props.problem ?? '';
  const raw = (props.raw ?? '').trim();
  const steps = props.steps ?? [];
  const stop = props.stop;
  const busy = stop?.busy === true;
  const stopWhy = stop?.failed ?? '';
  const stopPending =
    stopFired && live && !busy && stopWhy === '' ? stop?.pending ?? '' : '';
  const progress =
    props.progress === undefined || !longTaskProgressIsValid(props.progress)
      ? undefined
      : props.progress;
  const progressTone: ProgressBarTone =
    props.status === 'ok'
      ? 'ok'
      : props.status === 'failed'
        ? 'bad'
        : props.status === 'stopped'
          ? 'neutral'
          : props.status === 'needs-human' || props.status === 'needs-login'
            ? 'warn'
            : 'busy';

  useEffect(() => {
    if (failed) setStepsOpen(true);
  }, [failed]);

  const expandable = props.stepsTitle !== undefined && (history.length > 0 || steps.length > 0);
  const stepShown = step !== '' && !props.headline.includes(step);
  const dotNode =
    props.dotLabel === undefined ? (
      <StateDot state={dot} size={10} />
    ) : (
      <span role="img" aria-label={props.dotLabel}>
        <StateDot state={dot} size={10} />
      </span>
    );

  return (
    <div className={props.dense === true ? 'wb-longTask wb-longTaskDense' : 'wb-longTask'}>
      <DisclosureRow
        icon={dotNode}
        title={props.headline}
        open={expandable && stepsOpen}
        expandable={expandable}
        expandOnRowClick
        previewChevron
        titleClassName="wb-longTaskHeadline"
        onToggle={() => setStepsOpen((value) => !value)}
        headerAccessory={
          <span className="wb-longTaskHeadEnd">
            {(props.links ?? []).map((link) => (
              <RowLink href={link.href} key={`${link.text}@${link.href}`} text={link.text} />
            ))}
            {props.login === undefined ? null : (
              <Button type="button" size="sm" variant="outline" onClick={props.login.onOpen}>
                {props.login.label}
              </Button>
            )}
            {meta === '' ? null : <span className="wb-longTaskMeta">{meta}</span>}
            {stop === undefined ? null : (
              <StopControl stop={stop} onFired={() => setStopFired(true)} />
            )}
          </span>
        }
      >
        {stepShown ? <p className="wb-longTaskStep">{step}</p> : null}
        {history.length === 0 ? (
          <CodeBlock
            code={steps.join('\n')}
            className="wb-longTaskDump"
            showHeader={props.copyLabel !== undefined}
            copyLabel={props.copyLabel ?? ''}
            copiedLabel={props.copiedLabel ?? ''}
          />
        ) : (
          <ul className="wb-longTaskSteps">
            {history.map((row, index) => (
              <StepRow
                key={`${String(index)}:${row.text}`}
                row={row}
                live={live}
                last={index === history.length - 1}
                {...(props.attemptLabel === undefined ? {} : { attemptLabel: props.attemptLabel })}
              />
            ))}
          </ul>
        )}
      </DisclosureRow>
      {stopPending === '' ? null : <p className="wb-longTaskStopPending">{stopPending}</p>}
      {props.intervention === undefined ? null : (
        <InterventionNeed intervention={props.intervention} />
      )}
      {problem === '' ? null : <p className="wb-longTaskProblem">{problem}</p>}
      {stopWhy === '' ? null : <p className="wb-longTaskStopWhy">{stopWhy}</p>}
      {raw === '' || props.rawTitle === undefined ? null : (
        <DumpBlock
          icon={<IconCodeOutlineRegular size={14} />}
          title={props.rawTitle}
          open={rawOpen}
          onToggle={() => setRawOpen(!rawOpen)}
        >
          <CodeBlock
            code={raw}
            className="wb-longTaskDump"
            showHeader={props.copyLabel !== undefined}
            copyLabel={props.copyLabel ?? ''}
            copiedLabel={props.copiedLabel ?? ''}
          />
        </DumpBlock>
      )}
      {progress === undefined ? null : (
        <div className="wb-longTaskProgress">
          <ProgressBar
            progress={progress}
            size={props.dense === true ? 2 : 4}
            tone={progressTone}
            {...(props.progressLabel === undefined ? {} : { label: props.progressLabel })}
          />
          {props.dense === true ? null : (
            <span className="wb-longTaskProgressText">
              {`${String(progress.done)}/${String(progress.total)}`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
