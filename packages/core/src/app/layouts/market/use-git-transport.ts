import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gitTransportCandidates } from '@dsh-workbench/shared';
import type { GitProbeStatus, MarketIndexGitSource } from '@/kernel/contract/market-index';
import { readGitProbe } from '@/shared/hooks/market-queries';

export type TransportProbe = GitProbeStatus | 'checking' | 'unknown';

export interface GitTransportRow {
  readonly kind: 'https' | 'ssh';
  readonly url: string;
}

export interface GitTransportState {
  readonly rows: readonly GitTransportRow[];
  readonly chosen: string | null;
  readonly states: Readonly<Record<string, TransportProbe>>;
  readonly custom: string;
  readonly customState: TransportProbe | null;
  readonly probing: boolean;
  readonly ready: boolean;
  setChosen(url: string): void;
  setCustom(value: string): void;
  checkCustom(): void;
}

function probeOrUnknown(url: string): Promise<TransportProbe> {
  return readGitProbe(url)
    .then((response) => (response.ok ? response.status : 'unknown'))
    .catch(() => 'unknown' as const);
}

function usable(state: TransportProbe | undefined): boolean {
  return state !== undefined && state !== 'auth' && state !== 'checking';
}

function defaultOf(rows: readonly GitTransportRow[], states: Readonly<Record<string, TransportProbe>>): string | null {
  const readable = rows.find((row) => states[row.url] === 'ok');
  if (readable !== undefined) return readable.url;
  const fallback = rows.find((row) => usable(states[row.url]));
  return fallback === undefined ? null : fallback.url;
}

export function useGitTransport(source: MarketIndexGitSource | null): GitTransportState {
  const rows = useMemo<readonly GitTransportRow[]>(
    () => (source === null ? [] : gitTransportCandidates(source.url)),
    [source],
  );
  const [results, setResults] = useState<Readonly<Record<string, TransportProbe>>>({});
  const [picked, setPicked] = useState<string | null>(null);
  const [custom, setCustom] = useState('');
  const [customState, setCustomState] = useState<TransportProbe | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    const mirror = ++generation.current;
    for (const row of rows) {
      void probeOrUnknown(row.url).then((state) => {
        if (generation.current !== mirror) return;
        setResults((current) => ({ ...current, [row.url]: state }));
      });
    }
    return () => {
      generation.current += 1;
    };
  }, [rows]);

  const checkCustom = useCallback((): void => {
    const wanted = custom.trim();
    if (wanted === '') return;
    const mirror = ++generation.current;
    setCustomState('checking');
    void probeOrUnknown(wanted).then((state) => {
      if (generation.current !== mirror) return;
      setCustomState(state);
      if (usable(state)) setPicked(wanted);
    });
  }, [custom]);

  const states = useMemo<Readonly<Record<string, TransportProbe>>>(() => {
    const next: Record<string, TransportProbe> = {};
    for (const row of rows) next[row.url] = results[row.url] ?? 'checking';
    return next;
  }, [results, rows]);

  const known = picked !== null && (rows.some((row) => row.url === picked) || picked === custom.trim());
  const chosen = known ? picked : defaultOf(rows, states);

  return {
    rows,
    chosen,
    states,
    custom,
    customState,
    probing: rows.some((row) => states[row.url] === 'checking'),
    ready: chosen !== null,
    setChosen: setPicked,
    setCustom,
    checkCustom,
  };
}
