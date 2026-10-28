import { Fragment, createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { Spinner } from '@dsh-workbench/shared';
import { runtimeTermsOf } from '@/shared/hooks/runtime-terms';
import styles from './AddModule.module.css';

import {
  IconCheckCircleFillRegular,
  IconWarningOutlineRegular,
  StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives';

import { failureCode, failureReason, restartWhy, resultKindOf, supplyKey } from './add-module-text';
import type { AddModuleState } from './use-add-module';

const SUPPLY_TONES: Readonly<Record<string, string>> = {
  'pending-restart': `${styles.note} ${styles.noteWarn}`,
  'not-a-module': `${styles.note} ${styles.noteWarn}`,
  failed: `${styles.note} ${styles.noteError}`,
};

function supplyTone(state: string): string {
  return SUPPLY_TONES[state] ?? styles.note;
}

export function AddModulePending({ t, kind }: { t: Translate; kind: 'inspecting' | 'installing' }) {
  return (
    <div className={styles.body}>
      <div className={styles.hero}>
        <span className={styles.heroIcon} data-state="ongoing" aria-hidden="true">
          <Spinner size={28} />
        </span>
        <h2 className={styles.pendingTitle} role="status">
          {kind === 'inspecting' ? t('panels.market.add.classifying') : t('panels.market.add.installingTitle')}
        </h2>
      </div>
    </div>
  );
}

export function AddModulePreview({ t, state }: { t: Translate; state: AddModuleState }) {
  const preview = state.preview;
  if (preview === null) return null;
  const source = preview.registry === '' ? t('panels.market.add.registryDefault') : preview.registry;
  const plugin = preview.kind === 'plugin';
  const pluginName = plugin ? preview.pluginName : undefined;

  return (
    <div className={styles.body}>
      <div className={styles.subject}>
        <p className={styles.subjectName}>{preview.name}</p>
        {preview.version === '' ? null : (
          <p className={styles.subjectMeta}>
            {t('panels.market.add.installVersion', { version: preview.version })}
          </p>
        )}
        {pluginName === undefined || pluginName === preview.name ? null : (
          <p className={styles.subjectMeta}>{t('panels.market.add.pluginAlias', { name: pluginName })}</p>
        )}
        {preview.description === '' ? null : <p className={styles.subjectDesc}>{preview.description}</p>}
        <p className={styles.subjectMeta}>{source}</p>
      </div>
      {plugin ? <p className={styles.result}>{t('panels.market.add.pluginPreview', runtimeTermsOf(t))}</p> : null}
    </div>
  );
}

export function AddModuleResult({ t, state }: { t: Translate; state: AddModuleState }) {
  const outcome = state.outcome;
  if (outcome === null) return null;
  const reason = failureReason(failureCode(outcome.change), outcome.change.application, t);
  const supply = supplyKey(outcome.supply.state);
  const builds = state.builds;
  const plugin = outcome.plugin;
  const kind = resultKindOf({
    change: outcome.change,
    supplyState: outcome.supply.state,
    plugin: plugin !== undefined,
  });
  const name = outcome.module.kind === 'module' ? outcome.module.unit : outcome.module.pkg;
  const why = restartWhy(outcome.change, t);

  return (
    <div className={styles.body}>
      <div className={styles.hero}>
        <span
          className={styles.heroIcon}
          data-state={kind === 'failed' ? 'error' : kind === 'cancelled' ? 'idle' : 'done'}
          aria-hidden="true"
        >
          {kind === 'failed' ? (
            <IconWarningOutlineRegular size={28} />
          ) : kind === 'cancelled' ? (
            <StateDot state="idle" size={28} />
          ) : (
            <IconCheckCircleFillRegular size={28} />
          )}
        </span>
        <h2 className={styles.wizardTitle} role={kind === 'failed' ? 'alert' : 'status'}>
          {kind === 'failed'
            ? t('panels.market.add.failedTitle')
            : kind === 'cancelled'
              ? t('panels.market.add.cancelledTitle')
              : t('panels.market.add.installedTitle')}
        </h2>
      </div>

      <div className={styles.subject}>
        <p className={styles.subjectName}>{outcome.module.pkg}</p>
        {name === outcome.module.pkg ? null : <p className={styles.subjectMeta}>{name}</p>}
        {outcome.module.version === undefined ? null : (
          <p className={styles.subjectMeta}>
            {t('panels.market.add.installVersion', { version: outcome.module.version })}
          </p>
        )}
      </div>

      {kind === 'plugin' && plugin !== undefined ? (
        <p className={styles.result}>{t('panels.market.add.installedPlugin', { ...runtimeTermsOf(t), name: plugin.name ?? plugin.pkg })}</p>
      ) : kind === 'failed' ? (
        <p className={styles.resultWarn} role="alert">
          {t('panels.market.add.failed', { reason })}
        </p>
      ) : kind === 'restart' ? (
        <Fragment>
          <p className={styles.resultWarn}>{t('panels.market.add.doneRestart')}</p>
          {why === undefined ? null : <p className={styles.resultMeta}>{why}</p>}
        </Fragment>
      ) : kind === 'quiet' ? null : (
        <p className={styles.result}>{t('panels.market.add.tookEffect')}</p>
      )}

      {builds.length === 0 ? null : (
        <div className={styles.approval}>
          <p className={styles.approvalTitle}>{t('panels.market.add.approveTitle')}</p>
          <p className={styles.approvalText}>
            {t('panels.market.add.approveHint', { packages: builds.join('、') })}
          </p>
          <p className={styles.approvalCaution}>{t('panels.market.add.approveCaution')}</p>
        </div>
      )}

      {supply === undefined ||
      (outcome.supply.state !== 'failed' && (kind === 'failed' || kind === 'cancelled')) ? null : (
        <p className={supplyTone(outcome.supply.state)}>{t(supply, { reason: outcome.supply.reason ?? '' })}</p>
      )}
      {state.failure === null ? null : <p className={styles.problem}>{state.failure}</p>}
      {outcome.change.errorDetail === undefined ? null : (
        <Fragment>
          <p className={styles.detailLabel}>{t('panels.market.add.details')}</p>
          <p className={styles.detail}>{outcome.change.errorDetail}</p>
        </Fragment>
      )}
    </div>
  );
}
