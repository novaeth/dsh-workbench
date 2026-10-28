import { Fragment, createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { Spinner } from '@dsh-workbench/shared';
import { runtimeTermsOf } from '@/shared/hooks/runtime-terms';
import styles from './AddModule.module.css';

import {
  Button,
  Modal,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { devSurface } from '@/shared/dev-surface';
import { AddModuleForm } from './AddModuleForm';
import { SafetyNote } from './SafetyNote';
import { AddModulePending, AddModulePreview, AddModuleResult } from './AddModuleStages';
import type { AddModuleMock } from './add-module-mock';
import { useAddModule, type AddModuleState } from './use-add-module';

export interface AddModuleDialogProps {
  readonly t: Translate;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onInstalled: () => void;
}

export function AddModuleDialog({ t, open, onClose, onInstalled }: AddModuleDialogProps) {
  if (!open) return null;
  return <AddModuleContent t={t} onClose={onClose} onInstalled={onInstalled} />;
}

function AddModuleContent({ t, onClose, onInstalled }: Omit<AddModuleDialogProps, 'open'>) {
  const real = useAddModule({ onInstalled, failedText: t('panels.failed') });
  const devAdd = devSurface.useStrips<AddModuleMock>('addModule', []);
  const mock = devAdd.current;
  const state = mock === undefined ? real : (devSurface.addModuleState(real, mock) as AddModuleState);

  const installing = state.phase === 'installing';
  const checking = state.phase === 'inspecting';
  const empty = state.spec.trim() === '';
  const failed = state.outcome?.change.application === 'failed';
  const builds = state.builds;
  const notModule = state.outcome?.supply.state === 'not-a-module';

  const footer = (
    <>
      {state.phase === 'idle' ? (
        <div className={styles.footer}>
          <SafetyNote t={t} />
          <Button
            type="button"
            variant="primary"
            size="md"
            className={styles.wide}
            disabled={empty || checking}
            aria-busy={checking}
            onClick={state.check}
          >
            {checking ? <Spinner size={12} /> : null}
            {t(checking ? 'panels.market.add.checking' : 'panels.market.add.run')}
          </Button>
        </div>
      ) : null}

      {state.phase === 'preview' ? (
        <>
          <Button type="button" variant="outline" size="md" onClick={state.edit}>
            {t('panels.market.add.edit')}
          </Button>
          <Button type="button" variant="primary" size="md" onClick={() => state.install()}>
            {t('panels.market.add.run')}
          </Button>
        </>
      ) : null}

      {installing ? (
        <Button type="button" variant="outline" size="md" onClick={state.cancelInstall}>
          {t('panels.market.add.cancel')}
        </Button>
      ) : null}

      {state.phase === 'result' ? (
        <>
          {failed && builds.length === 0 ? (
            <Button type="button" variant="outline" size="md" onClick={state.edit}>
              {t('panels.market.add.changeRegistry')}
            </Button>
          ) : null}
          {notModule ? (
            <Button
              type="button"
              variant="outline"
              size="md"
              className="wb-dangerAction"
              disabled={state.removing}
              aria-busy={state.removing}
              onClick={state.removeIt}
            >
              {state.removing ? <Spinner size={12} /> : null}
              {t(state.removing ? 'panels.market.uninstalling' : 'panels.market.add.remove')}
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="md" onClick={onClose}>
            {t('panels.market.add.close')}
          </Button>
          {builds.length === 0 ? null : (
            <Button type="button" variant="primary" size="md" onClick={() => state.install(builds)}>
              {t('panels.market.add.approveRun')}
            </Button>
          )}
          {failed && builds.length === 0 ? (
            <Button type="button" variant="primary" size="md" onClick={() => state.install()}>
              {t('panels.market.add.retry')}
            </Button>
          ) : null}
        </>
      ) : null}
    </>
  );

  return (
    <Modal
      open
      onClose={() => {
        if (!installing) onClose();
      }}
      title={t('panels.market.add.title')}
      description={t('panels.market.add.description', runtimeTermsOf(t))}
      closeLabel={t('panels.market.add.close')}
      className={styles.dialog}
      contentClassName={styles.content}
      footer={footer}
    >
      <div className={styles.stack}>
        {devAdd.strip}

        {state.phase === 'idle' ? <AddModuleForm t={t} state={state} /> : null}
        {state.phase === 'inspecting' ? <AddModulePending t={t} kind="inspecting" /> : null}
        {state.phase === 'preview' ? <AddModulePreview t={t} state={state} /> : null}
        {state.phase === 'installing' ? <AddModulePending t={t} kind="installing" /> : null}
        {state.phase === 'result' ? <AddModuleResult t={t} state={state} /> : null}

      </div>
    </Modal>
  );
}
