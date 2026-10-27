import { createElement as h } from 'react';
import type { ReactNode } from '@dsh-workbench/shared';
import type { Translate } from '@dsh-workbench/shared';
import { StateDot, Tag } from '@deepseek-ai/dsh-client-ui-primitives';

import { panelRowName, usePanelHint } from '@/app/layouts/panel-hint';
import { cx } from '@dsh-workbench/shared';

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
