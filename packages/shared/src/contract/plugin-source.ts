export type ProvisionProblem = 'not-declared' | 'env-missing' | 'malformed';

/**
 * 安装计划里的一步：`run` 是一条命令（只许是命令本身，不带 `&&` / `||` / `rm` 这类编排），
 * 其余四种是文件操作，由宿主用 `node:fs` 干（Windows 上没有 `rm -rf` / `ln -s` / `cp -R`）。
 */
export type PluginPlanStep =
  | {
      readonly kind: 'run';
      readonly line: string;
      readonly env?: Readonly<Record<string, string>> | undefined;
      readonly optional?: true | undefined;
    }
  | { readonly kind: 'remove'; readonly path: string }
  | { readonly kind: 'mkdir'; readonly path: string }
  | { readonly kind: 'link'; readonly target: string; readonly path: string }
  | { readonly kind: 'copy'; readonly from: string; readonly to: string };

export type ResolvedPluginSource =
  | {
      readonly ok: true;
      readonly steps: readonly PluginPlanStep[];
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
