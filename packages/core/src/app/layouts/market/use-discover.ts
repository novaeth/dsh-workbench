import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { marketInstallTarget } from '@dsh-workbench/shared';
import type {
  DiscoverEntry,
  DiscoverPayload,
  DiscoverSourceRow,
  DiscoverVersionRow,
  MarketSourceConfig,
} from '@/kernel/contract/market-index';
import { useHostWrite } from '@/shared/hooks/use-host-write';
import { readMarketDiscover, readMarketSources } from '@/shared/hooks/market-queries';
import { CAPABILITY_FACT } from '@/shared/hooks/use-capabilities';
import { subscribeFactRevision } from '@/shared/hooks/use-facts';
import { changeFailure, changeOf } from '../rightbar/market-change';
import {
  DISCOVER_PAGE_SIZE,
  filterEntries,
  sortEntries,
  sourceFromUrl,
  visibleEntries,
  type DiscoverSort,
} from './discover-view';

interface InstallTarget {
  readonly entry: DiscoverEntry;
  readonly version: DiscoverVersionRow;
}

function localeNow(): string {
  if (typeof document === 'undefined') return 'zh';
  return document.documentElement.lang || navigator.language || 'zh';
}

const SHIPPED: readonly string[] = ['applied', 'restart-required', 'overridden'];

interface KnownSources {
  readonly sources: readonly DiscoverSourceRow[];
  readonly selected: string | null;
}

function sourceRowsOf(sources: readonly MarketSourceConfig[]): readonly DiscoverSourceRow[] {
  return sources.map((source) => ({
    ...source,
    writable: source.kind === 'http' ? false : null,
  }));
}

export type InstallVerdict =
  | { readonly kind: 'done' }
  | { readonly kind: 'failed'; readonly text: string }
  | { readonly kind: 'quiet' };

export function installVerdictOf(value: unknown, t: Translate): InstallVerdict {
  const change = changeOf(value);
  if (change === undefined) return { kind: 'quiet' };
  if (SHIPPED.includes(change.application)) return { kind: 'done' };
  if (change.application !== 'failed') return { kind: 'quiet' };
  const reason = changeFailure(change, t) ?? t('panels.market.add.reason.unknown');
  return { kind: 'failed', text: t('panels.discover.failed', { reason }) };
}

export interface DiscoverController {
  readonly t: Translate;
  readonly locale: string;
  readonly payload: DiscoverPayload | null;
  readonly loading: boolean;
  readonly slow: boolean;
  readonly failure: string | null;
  readonly sources: DiscoverPayload['sources'];
  readonly selected: string | null;
  readonly entries: readonly DiscoverEntry[];
  readonly shown: readonly DiscoverEntry[];
  readonly total: number;
  readonly categories: readonly string[];
  readonly labels: readonly string[];
  readonly query: string;
  readonly category: string | null;
  readonly selectedLabels: readonly string[];
  readonly sort: DiscoverSort;
  readonly detailEntry: DiscoverEntry | null;
  readonly choice: InstallTarget | null;
  readonly notice: string | null;
  readonly writeFailed: string | null;
  readonly provisionFailed: string | null;
  readonly busy: boolean;
  readonly addingSource: boolean;
  readonly manageOpen: boolean;
  readonly problem: { readonly id: string; readonly detail: string } | null;
  readonly uninitialized: { readonly path: string; readonly empty: boolean } | null;
  readonly defaultBranch: string;
  readonly initOpen: boolean;
  readonly reload: () => void;
  readonly setQuery: (value: string) => void;
  readonly setCategory: (value: string | null) => void;
  readonly toggleLabel: (label: string) => void;
  readonly clearLabels: () => void;
  readonly setSort: (sort: DiscoverSort) => void;
  readonly showMore: () => void;
  readonly openDetail: (name: string) => void;
  readonly closeDetail: () => void;
  readonly setDetailEntry: (name: string | null) => void;
  readonly setChoice: (value: InstallTarget | null) => void;
  readonly setManageOpen: (open: boolean) => void;
  readonly setInitOpen: (open: boolean) => void;
  readonly initialize: (branch: string) => void;
  readonly addSource: (url: string) => void;
  readonly removeSourceById: (id: string) => void;
  readonly selectSource: (id: string) => void;
  readonly install: () => void;
}

