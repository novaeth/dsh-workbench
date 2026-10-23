import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { UnitManifest } from '../api/unit.js';
import { readDeclaration } from '../host/unit-declaration.js';

export function declarationOfPackage(pkg: string, packageJson: URL | string): UnitManifest {
  const at = typeof packageJson === 'string' ? packageJson : fileURLToPath(packageJson);
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(at, 'utf8'));
  } catch (error) {
    throw new Error(`${pkg}: 读不动 ${at} —— ${String(error)}`, { cause: error });
  }
  const declared =
    typeof parsed === 'object' && parsed !== null
      ? (parsed as { dsh?: { workbench?: unknown } }).dsh?.workbench
      : undefined;
  const read = readDeclaration(pkg, declared);
  if (read.manifest === undefined) {
    throw new Error(`${pkg} 的 dsh.workbench 读不出来：${read.problems.join('；')}`);
  }
  return read.manifest;
}
