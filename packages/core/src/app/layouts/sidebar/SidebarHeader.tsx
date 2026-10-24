import { createElement as h } from 'react';
import type { RenderSlot, Translate } from '@dsh-workbench/shared';

import { IconBrandMark } from '@dsh-workbench/shared';
import { IconPanelLeftOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { Tip } from '@/shared/components/Tip';
import type { WorkspaceAttention } from '@/modules/sessions';

export interface SidebarHeaderProps {
  readonly collapsed: boolean;
  readonly wide: boolean;
  readonly attention: WorkspaceAttention | null;
  readonly t: Translate;
  readonly renderSlot: RenderSlot;
  readonly onToggle: () => void;
  readonly onSelectPanel: (panelId: string | null) => void;
}

export function SidebarHeader(props: SidebarHeaderProps) {
  const { collapsed, wide, attention, t, renderSlot } = props;

  return (
    <div className="wb-logoRow">
      {wide ? (
        <Tip label={t('panel.conversation')}>
        <button
          type="button"
          className="wb-brand"
          onClick={() => props.onSelectPanel(null)}
        >
          <span className="wb-brandIdentity">
            <span className="wb-brandMark">
              {renderSlot('sidebar.brand.mark', { size: 24 }, { fallback: <IconBrandMark size={24} /> })}
            </span>
            <span className="wb-brandName">
              {renderSlot('sidebar.brand.name', {}, { fallback: t('brand.name') })}
            </span>
          </span>
        </button>
        </Tip>
      ) : null}

      <button
        type="button"
        className="wb-iconButton wb-toggle"
        aria-label={t(collapsed ? 'toggle.open' : 'toggle.collapse')}
        onClick={props.onToggle}
      >
        {!wide ? (
          <span className="wb-railMark" aria-hidden="true">
            {renderSlot('sidebar.brand.mark', { size: 24 }, { fallback: <IconBrandMark size={24} /> })}
          </span>
        ) : null}
        <span className="wb-panelIcon">
          <IconPanelLeftOutlineRegular size={wide ? 16 : 18} />
        </span>
        {!wide ? renderSlot('sidebar.toggle.badge', { attention }) : null}
      </button>
    </div>
  );
}