export function useDiscover(t: Translate, active: boolean, onInstalled: () => void): DiscoverController {
  const [payload, setPayload] = useState<DiscoverPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [slow, setSlow] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [selectedLabels, setSelectedLabels] = useState<readonly string[]>([]);
  const [sort, setSort] = useState<DiscoverSort>('default');
  const [limit, setLimit] = useState(DISCOVER_PAGE_SIZE);
  const [detail, setDetail] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [initOpen, setInitOpen] = useState(false);
  const [choice, setChoice] = useState<InstallTarget | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [addingSource, setAddingSource] = useState(false);
  const [knownSources, setKnownSources] = useState<KnownSources | null>(null);
  const loaded = useRef(false);
  const loadTicket = useRef(0);
  const sourceTicket = useRef(0);
  const locale = useMemo(() => localeNow(), []);

  const sources = useHostWrite({
    channel: 'actions',
    resource: 'market-sources',
    networkText: t('panels.discover.failed'),
  });
  const provision = useHostWrite({ channel: 'provision', networkText: t('panels.discover.failed') });

  const loadSources = useCallback(async (): Promise<void> => {
    const ticket = sourceTicket.current + 1;
    sourceTicket.current = ticket;
    const response = await readMarketSources().catch(() => null);
    if (sourceTicket.current !== ticket) return;
    if (response === null || !response.ok) return;
    setKnownSources({ sources: sourceRowsOf(response.sources), selected: response.selected });
  }, []);

  const load = useCallback(
    async (force = false): Promise<void> => {
      const ticket = loadTicket.current + 1;
      loadTicket.current = ticket;
      setLoading(true);
      setSlow(false);
      setFailure(null);
      const response = await readMarketDiscover({ force }).catch(() => null);
      if (loadTicket.current !== ticket) return;
      setLoading(false);
      setSlow(false);
      if (response === null || !response.ok) {
        setFailure(t('panels.discover.unreadable'));
        return;
      }
      setPayload(response);
      setLimit(DISCOVER_PAGE_SIZE);
    },
    [t],
  );

  const beginSwitch = (): void => {
    loadTicket.current += 1;
    sourceTicket.current += 1;
    setFailure(null);
    setPayload(null);
    setLoading(true);
    setSlow(false);
  };

  useEffect(() => {
    if (!active || loaded.current) return;
    loaded.current = true;
    void loadSources();
    void load();
  }, [active, load, loadSources]);

  useEffect(() => {
    if (!loading) return undefined;
    const timer = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(timer);
  }, [loading]);

  useEffect(
    () =>
      subscribeFactRevision(CAPABILITY_FACT, () => {
        if (!loaded.current) return;
        void load(true);
      }),
    [load],
  );

  const entries = useMemo(() => payload?.entries ?? [], [payload]);
  const categories = useMemo(
    () => [...new Set(entries.flatMap((entry) => (entry.category === undefined ? [] : [entry.category])))],
    [entries],
  );
  const labels = useMemo(() => [...new Set(entries.flatMap((entry) => entry.labels))].sort(), [entries]);
  const filtered = useMemo(
    () => filterEntries(entries, { query, category, labels: selectedLabels }, locale),
    [entries, query, category, selectedLabels, locale],
  );
  const sorted = useMemo(() => sortEntries(filtered, sort), [filtered, sort]);
  const shown = useMemo(() => visibleEntries(sorted, limit), [sorted, limit]);
  const detailEntry = useMemo(() => entries.find((entry) => entry.name === detail) ?? null, [entries, detail]);
  const problem = useMemo(() => {
    if (payload?.problem === undefined || payload.selected === null) return null;
    return { id: payload.selected, detail: payload.problem.detail ?? '' };
  }, [payload]);

  const selectedSource = useMemo(
    () =>
      payload === null || payload.selected === null
        ? undefined
        : payload.sources.find((source) => source.id === payload.selected),
    [payload],
  );

  const uninitialized = useMemo(() => {
    const kind = payload?.problem?.kind;
    if (selectedSource === undefined || selectedSource.kind !== 'git') return null;
    if (kind !== 'git-empty' && kind !== 'git-missing-index') return null;
    return { path: selectedSource.path ?? 'market.json', empty: kind === 'git-empty' };
  }, [payload, selectedSource]);

  const defaultBranch = payload?.problem?.branch ?? selectedSource?.ref ?? 'main';

  const initialize = (branch: string): void => {
    if (payload === null || payload.selected === null) return;
    const id = payload.selected;
    setNotice(null);
    void sources.send({ action: 'init', id, ref: branch }).then(async (outcome) => {
      if (!outcome.ok) return;
      const value =
        typeof outcome.value === 'object' && outcome.value !== null
          ? (outcome.value as Readonly<Record<string, unknown>>)
          : undefined;
      const done = typeof value?.['branch'] === 'string' ? value['branch'] : branch;
      setInitOpen(false);
      setNotice(t('panels.discover.initDone', { branch: done }));
      beginSwitch();
      await loadSources();
      await load(true);
    });
  };

  const addSource = (url: string): void => {
    const parsed = sourceFromUrl(url);
    if (!parsed.ok) return;
    setNotice(null);
    setInitOpen(false);
    const id = `source-${globalThis.crypto.randomUUID()}`;
    setAddingSource(true);
    void sources
      .send({ action: 'save', source: { ...parsed.source, id }, select: true })
      .then((outcome) => {
        if (!outcome.ok) return;
        beginSwitch();
        void loadSources();
        void load(true);
      })
      .finally(() => setAddingSource(false));
  };

  const removeSourceById = (id: string): void => {
    setNotice(null);
    setInitOpen(false);
    void sources.send({ action: 'remove', id }).then(async (outcome) => {
      if (!outcome.ok) return;
      setDetail(null);
      beginSwitch();
      await loadSources();
      await load(true);
    });
  };

  const selectSource = (id: string): void => {
    if (payload?.selected === id) return;
    setNotice(null);
    setInitOpen(false);
    setQuery('');
    setCategory(null);
    setSelectedLabels([]);
    setSort('default');
    setDetail(null);
    beginSwitch();
    setKnownSources((current) => (current === null ? current : { sources: current.sources, selected: id }));
    void sources.send({ action: 'select', id }).then(async (outcome) => {
      if (!outcome.ok) {
        setLoading(false);
        setSlow(false);
        void loadSources();
        return;
      }
      await loadSources();
      await load(true);
    });
  };

  const install = (): void => {
    if (choice === null) return;
    const target = marketInstallTarget(choice.entry.name, choice.version.version, choice.version.source);
    setChoice(null);
    setNotice(null);
    void provision
      .send({
        action: 'install-version',
        spec: target.spec,
        ...(target.registry === undefined ? {} : { registry: target.registry }),
      })
      .then((outcome) => {
        if (!outcome.ok) return;
        const verdict = installVerdictOf(outcome.value, t);
        if (verdict.kind === 'failed') {
          provision.fail(verdict.text);
          onInstalled();
          return;
        }
        if (verdict.kind !== 'done') return;
        setNotice(t('panels.discover.installedDone', { name: choice.entry.name }));
        onInstalled();
      });
  };

  const reload = (): void => {
    setNotice(null);
    setInitOpen(false);
    void load(true);
  };

  return {
    t,
    locale,
    payload,
    loading,
    slow,
    failure,
    sources: payload?.sources ?? knownSources?.sources ?? [],
    selected: payload?.selected ?? knownSources?.selected ?? null,
    entries,
    shown,
    total: sorted.length,
    categories,
    labels,
    query,
    category,
    selectedLabels,
    sort,
    detailEntry,
    choice,
    notice,
    writeFailed: sources.failed,
    provisionFailed: provision.failed,
    busy: sources.busy,
    addingSource,
    manageOpen,
    problem,
    uninitialized,
    defaultBranch,
    initOpen,
    reload,
    setQuery,
    setCategory,
    toggleLabel: (label) =>
      setSelectedLabels((current) =>
        current.includes(label) ? current.filter((one) => one !== label) : [...current, label],
      ),
    clearLabels: () => setSelectedLabels([]),
    setSort,
    showMore: () => setLimit((current) => current + DISCOVER_PAGE_SIZE),
    openDetail: (name) => setDetail(name),
    closeDetail: () => setDetail(null),
    setDetailEntry: setDetail,
    setChoice,
    setManageOpen,
    setInitOpen,
    initialize,
    addSource,
    removeSourceById,
    selectSource,
    install,
  };
}

export type { InstallTarget };
export type { MarketSourceConfig };
