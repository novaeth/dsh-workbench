import fs from 'node:fs';
import path from 'node:path';
import { localDirOf } from './spec.js';
export { localDirOf };
import { declarationProblemsOf } from '../contract/unit-declaration.js';

function asRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null ? (value as Readonly<Record<string, unknown>>) : undefined;
}

export function packageManifestOf(dir: string): Readonly<Record<string, unknown>> | undefined {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    return asRecord(parsed);
  } catch {
    return undefined;
  }
}

export function dshRecordOf(dir: string): unknown | undefined {
  return packageManifestOf(dir)?.dsh;
}

export function packageNameOf(dir: string): string | undefined {
  const name = packageManifestOf(dir)?.name;
  return typeof name === 'string' && name.trim() !== '' ? name.trim() : undefined;
}

export function pathDeclarationOf(spec: string): unknown | undefined {
  const dir = localDirOf(spec);
  return dir === undefined ? undefined : asRecord(dshRecordOf(dir))?.workbench;
}

export function declarationRefusalOf(name: string, raw: unknown): readonly string[] {
  if (raw === undefined) return [];
  return declarationProblemsOf(name, raw);
}
