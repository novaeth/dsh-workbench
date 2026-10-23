import { Fragment, createElement as h, useState } from 'react';
import type { Translate, WorkspaceView } from '@dsh-workbench/shared';
import styles from './WorkspaceRenameDialog.module.css';
import { Note, TextField } from '@dsh-workbench/shared';
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import {
  displayNameOf,
  nameTooLong,
  titleFor,
  WORKSPACE_NAME_INPUT_MAX,
  WORKSPACE_NAME_MAX,
} from './workspace-name';

export interface WorkspaceRenameDialogProps {
  readonly workspace: WorkspaceView;
  readonly t: Translate;
  readonly onClose: () => void;
  readonly onSubmit: (title: string) => Promise<boolean>;
}

export function WorkspaceRenameDialog({ workspace, t, onClose, onSubmit }: WorkspaceRenameDialogProps) {
  const [draft, setDraft] = useState(() => displayNameOf(workspace).name);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const dir = displayNameOf(workspace).dir;
  const tooLong = nameTooLong(draft);

  const save = (): void => {
    if (busy || tooLong) return;
    setBusy(true);
    setFailed(false);
    void onSubmit(titleFor(workspace, draft)).then((ok) => {
      setBusy(false);
      if (ok) onClose();
      else setFailed(true);
    });
  };

  return (
    <Modal
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      title={t('project.rename.title', { name: dir })}
      description={t('project.rename.description')}
      closeLabel={t('project.rename.cancel')}
      className={styles.dialog}
      footer={
        <>
          <Button type="button" variant="outline" size="md" disabled={busy} onClick={onClose}>
            {t('project.rename.cancel')}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="md"
            disabled={busy || tooLong}
            aria-busy={busy}
            onClick={save}
          >
            {t(busy ? 'project.rename.saving' : 'project.rename.save')}
          </Button>
        </>
      }
    >
      <div className={styles.stack}>
        <TextField
          className={styles.input}
          data-modal-autofocus=""
          id="wb-workspace-name"
          name="wb-workspace-name"
          aria-label={t('project.rename.field')}
          aria-invalid={tooLong ? 'true' : undefined}
          placeholder={t('project.rename.placeholder')}
          maxLength={WORKSPACE_NAME_INPUT_MAX}
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
            event.preventDefault();
            save();
          }}
        />
        <div className={styles.meta}>
          <Note as="span">{t('project.rename.hint')}</Note>
          <Note as="span" tone={tooLong ? 'problem' : 'muted'}>
            {`${draft.trim().length}/${WORKSPACE_NAME_MAX}`}
          </Note>
        </div>
        {failed ? <Note tone="problem">{t('project.rename.failed')}</Note> : null}
      </div>
    </Modal>
  );
}
