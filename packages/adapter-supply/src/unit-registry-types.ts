export interface UnitRefusal {
  readonly unit: string;
  readonly reason: string;
}

export interface UnitRegistry {
  all(): readonly unknown[];
  declarationOf?(unit: string): { readonly pkg: string; readonly declaration: unknown } | undefined;
  registerPlugin(face: unknown): () => void;
}
