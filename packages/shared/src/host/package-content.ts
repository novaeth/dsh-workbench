import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { productWrite } from './seam/intent.js';
import type { Seam } from './seam/run.js';
import { INSTALL_TIMEOUT_MS } from '../config/constants.js';
import { parseJsonLoose } from '../lib/text.js';
import { quoteShellArg } from './shell-text.js';
import { splitNpmSpec } from './package-kind.js';
import { localDirOf } from './local-declaration.js';

function cacheFlag(cacheDir: string | undefined): string {
  return cacheDir === undefined ? '' : ` --cache ${quoteShellArg(cacheDir)}`;
}

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

function scratchDirOf(scratchRoot: string | undefined): string | undefined {
  const base = scratchRoot ?? os.tmpdir();
  try {
    if (scratchRoot !== undefined) fs.mkdirSync(base, { recursive: true });
    return fs.mkdtempSync(path.join(base, 'wb-package-'));
  } catch {
    return undefined;
  }
}

export async function withPackageDir<T>(
  options: {
    readonly seam?: Seam | undefined;
    readonly spec: string;
    readonly registry?: string | undefined;
    readonly cacheDir?: string | undefined;
    readonly scratchRoot?: string | undefined;
  },
  visit: (dir: string) => T,
): Promise<T | undefined> {
  const local = localDirOf(options.spec);
  if (local !== undefined) return visit(local);
  if (splitNpmSpec(options.spec) === undefined) return undefined;
  const seam = options.seam;
  if (seam === undefined) return undefined;

  const root = scratchDirOf(options.scratchRoot);
  if (root === undefined) return undefined;
  try {
    const at = options.registry === undefined ? '' : ` --registry ${quoteShellArg(options.registry)}`;
    const packed = await seam
      .run({
        command: `npm pack ${quoteShellArg(options.spec)} --ignore-scripts --json --pack-destination ${quoteShellArg(root)}${cacheFlag(options.cacheDir)}${at}`,
        intent: productWrite(),
        retry: 'safe',
        timeoutMs: INSTALL_TIMEOUT_MS,
        bestEffort: true,
      })
      .catch(() => undefined);
    if (packed === undefined || packed.exitCode !== 0) return undefined;
    const file = packedFileFrom(packed.stdout, root);
    if (file === undefined) return undefined;
    const unpacked = await seam
      .run({
        command: `tar -xzf ${quoteShellArg(file)} -C ${quoteShellArg(root)}`,
        intent: productWrite(),
        retry: 'safe',
        timeoutMs: INSTALL_TIMEOUT_MS,
        bestEffort: true,
      })
      .catch(() => undefined);
    if (unpacked === undefined || unpacked.exitCode !== 0) return undefined;
    const dir = path.join(root, 'package');
    if (!fs.existsSync(dir)) return undefined;
    return visit(dir);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
