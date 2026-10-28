export type ProvisionProblem = 'not-declared' | 'env-missing' | 'malformed';

export interface PluginSourceCommand {
  readonly line: string;
  readonly optional?: true;
}

export type ResolvedPluginSource =
  | {
      readonly ok: true;
      readonly commands: readonly PluginSourceCommand[];
      readonly line: string;
    }
  | {
      readonly ok: false;
      readonly problem: ProvisionProblem;
      readonly env?: string;
    };

export interface PluginSourceOptions {
  readonly command?: string;
  readonly plugin?: string;
  readonly version?: string;
  readonly mode?: 'install' | 'update';
}
