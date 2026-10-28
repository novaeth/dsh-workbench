import type { MarketIndex, MarketIndexProblem } from '../contract/protocol/market-index.js';

export interface MarketEntryFile {
  readonly path: string;
  readonly text: string;
}

export type MarketIndexAssemble =
  | { readonly ok: true; readonly index: MarketIndex }
  | { readonly ok: false; readonly problems: readonly MarketIndexProblem[] };
