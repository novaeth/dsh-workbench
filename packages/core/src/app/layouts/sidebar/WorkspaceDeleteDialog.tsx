import { Fragment, createElement as h } from 'react';
import type { Translate, WorkspaceView } from '@dsh-workbench/shared';
import styles from './WorkspaceDeleteDialog.module.css';
import { Note } from '@dsh-workbench/shared';
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { displayNameOf } from './workspace-name';
import { useWorkspaceWrite } from './use-workspace-write';

export interface WorkspaceDeleteDialogProps {
  readonly workspace: WorkspaceView;
  readonly t: Translate;
  readonly onClose: () => void;
  readonly onConfirm: () => Promise<boolean>;
}

export function WorkspaceDeleteDialog({ workspace, t, onClose, onConfirm }: WorkspaceDeleteDialogProps) {
  const { busy, failed, submit } = useWorkspaceWrite(onConfirm, onClose);

  const dir = displayNameOf(workspace).dir;

  return (
    <Modal
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      title={t('project.delete.title', { name: dir })}
      description={t('project.delete.description')}
      closeLabel={t('project.delete.cancel')}
      className={styles.dialog}
      footer={
        <>
          <Button type="button" variant="outline" size="md" disabled={busy} onClick={onClose}>
            {t('project.delete.cancel')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="md"
            className="wb-dangerAction"
            disabled={busy}
            aria-busy={busy}
            onClick={submit}
          >
            {t(busy ? 'project.delete.pending' : 'project.delete.confirm')}
          </Button>
        </>
      }
    >
      {failed ? <Note tone="problem">{t('project.delete.failed')}</Note> : null}
    </Modal>
  );
}
