import type { PluginSourceProblem } from './plugin-source.js';
import type { PluginRelease, UnitLibNeed, UnitPluginNeed } from '../contract/unit.js';

export interface UnitLibState {
  readonly name: string;
  readonly purpose: string;
  readonly status: 'ok' | 'outdated' | 'missing' | 'unsatisfied';
  readonly installed?: string;
  readonly latest?: string;
  readonly command?: string;
}

export interface UnitCommands {
  readonly unit: string;
  readonly plugins?: readonly UnitPluginNeed[];
  readonly libs?: readonly UnitLibNeed[];
}

export interface UnitPluginState {
  readonly name: string;
  readonly status: "ok" | "outdated" | "missing";
  readonly missing: readonly string[];
  readonly install?: "ready" | PluginSourceProblem;
  readonly command?: string;
  readonly release?: PluginRelease;
}

export interface UnitCapability {
  readonly unit: string;
  readonly status: "ok" | "failed" | "missing-commands" | "missing-plugin" | "unchecked";
  readonly plugin?: string;
  readonly required: readonly string[];
  readonly missing: readonly string[];
  readonly detail: string;
  readonly command?: string;
  readonly fix?: "install" | "update";
  readonly install?: "ready" | PluginSourceProblem;
  readonly plugins?: readonly UnitPluginState[];
  readonly libs?: readonly UnitLibState[];
  readonly released?: boolean;
}
