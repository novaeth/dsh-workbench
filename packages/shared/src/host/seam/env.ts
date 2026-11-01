import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { dshHome } from '../data-root.js';

export interface SeamEnvInput {
  readonly runtimeRoot: string;
  readonly home?: string | undefined;
  readonly realHome?: string | undefined;
}

export interface SeamUnitEnvInput extends SeamEnvInput {
  readonly unitRoot: string;
}

function existing(realHome: string, name: string): string | undefined {
  const file = join(realHome, name);
  return existsSync(file) ? file : undefined;
}

export function seamProductEnv(input: SeamEnvInput): Record<string, string> {
  const runtimeRoot = input.runtimeRoot;
  const home = input.home ?? join(runtimeRoot, 'home');
  const realHome = input.realHome ?? homedir();
  const env: Record<string, string> = {
    HOME: home,
    DSH_HOME: dshHome(),
    DSH_WORKBENCH_HOME: runtimeRoot,
    npm_config_cache: join(runtimeRoot, 'npm-cache'),
    NPM_CONFIG_CACHE: join(runtimeRoot, 'npm-cache'),
    npm_config_logs_dir: join(runtimeRoot, 'npm-logs'),
    npm_config_store_dir: join(runtimeRoot, 'pnpm-store'),
    npm_config_cache_dir: join(runtimeRoot, 'pnpm-cache'),
    npm_config_state_dir: join(runtimeRoot, 'pnpm-state'),
    npm_config_update_notifier: 'false',
    npm_config_fund: 'false',
    NO_UPDATE_NOTIFIER: '1',
  };
  const npmrc = existing(realHome, '.npmrc');
  if (npmrc !== undefined) env['NPM_CONFIG_USERCONFIG'] = npmrc;
  const gitconfig = existing(realHome, '.gitconfig');
  if (gitconfig !== undefined) env['GIT_CONFIG_GLOBAL'] = gitconfig;
  return env;
}

export function seamUnitEnv(input: SeamUnitEnvInput): Record<string, string> {
  const unitRoot = input.unitRoot;
  return {
    ...seamProductEnv({ ...input, home: join(unitRoot, 'home') }),
    npm_config_cache: join(unitRoot, 'npm-cache'),
    NPM_CONFIG_CACHE: join(unitRoot, 'npm-cache'),
    npm_config_logs_dir: join(unitRoot, 'npm-logs'),
    npm_config_store_dir: join(unitRoot, 'pnpm-store'),
    npm_config_cache_dir: join(unitRoot, 'pnpm-cache'),
    npm_config_state_dir: join(unitRoot, 'pnpm-state'),
  };
}
