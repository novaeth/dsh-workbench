import { createElement as h } from 'react';
import type { SelectFieldOption, Translate, WorkspaceView } from '@dsh-workbench/shared';
import type { WorkspaceAttention } from '@/modules/sessions';

import { IconFolderOpenRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import type { WorkspaceSectionPlan } from './workspace-groups';
import { WorkspaceRowAction } from './WorkspaceRowAction';
import { WorkspaceRowLabel } from './WorkspaceRowLabel';
import { WorkspaceAttentionDot } from './WorkspaceAttentionDot';

export interface WorkspaceItemsOptions {
  readonly sections: readonly WorkspaceSectionPlan<WorkspaceView>[];
  readonly currentId: string | null;
  readonly hoverId: string | null;
  readonly t: Translate;
  readonly attention: ReadonlyMap<string, WorkspaceAttention>;
  readonly onHover: (workspaceId: string | null) => void;
  readonly onEdit: (workspace: WorkspaceView) => void;
}

export function workspaceOptions(options: WorkspaceItemsOptions): SelectFieldOption[] {
  const { sections, currentId, hoverId, t, attention, onHover, onEdit } = options;
  const rowOf = (workspace: WorkspaceView, group: string | undefined): SelectFieldOption => {
    const own = attention.get(workspace.workspaceId) ?? null;
    return {
      value: workspace.workspaceId,
      group,
      icon: own === null ? <IconFolderOpenRegular size={16} /> : <WorkspaceAttentionDot attention={own} t={t} />,
      label: (
        <WorkspaceRowLabel
          workspace={workspace}
          current={workspace.workspaceId === currentId}
          onHover={(hovering) => onHover(hovering ? workspace.workspaceId : null)}
          action={
            hoverId === workspace.workspaceId ? (
              <WorkspaceRowAction workspace={workspace} t={t} onEdit={() => onEdit(workspace)} />
            ) : undefined
          }
        />
      ),
    };
  };
  return sections.flatMap((section) =>
    section.items.map((workspace) => rowOf(workspace, section.heading ?? undefined)),
  );
}
