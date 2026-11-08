import type { ReactNode } from '../lib/react.js';
import { h } from '../lib/react.js';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { CenteredState } from './ResourceStates.js';
import { Note } from './Note.js';
import { SaveBar } from './SaveBar.js';
import styles from './SetupShell.module.css';

/**
 * 初始化的一步：渲染什么、能不能走、走去哪、走之前存什么。
 */
export interface SetupStep {
  readonly id: string;
  readonly title: string;
  readonly render: (ctx: SetupStepContext) => ReactNode;
  readonly canLeave?: ((values: Readonly<Record<string, unknown>>) => boolean) | undefined;
  readonly next?: ((values: Readonly<Record<string, unknown>>) => string | null) | undefined;
  readonly submit?:
    | ((values: Readonly<Record<string, unknown>>) => Promise<SetupWriteResult>)
    | undefined;
}

/**
 * 每步的渲染上下文：当前值、改值、忙碌与错误。
 */
export interface SetupStepContext {
  readonly values: Readonly<Record<string, unknown>>;
  readonly setValues: (next: Record<string, unknown>) => void;
  readonly busy: boolean;
  readonly error: string | null;
}

/**
 * 一次配置读取的结果：`configured` 为真表示已经不用再初始化，`values` 是已存的值。
 */
export interface SetupSnapshot {
  readonly configured: boolean;
  readonly values?: Readonly<Record<string, unknown>> | undefined;
}

/**
 * 一次配置写入的结果。
 */
export type SetupWriteResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code?: string | undefined; readonly message: string };

/**
 * 初始化流程的归一化相位：正在读 / 要配置 / 已就绪 / 读不到。
 */
export type SetupPhase = 'checking' | 'needs-setup' | 'ready' | 'blocked';

/**
 * `useUnitSetup` 交出来的那台机器；`SetupShell` 只认这一个形状。
 */
export interface UnitSetup {
  readonly phase: SetupPhase;
  readonly steps: readonly SetupStep[];
  readonly step: SetupStep | undefined;
  readonly values: Readonly<Record<string, unknown>>;
  readonly setValues: (next: Record<string, unknown>) => void;
  readonly busy: boolean;
  readonly error: string | null;
  readonly canLeave: boolean;
  readonly canBack: boolean;
  readonly next: () => void;
  readonly back: () => void;
  readonly retry: () => void;
  readonly saveAll: () => void;
}

/**
 * `SetupShell` 自己那几句文案；模块按自己的词表给。
 */
export interface SetupShellLabels {
  readonly back: string;
  readonly next: string;
  readonly finish: string;
  readonly save: string;
  readonly saving: string;
  readonly cancel: string;
  readonly reading: string;
  readonly failed: string;
}

/**
 * `<SetupShell>` 的 prop：一台 `useUnitSetup` 的机器、文案、以及完成后的主页。
 */
export interface SetupShellProps {
  readonly setup: UnitSetup;
  readonly labels: SetupShellLabels;
  readonly mode?: 'setup' | 'edit' | undefined;
  readonly renderHome?: (() => ReactNode) | undefined;
  readonly onCancel?: (() => void) | undefined;
}

/**
 * 初始化 / 配置的外壳：分步、上一步 / 下一步 / 完成、阻断与错误，完成之后把主页换进来。
 * @param props.setup - `useUnitSetup` 的返回值；壳不自己取数、不自己写配置。
 * @param props.labels - 八句文案：上一步 / 下一步 / 完成 / 保存 / 保存中 / 取消 / 正在读 / 读不到。
 * @param props.mode - `setup`（默认，分步）或 `edit`（同一步骤集合摊成一页，底部 `SaveBar`）。
 * @param props.renderHome - 相位到 `ready` 时渲染什么；不给就只留空。
 * @param props.onCancel - `edit` 模式点取消做什么；不给钮就什么都不做。
 * @returns 一块初始化或配置界面。
 */
export function SetupShell({
  setup,
  labels,
  mode = 'setup',
  renderHome,
  onCancel,
}: SetupShellProps) {
  if (setup.phase === 'checking') {
    return <CenteredState icon={null} title={labels.reading} />;
  }
  if (setup.phase === 'blocked') {
    return (
      <CenteredState
        icon={null}
        title={labels.failed}
        {...(setup.error === null ? {} : { detail: setup.error })}
      />
    );
  }
  if (mode === 'edit') {
    return editForm(setup, labels, onCancel);
  }
  if (setup.phase === 'ready') {
    return renderHome === undefined ? null : renderHome();
  }
  const step = setup.step;
  if (step === undefined) return null;
  const index = setup.steps.findIndex((candidate) => candidate.id === step.id);
  const last = index === setup.steps.length - 1;
  return (
    <div className={styles.setup}>
      <ol className={styles.steps}>
        {setup.steps.map((candidate, at) => (
          <li
            key={candidate.id}
            className={
              at === index
                ? `${styles.step} ${styles.stepActive}`
                : at < index
                  ? `${styles.step} ${styles.stepDone}`
                  : styles.step
            }
            aria-current={at === index ? 'step' : undefined}
          >
            <span className={styles.stepIndex}>{at + 1}</span>
            <span className={styles.stepTitle}>{candidate.title}</span>
          </li>
        ))}
      </ol>
      <div className={styles.body}>{step.render(stepContext(setup))}</div>
      {setup.error === null ? null : (
        <Note tone="problem">{setup.error}</Note>
      )}
      <div className={styles.actions}>
        {setup.canBack ? (
          <Button type="button" variant="outline" size="sm" onClick={setup.back}>
            {labels.back}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={!setup.canLeave || setup.busy}
          onClick={setup.next}
        >
          {last ? labels.finish : labels.next}
        </Button>
      </div>
    </div>
  );
}

function editForm(
  setup: UnitSetup,
  labels: SetupShellLabels,
  onCancel: (() => void) | undefined,
): ReactNode {
  return (
    <div className={styles.edit}>
      {setup.steps.map((step) => (
        <section key={step.id} className={styles.editSection}>
          <h3 className={styles.editTitle}>{step.title}</h3>
          {step.render(stepContext(setup))}
        </section>
      ))}
      {setup.error === null ? null : (
        <Note tone="problem">{setup.error}</Note>
      )}
      <SaveBar
        busy={setup.busy}
        labels={{ cancel: labels.cancel, save: labels.save, saving: labels.saving }}
        onCancel={onCancel ?? noop}
        onSave={setup.saveAll}
      />
    </div>
  );
}

function stepContext(setup: UnitSetup): SetupStepContext {
  return {
    values: setup.values,
    setValues: setup.setValues,
    busy: setup.busy,
    error: setup.error,
  };
}

function noop(): void {}
