import { createElement as h, useState } from 'react';
import type { ReactNode } from '@dsh-workbench/shared';
import { IconAppsAddOutlineRegular, Menu, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import { cx } from '@dsh-workbench/shared';

import styles from './PanelMoreMenu.module.css';

export interface PanelMoreEntry {
  readonly id: string;
  readonly label: string;
  readonly pinned: boolean;
  readonly active: boolean;
}

export interface PanelMoreOwner {
  readonly entries: readonly PanelMoreEntry[];
  readonly onOpen: (panelId: string) => void;
  readonly onPinnedChange: (panelId: string, pinned: boolean) => void;
  readonly onDismiss: () => void;
}

export interface PanelMoreMenuProps {
  readonly wide: boolean;
  readonly label: string;
  readonly entries: readonly PanelMoreEntry[];
  readonly onOpen: (panelId: string) => void;
  readonly onPinnedChange: (panelId: string, pinned: boolean) => void;
  readonly renderActions: (owner: PanelMoreOwner) => ReactNode;
}

export function PanelMoreMenu({
  wide,
  label,
  entries,
  onOpen,
  onPinnedChange,
  renderActions,
}: PanelMoreMenuProps) {
  const [open, setOpen] = useState(false);
  const dismiss = (): void => setOpen(false);

  return (
    <Menu
      open={open}
      onClose={dismiss}
      portal
      autoFocus
      className={styles.anchor}
      listClassName={styles.menu}
      anchor={
        <Tooltip label={label} delayMs={500} disabled={wide}>
          <button
            type="button"
            className={cx('wb-panelRow', styles.more)}
            aria-label={label}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <span className="wb-panelGlyph" aria-hidden="true">
              <IconAppsAddOutlineRegular size={wide ? 16 : 18} />
            </span>
            {wide ? <span className="wb-panelTitle">{label}</span> : null}
          </button>
        </Tooltip>
      }
    >
      {renderActions({ entries, onOpen, onPinnedChange, onDismiss: dismiss })}
    </Menu>
  );
}
