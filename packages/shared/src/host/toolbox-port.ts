export interface ToolboxPort {
  packsOf(session: string | null, preset: string | null): ReadonlySet<string>;
}

export interface McpServerPacks {
  readonly name: string;
  readonly tools: readonly string[];
}

export interface McpToolsPort {
  servers(): readonly McpServerPacks[];
}
