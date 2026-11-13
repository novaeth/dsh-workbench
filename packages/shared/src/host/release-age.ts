import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeTextFile } from './fs-write.js';
import { RELEASE_PACKAGES } from './release-packages.generated.js';

export interface ReleaseAgeInput {
  readonly dir: string;
  readonly packages?: readonly string[] | undefined;
}

function releaseAgeNameOf(line: string): string | undefined {
  return /^\s*-\s*'(\S+?)@(?=\d)/.exec(line)?.[1];
}

function listsVersion(line: string, version: string): boolean {
  return line
    .split('||')
    .some((part) => part.trim().replace(/^.*@/, '').replace(/'$/, '') === version);
}

/**
 * 把版本补进 `minimumReleaseAgeExclude` 名单：缺哪个包补哪个包，已有的条目不动，别的键原样保留。
 * @param version 要放行的版本号。
 * @param packages 要放行的包名。
 * @param workspace 现有的 pnpm-workspace.yaml 文本。
 */
function withAppended(workspace: string, missing: readonly string[]): string {
  const lines = workspace.replace(/\n+$/, '').split('\n');
  if (missing.length === 0) return `${lines.join('\n')}\n`;
  const key = lines.findIndex((line) => line.startsWith('minimumReleaseAgeExclude:'));
  if (key < 0) return `${lines.join('\n')}\n\nminimumReleaseAgeExclude:\n${missing.join('\n')}\n`;
  let end = key + 1;
  while (end < lines.length && /^\s+\S/.test(lines[end] ?? '')) end += 1;
  lines.splice(end, 0, ...missing);
  return `${lines.join('\n')}\n`;
}

/**
 * 把版本补进 `minimumReleaseAgeExclude` 名单：缺哪个包补哪个包，已有的条目不动，别的键原样保留。
 * @param version 要放行的版本号。
 * @param packages 要放行的包名。
 * @param workspace 现有的 pnpm-workspace.yaml 文本。
 */
export function withReleaseAge(version: string, packages: readonly string[], workspace: string): string {
  const lines = workspace.replace(/\n+$/, '').split('\n');
  const missing: string[] = [];
  for (const name of packages) {
    const at = lines.findIndex((line) => releaseAgeNameOf(line) === name);
    if (at < 0) {
      missing.push(`  - '${name}@${version}'`);
      continue;
    }
    const line = lines[at] ?? '';
    if (!listsVersion(line, version)) {
      lines[at] = line.endsWith("'") ? `${line.slice(0, -1)} || ${version}'` : `${line} || ${version}`;
    }
  }
  return withAppended(lines.join('\n'), missing);
}

export function releaseAgeFileOf(dir: string): string {
  return join(dir, 'pnpm-workspace.yaml');
}

function scopePatternsOf(packages: readonly string[]): readonly string[] {
  const patterns = packages.map((name) => (name.startsWith('@') ? `${name.split('/')[0] ?? name}/*` : name));
  return [...new Set(patterns)];
}

/**
 * 把整个 scope 补进 `minimumReleaseAgeExclude`：同一个 scope 里以后发多少版都不用再跟着改。
 * @param patterns 包名或 scope 通配（`@scope/*`）。
 * @param workspace 现有的 pnpm-workspace.yaml 文本。
 */
export function withReleaseAgeScopes(patterns: readonly string[], workspace: string): string {
  const lines = workspace.replace(/\n+$/, '').split('\n');
  const missing = [...new Set(patterns)]
    .filter((pattern) => !lines.some((line) => line.trim() === `- '${pattern}'`))
    .map((pattern) => `  - '${pattern}'`);
  return withAppended(lines.join('\n'), missing);
}

/**
 * 让 profile 自己的 pnpm-workspace.yaml 放行工作台这一族包（按 scope 通配）；文件不存在就不碰，读不了/写不了也不抛。
 * @param input profile 目录，以及要放行的包（默认整份发布清单）。
 * @returns 真的写了文件才为 `true`。
 */
export function ensureReleaseAge(input: ReleaseAgeInput): boolean {
  const packages = input.packages ?? RELEASE_PACKAGES;
  const file = releaseAgeFileOf(input.dir);
  let before: string;
  try {
    before = readFileSync(file, 'utf8');
  } catch {
    return false;
  }
  const after = withReleaseAgeScopes(scopePatternsOf(packages), before);
  if (after === before) return false;
  try {
    writeTextFile(file, after);
    return true;
  } catch {
    return false;
  }
}
