import { Fragment, createElement as h, useState } from 'react';
import type { Translate, WorkspaceView } from '@dsh-workbench/shared';
import styles from './WorkspaceAliasDialog.module.css';
import { Note, TextField } from '@dsh-workbench/shared';
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import {
  displayNameOf,
  nameTooLong,
  titleFor,
  WORKSPACE_NAME_INPUT_MAX,
  WORKSPACE_NAME_MAX,
} from './workspace-name';
import { useWorkspaceWrite } from './use-workspace-write';

export interface WorkspaceAliasDialogProps {
  readonly workspace: WorkspaceView;
  readonly t: Translate;
  readonly onClose: () => void;
  readonly onSubmit: (title: string) => Promise<boolean>;
}

export function WorkspaceAliasDialog({ workspace, t, onClose, onSubmit }: WorkspaceAliasDialogProps) {
  const [draft, setDraft] = useState(() => displayNameOf(workspace).name);
  const { busy, failed, submit } = useWorkspaceWrite(
    () => onSubmit(titleFor(workspace, draft)),
    onClose,
  );

  const dir = displayNameOf(workspace).dir;
  const tooLong = nameTooLong(draft);

  const save = (): void => {
    if (tooLong) return;
    submit();
  };

  return (
    <Modal
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      title={t('project.alias.title', { name: dir })}
      description={t('project.alias.description')}
      closeLabel={t('project.alias.cancel')}
      className={styles.dialog}
      footer={
        <>
          <Button type="button" variant="outline" size="md" disabled={busy} onClick={onClose}>
            {t('project.alias.cancel')}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="md"
            disabled={busy || tooLong}
            aria-busy={busy}
            onClick={save}
          >
            {t(busy ? 'project.alias.saving' : 'project.alias.save')}
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
          aria-label={t('project.alias.field')}
          aria-invalid={tooLong ? 'true' : undefined}
          placeholder={t('project.alias.placeholder')}
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
          <Note as="span">{t('project.alias.hint')}</Note>
          <Note as="span" tone={tooLong ? 'problem' : 'muted'}>
            {`${draft.trim().length}/${WORKSPACE_NAME_MAX}`}
          </Note>
        </div>
        {failed ? <Note tone="problem">{t('project.alias.failed')}</Note> : null}
      </div>
    </Modal>
  );
}
