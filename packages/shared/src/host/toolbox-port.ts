export interface ToolboxCapability {
  readonly name: string;
  readonly description: string;
  readonly content: string;
}

export interface ToolboxPort {
  packsOf(session: string | null, preset: string | null): ReadonlySet<string>;
  capabilityBrief?(workspace: string | null): ToolboxCapability;
}

export interface McpServerPacks {
  readonly name: string;
  readonly tools: readonly string[];
}

export interface McpToolsPort {
  servers(): readonly McpServerPacks[];
}
