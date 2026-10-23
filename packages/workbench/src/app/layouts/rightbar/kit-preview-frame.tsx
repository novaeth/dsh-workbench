import { createContext, createElement as h, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from '@dsh-workbench/shared';
import styles from './kit-preview.module.css';

import { Button, IconChevronRightOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { hashTargetsSection } from './kit-preview-hash';

interface KitNavEntry {
  readonly id: string;
  readonly title: string;
}

interface KitNavRegistry {
  readonly entries: readonly KitNavEntry[];
  readonly add: (entry: KitNavEntry) => void;
  readonly remove: (id: string) => void;
}

const KitNavContext = createContext<KitNavRegistry | null>(null);

function anchorOf(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return `kit-${slug}`;
}

export function KitNavProvider({ children }: { readonly children?: ReactNode }) {
  const [entries, setEntries] = useState<readonly KitNavEntry[]>([]);
  const add = useCallback((entry: KitNavEntry) => {
    setEntries((list) => (list.some((one) => one.id === entry.id) ? list : [...list, entry]));
  }, []);
  const remove = useCallback((id: string) => {
    setEntries((list) => list.filter((one) => one.id !== id));
  }, []);
  const registry = useMemo(() => ({ entries, add, remove }), [entries, add, remove]);
  return <KitNavContext.Provider value={registry}>{children}</KitNavContext.Provider>;
}

export function KitNav() {
  const registry = useContext(KitNavContext);
  const entries = registry?.entries ?? [];
  if (entries.length === 0) return null;
  return (
    <nav className={styles.nav} aria-label="这一卡里的各节">
      {entries.map((entry) => (
        <a key={entry.id} className={styles.navLink} href={`#${entry.id}`}>
          {entry.title}
        </a>
      ))}
    </nav>
  );
}

export function Section({
  title,
  note,
  children,
}: {
  readonly title: string;
  readonly note?: string;
  readonly children?: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const registry = useContext(KitNavContext);
  const anchor = anchorOf(title);
  const bodyId = `${anchor}-body`;
  const add = registry?.add;
  const remove = registry?.remove;
  useEffect(() => {
    if (add === undefined || remove === undefined) return undefined;
    add({ id: anchor, title });
    return () => remove(anchor);
  }, [add, remove, anchor, title]);
  useEffect(() => {
    const sync = (): void => {
      if (hashTargetsSection(anchor, window.location.hash)) setOpen(true);
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [anchor]);
  return (
    <section className={styles.section} id={anchor}>
      <div className={styles.heading}>
        <div className={styles.headingText}>
          <h3 className={styles.title}>{title}</h3>
          {note === undefined ? null : <p className={styles.note}>{note}</p>}
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={styles.toggle}
          aria-label={`${open ? '收起' : '展开'}：${title}`}
          aria-expanded={open}
          aria-controls={bodyId}
          icon={<IconChevronRightOutlineRegular size={14} />}
          onClick={() => setOpen((on) => !on)}
        />
      </div>
      <div className={styles.body} id={bodyId} hidden={!open}>
        {children}
      </div>
    </section>
  );
}

export function Grid({ children }: { readonly children?: ReactNode }) {
  return <div className={styles.cells}>{children}</div>;
}

export function Cell({
  label,
  wide,
  children,
}: {
  readonly label: string;
  readonly wide?: boolean;
  readonly children?: ReactNode;
}) {
  return (
    <div className={wide === true ? `${styles.cell} ${styles.span}` : styles.cell}>
      <span className={styles.cellLabel}>{label}</span>
      <div className={styles.example}>{children}</div>
    </div>
  );
}
