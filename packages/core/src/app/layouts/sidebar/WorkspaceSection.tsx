import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { Tip } from '@/shared/components/Tip';

import { IconNewChatOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';

export interface WorkspaceSectionProps {
  readonly t: Translate;
  readonly wide: boolean;
  readonly onNewSession: () => void;
}

export function WorkspaceSection({ t, wide, onNewSession }: WorkspaceSectionProps) {
  return (
    <div className="wb-wsSection">
      <div className="wb-sectionHeader">
        {wide ? <span className="wb-sectionLabel">{t('workspace.section')}</span> : null}
        <Tip label={t('session.new.label')}>
        <button
          type="button"
          className="wb-iconButton wb-wsNew"
          aria-label={t('session.new')}
          onClick={onNewSession}
        >
          <IconNewChatOutlineRegular size={16} />
        </button>
        </Tip>
      </div>
    </div>
  );
}
