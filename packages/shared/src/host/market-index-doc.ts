import type {
  MarketIndex,
  MarketIndexEngines,
  MarketIndexEntryMetadata,
  MarketIndexProblem,
  MarketIndexSource,
  MarketLocalizedText,
} from '../contract/protocol/market-index.js';

export interface MarketVersionDoc {
  readonly name: string;
  readonly version: string;
  readonly source: MarketIndexSource;
  readonly publishTimestamp?: number;
  readonly engines?: MarketIndexEngines;
  readonly title?: MarketLocalizedText;
  readonly description?: MarketLocalizedText;
  readonly author?: string;
  readonly owner?: string;
  readonly homepage?: string;
  readonly icon?: string;
  readonly metadata?: MarketIndexEntryMetadata;
}

export interface MarketMetaDoc {
  readonly name: string;
  readonly epoch?: number;
  readonly publishTimestamp: number;
  readonly title?: MarketLocalizedText;
  readonly description?: MarketLocalizedText;
  readonly author?: string;
  readonly owner?: string;
  readonly homepage?: string;
  readonly icon?: string;
  readonly metadata?: MarketIndexEntryMetadata;
}

export type MarketEntryDoc = MarketVersionDoc | MarketMetaDoc;

export type MarketEntryDocParse =
  | { readonly ok: true; readonly doc: MarketEntryDoc }
  | { readonly ok: false; readonly problems: readonly MarketIndexProblem[] };

export interface MarketEntryFile {
  readonly path: string;
  readonly text: string;
}

export type MarketIndexAssemble =
  | { readonly ok: true; readonly index: MarketIndex }
  | { readonly ok: false; readonly problems: readonly MarketIndexProblem[] };

export interface MarketDocFields {
  readonly name: string;
  readonly title?: MarketLocalizedText;
  readonly description?: MarketLocalizedText;
  readonly author?: string;
  readonly owner?: string;
  readonly homepage?: string;
  readonly icon?: string;
  readonly metadata?: MarketIndexEntryMetadata;
}
