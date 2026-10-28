export interface RuntimeCapabilities {
  readonly console: boolean;
  readonly pluginMarket: boolean;
  readonly browserBridge: boolean;
  readonly libs: boolean;
}

export interface RuntimeTerms {
  readonly plugin: string;
  readonly pluginOf: string;
  readonly pluginThing: string;
  readonly pluginArea: string;
}

export interface RuntimeProfile {
  readonly label: string;
  readonly terms: RuntimeTerms;
  readonly installHint: string;
  readonly diagnose: Readonly<Partial<Record<'exec' | 'login' | 'bridge', string>>>;
}
