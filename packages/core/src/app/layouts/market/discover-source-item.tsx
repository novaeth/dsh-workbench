import { createElement as h, useState } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { ConfirmBar } from '@dsh-workbench/shared';
import type { DiscoverSourceRow } from '@/kernel/contract/market-index';
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives';
import {
  Button,
  IconEllipsisOutlineRegular,
  IconTrashOutlineRegular,
  IconWarningOutlineRegular,
  Menu,
  StateDot,
  Tag,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { sourceStateOf } from './discover-view';
import styles from './MarketPage.module.css';

export interface DiscoverSourceItemProps {
  readonly t: Translate;
  readonly source: DiscoverSourceRow;
  readonly selected: boolean;
  readonly loading: boolean;
  readonly slow: boolean;
  readonly problem: string | null;
  readonly pending: boolean;
  readonly enable: boolean;
  readonly disable: boolean;
  readonly working: boolean;
  readonly onSelect: () => void;
  readonly onRemove: () => void;
  readonly onEnable: () => void;
  readonly onReadOnly: () => void;
}

function stateTextOf(source: DiscoverSourceRow, t: Translate): string {
  return sourceStateOf(source) === 'writable'
    ? t('panels.discover.sourceStateWritable')
    : t('panels.discover.sourceStateReadOnly');
}

export function DiscoverSourceItem(props: DiscoverSourceItemProps) {
  const { t, source } = props;
  const [menuOpen, setMenuOpen] = useState(false);
  const menu: MenuEntry[] = [];
  if (props.enable) menu.push({ id: 'enable', label: t('panels.discover.sourceEnable'), disabled: props.pending });
  if (props.disable) menu.push({ id: 'read-only', label: t('panels.discover.sourceDisable'), disabled: props.pending });
  if (menu.length > 0) menu.push({ type: 'separator', id: 'separator' });
  menu.push({
    id: 'remove',
    label: t('panels.discover.removeSource'),
    icon: <IconTrashOutlineRegular size={14} />,
    danger: true,
    disabled: props.pending,
  });
  const choose = (id: string): void => {
    setMenuOpen(false);
    if (id === 'enable') props.onEnable();
    else if (id === 'read-only') props.onReadOnly();
    else if (id === 'remove') props.onRemove();
  };
  return (
    <li className={styles.discoverSourceRow}>
      <label className={styles.discoverSourcePick}>
        <input
          type="radio"
          name="market-source"
          className={styles.discoverSourceRadio}
          checked={props.selected}
          disabled={props.pending}
          onChange={props.onSelect}
        />
        <span className={styles.discoverSourceMain}>
          <span className={styles.discoverSourceHead}>
            <span className={styles.discoverStrong}>{source.label}</span>
            <Tag tone={sourceStateOf(source) === 'writable' ? 'success' : 'neutral'}>{stateTextOf(source, t)}</Tag>
            {props.selected && props.loading ? (
              <span className={styles.discoverSourceLoading}>
                <StateDot state="ongoing" />
                {t('panels.discover.loading')}
              </span>
            ) : null}
            {props.working ? (
              <span className={styles.discoverSourceLoading}>
                <StateDot state="ongoing" />
                {t('panels.discover.sourceWorking')}
              </span>
            ) : null}
          </span>
          <span className={styles.discoverSourceUrl} title={source.url}>
            {source.url}
          </span>
          {props.problem === null ? null : <span className={styles.discoverSourceError}>{props.problem}</span>}
        </span>
      </label>
      <Menu
        className={styles.discoverSourceMore}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        align="end"
        portal
        autoFocus
        items={menu}
        onSelect={choose}
        anchor={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={<IconEllipsisOutlineRegular size={14} />}
            aria-label={t('panels.discover.sourceActions', { label: source.label })}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            disabled={props.pending}
            onClick={() => setMenuOpen(!menuOpen)}
          />
        }
      />
      {props.selected && props.loading && props.slow ? (
        <span className={styles.discoverSourceHint} role="note">
          <IconWarningOutlineRegular size={12} aria-hidden="true" />
          {t('panels.discover.slowHint')}
        </span>
      ) : null}
    </li>
  );
}

export interface DiscoverSourceConfirmProps {
  readonly t: Translate;
  readonly label: string;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

export function DiscoverSourceConfirm(props: DiscoverSourceConfirmProps) {
  const { t } = props;
  return (
    <li className={styles.discoverSourceConfirm}>
      <ConfirmBar
        title={t('panels.discover.removeTitle')}
        hint={t('panels.discover.removeBody', { label: props.label })}
        actions={[
          { key: 'cancel', label: t('panels.discover.cancel'), onClick: props.onCancel },
          { key: 'remove', label: t('panels.discover.removeSource'), kind: 'danger', onClick: props.onConfirm },
        ]}
      />
    </li>
  );
}
