import fs from 'node:fs';
import { npmCacheDir } from '@dsh-workbench/adapter-runtime';
import os from 'node:os';
import path from 'node:path';
import type { DshShell } from '@dsh-workbench/shared';
import { INSTALL_TIMEOUT_MS, parseJsonLoose, quoteShellArg, runShell } from '@dsh-workbench/shared/host';
import { splitNpmSpec } from './package-kind.js';
import { localDirOf } from './registry-declaration.js';

function packedFileFrom(stdout: string, root: string): string | undefined {
  const parsed = parseJsonLoose(stdout);
  if (Array.isArray(parsed)) {
    const first: unknown = parsed[0];
    const filename =
      typeof first === 'object' && first !== null ? (first as { filename?: unknown }).filename : undefined;
    if (typeof filename === 'string' && filename.trim() !== '') {
      const at = path.join(root, path.basename(filename.trim()));
      if (fs.existsSync(at)) return at;
    }
  }
  try {
    const found = fs.readdirSync(root).filter((name) => name.endsWith('.tgz'));
    return found.length === 1 ? path.join(root, found[0] ?? '') : undefined;
  } catch {
    return undefined;
  }
}

export async function withPackageDir<T>(
  options: { readonly shell?: DshShell | undefined; readonly spec: string; readonly registry?: string | undefined },
  visit: (dir: string) => T,
): Promise<T | undefined> {
  const local = localDirOf(options.spec);
  if (local !== undefined) return visit(local);
  if (splitNpmSpec(options.spec) === undefined) return undefined;
  const shell = options.shell;
  if (shell === undefined) return undefined;

  let root: string;
  try {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-package-'));
  } catch {
    return undefined;
  }
  try {
    const at = options.registry === undefined ? '' : ` --registry ${quoteShellArg(options.registry)}`;
    const packed = await runShell(
      shell,
      `npm pack ${quoteShellArg(options.spec)} --ignore-scripts --json --pack-destination ${quoteShellArg(root)} --cache ${quoteShellArg(npmCacheDir())}${at}`,
      { timeoutMs: INSTALL_TIMEOUT_MS },
    ).catch(() => undefined);
    if (packed === undefined || packed.exitCode !== 0) return undefined;
    const file = packedFileFrom(packed.stdout, root);
    if (file === undefined) return undefined;
    const unpacked = await runShell(shell, `tar -xzf ${quoteShellArg(file)} -C ${quoteShellArg(root)}`, {
      timeoutMs: INSTALL_TIMEOUT_MS,
    }).catch(() => undefined);
    if (unpacked === undefined || unpacked.exitCode !== 0) return undefined;
    const dir = path.join(root, 'package');
    if (!fs.existsSync(dir)) return undefined;
    return visit(dir);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
