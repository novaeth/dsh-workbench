import { Fragment, createElement as h, useState } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { marketBranchOk } from '@dsh-workbench/shared';
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import styles from './MarketPage.module.css';

export interface DiscoverInitDialogProps {
  readonly t: Translate;
  readonly open: boolean;
  readonly defaultBranch: string;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onConfirm: (branch: string) => void;
}

export function DiscoverInitDialog(props: DiscoverInitDialogProps) {
  const { t } = props;
  const [branch, setBranch] = useState(props.defaultBranch);
  const [bad, setBad] = useState(false);
  const confirm = (): void => {
    if (!marketBranchOk(branch)) {
      setBad(true);
      return;
    }
    props.onConfirm(branch.trim());
  };
  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={t('panels.discover.initTitle')}
      closeLabel={t('panels.discover.close')}
      description={t('panels.discover.initWhat', { branch: branch.trim() === '' ? props.defaultBranch : branch.trim() })}
      className={styles.discoverDialog}
      footer={
        <>
          <Button type="button" variant="outline" disabled={props.busy} onClick={props.onClose}>
            {t('panels.discover.confirmCancel')}
          </Button>
          <Button type="button" variant="primary" disabled={props.busy} onClick={confirm}>
            {props.busy ? t('panels.discover.initBusy') : t('panels.discover.initOk')}
          </Button>
        </>
      }
    >
      <div className={styles.discoverDialogBody}>
        <label className={styles.discoverField}>
          <span className={styles.discoverFieldLabel}>{t('panels.discover.initBranch')}</span>
          <Input
            value={branch}
            aria-invalid={bad}
            data-modal-autofocus
            onChange={(event) => {
              setBranch(event.currentTarget.value);
              setBad(false);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') confirm();
            }}
          />
        </label>
        <p className={styles.discoverMuted}>{t('panels.discover.initBranchHint')}</p>
        {bad ? (
          <p className={styles.discoverError} role="alert">
            {t('panels.discover.initBranchBad')}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
