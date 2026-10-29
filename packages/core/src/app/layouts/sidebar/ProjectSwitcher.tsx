import { Fragment, createElement as h, useMemo, useState } from 'react';
import type { ReactNode, SelectFieldOption, Translate, WorkspaceView } from '@dsh-workbench/shared';
import { attentionListRank, type Attention } from '@/modules/sessions';
import styles from './ProjectSwitcher.module.css';
import { SelectField, cx } from '@dsh-workbench/shared';
import {
  IconFolderCloseRegular,
  IconPlusOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { Tip } from '@/shared/components/Tip';
import { WorkspaceAttentionDot } from './WorkspaceAttentionDot';
import { WorkspaceAttentionTag } from './WorkspaceAttentionTag';
import { WorkspaceRenameDialog } from './WorkspaceRenameDialog';
import { displayNameOf, matchWorkspaces } from './workspace-name';
import { workspaceSections } from './workspace-groups';
import { workspaceOptions } from './workspace-items';

export interface ProjectSwitcherProps {
  items: readonly WorkspaceView[];
  current: WorkspaceView | null;
  attention: Attention;
  compact?: boolean;
  onPick: (workspaceId: string) => void;
  onAdd: () => void;
  onRename: (workspaceId: string, title: string) => Promise<boolean>;
  t: Translate;
}

export function ProjectSwitcher({ items, current, attention, compact = false, onPick, onAdd, onRename, t }: ProjectSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [naming, setNaming] = useState<WorkspaceView | null>(null);

  const currentId = current?.workspaceId ?? '';
  const byId = useMemo(() => new Map(items.map((workspace) => [workspace.workspaceId, workspace])), [items]);
  const sections = useMemo(
    () =>
      workspaceSections(
        items,
        {
          workspaces: t('project.group.workspaces'),
          defaultWorkspace: t('project.group.defaultWorkspace'),
          workshop: t('project.group.workshop'),
        },
        {
          rankOf: (workspace) => {
            const own = attention.byWorkspace.get(workspace.workspaceId);
            return own === undefined ? null : attentionListRank(own);
          },
        },
      ),
    [items, attention.byWorkspace, t],
  );
  const options = useMemo(
    () =>
      workspaceOptions({
        sections,
        currentId,
        hoverId,
        t,
        attention: attention.byWorkspace,
        onHover: setHoverId,
        onEdit: (workspace) => {
          setOpen(false);
          setNaming(workspace);
        },
      }),
    [sections, currentId, hoverId, t, attention.byWorkspace],
  );
  const valueNodes = useMemo(() => {
    const out = new Map<string, ReactNode>();
    for (const workspace of items) {
      const { dir, name } = displayNameOf(workspace);
      out.set(
        workspace.workspaceId,
        <span className={styles.triggerName}>
          <span className={styles.dir}>{dir}</span>
          {name === '' ? null : <span className={styles.name}>{name}</span>}
        </span>,
      );
    }
    return out;
  }, [items]);

  return (
    <div className={cx(styles.root, compact && styles.rail)}>
      <SelectField
        value={currentId}
        options={options}
        onChange={onPick}
        open={open}
        onOpenChange={setOpen}
        icon={
          <Tip label={current?.path ?? ''} disabled={current === null}>
            <span className={styles.glyphBox}>
              <span className={cx(styles.glyph, styles.glyphActive)}>
                <IconFolderCloseRegular size={16} />
                {compact ? (
                  <WorkspaceAttentionDot attention={attention.overall} t={t} variant="overlay" tip />
                ) : null}
              </span>
            </span>
          </Tip>
        }
        renderValue={
          compact
            ? undefined
            : (option: SelectFieldOption | undefined) => (
                <Fragment>
                  {option === undefined ? t('project.none') : (valueNodes.get(option.value) ?? option.label)}
                  <WorkspaceAttentionTag attention={attention.elsewhere} t={t} />
                </Fragment>
              )
        }
        placeholder={t('project.none')}
        variant="ghost"
        iconOnly={compact}
        search={!compact}
        ariaLabel={t('project.label')}
        searchLabel={t('project.search.label')}
        searchPlaceholder={t('project.search.placeholder')}
        emptyText={(query) => t('project.search.empty', { query: query.trim() })}
        filter={(option, query) => {
          const workspace = byId.get(option.value);
          return workspace !== undefined && matchWorkspaces([workspace], query).length > 0;
        }}
        footer={{ label: t('project.add'), icon: <IconPlusOutlineRegular size={14} /> }}
        onFooter={onAdd}
      />
      {naming === null ? null : (
        <WorkspaceRenameDialog
          key={naming.workspaceId}
          workspace={naming}
          t={t}
          onClose={() => setNaming(null)}
          onSubmit={(title) => onRename(naming.workspaceId, title)}
        />
      )}
    </div>
  );
}
