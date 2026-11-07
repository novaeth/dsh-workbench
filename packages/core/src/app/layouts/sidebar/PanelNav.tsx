import { createElement as h, useState } from 'react';
import type { PanelEntry, ReactNode, RenderSlot, Translate } from '@dsh-workbench/shared';
import { StateDot, Tag } from '@deepseek-ai/dsh-client-ui-primitives';

import { panelRowName, usePanelHint } from '@/app/layouts/panel-hint';
import { cx } from '@dsh-workbench/shared';
import { isPanelShown, withPanelPinned } from './panel-pins';
import { PanelMoreMenu } from './PanelMoreMenu';

export interface PanelRowProps {
  id: string | null;
  label: string;
  active: boolean;
  wide: boolean;
  onSelect: (id: string | null) => void;
  fallbackGlyph?: ReactNode;
  renderEntry?: (id: string, active: boolean, wide: boolean) => ReactNode;
  t: Translate;
}

export function PanelRow({
  id,
  label,
  active,
  wide,
  onSelect,
  fallbackGlyph,
  renderEntry,
  t,
}: PanelRowProps) {
  const glyph =
    fallbackGlyph ?? (id !== null && renderEntry !== undefined ? renderEntry(id, active, wide) : null);
  const hint = usePanelHint(id);
  const name = panelRowName(label, hint, t);

  return (
    <button
      type="button"
      className={cx('wb-panelRow', active && 'wb-panelActive')}
      aria-current={active ? 'page' : undefined}
      aria-label={name}
      onClick={() => onSelect(id)}
    >
      <span className="wb-panelGlyph" aria-hidden="true">
        {glyph}
        {hint !== null && !wide ? (
          <span className="wb-panelDot">
            <StateDot state={hint.tone === 'danger' ? 'error' : 'warning'} size={9} />
          </span>
        ) : null}
      </span>
      {wide ? <span className="wb-panelTitle">{label}</span> : null}
      {hint === null || !wide ? null : (
        <Tag tone={hint.tone} className="wb-panelTag">
          {t(hint.labelKey)}
        </Tag>
      )}
    </button>
  );
}

function panelLabel(entry: PanelEntry): string {
  return typeof entry.label === 'function' ? entry.label() : entry.label;
}

export interface PanelListProps {
  entries: readonly PanelEntry[];
  hasActions: boolean;
  activePanelId: string | null;
  wide: boolean;
  onSelect: (id: string | null) => void;
  renderSlot: RenderSlot;
  t: Translate;
}

export function PanelList({
  entries,
  hasActions,
  activePanelId,
  wide,
  onSelect,
  renderSlot,
  t,
}: PanelListProps) {
  const [unpinned, setUnpinned] = useState<readonly string[]>([]);
  const shown = entries.filter((entry) => isPanelShown(entry.id, unpinned));
  const more = entries
    .filter((entry) => entry.id !== 'plugins')
    .map((entry) => ({
      id: entry.id,
      label: panelLabel(entry),
      pinned: !unpinned.includes(entry.id),
      active: activePanelId === entry.id,
    }));
  const setPinned = (panelId: string, pinned: boolean): void => {
    setUnpinned((current) => withPanelPinned(current, panelId, pinned));
  };

  return (
    <nav className="wb-panelList" aria-label={t('panels.label')}>
      {shown.map((entry) => (
        <PanelRow
          key={entry.id}
          id={entry.id}
          label={panelLabel(entry)}
          active={activePanelId === entry.id}
          wide={wide}
          onSelect={onSelect}
          t={t}
          renderEntry={(id, active, isWide) =>
            renderSlot('sidebar.panellist', { size: isWide ? 16 : 18, active }, { only: id })
          }
        />
      ))}
      {hasActions ? (
        <PanelMoreMenu
          wide={wide}
          label={t('panels.more')}
          entries={more}
          onOpen={onSelect}
          onPinnedChange={setPinned}
          renderActions={(owner) => renderSlot('sidebar.panellist.actions', { ...owner })}
        />
      ) : null}
    </nav>
  );
}
