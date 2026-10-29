import path from 'node:path';

const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;
const VERSION = /^[a-zA-Z0-9][a-zA-Z0-9._+-]*$/;

export interface NpmRef {
  readonly name: string;
  readonly version?: string;
}

export function isPackageName(value: string): boolean {
  return value.length <= 214 && PACKAGE_NAME.test(value);
}

export function splitNpmSpec(spec: string): NpmRef | undefined {
  const value = spec.trim();
  const at = value.lastIndexOf('@');
  const name = at > 0 ? value.slice(0, at) : value;
  const version = at > 0 ? value.slice(at + 1) : '';
  if (!isPackageName(name)) return undefined;
  if (version !== '' && !VERSION.test(version)) return undefined;
  return { name, ...(version === '' ? {} : { version }) };
}

export function localDirOf(spec: string): string | undefined {
  const dir = spec.trim().replace(/^(?:file|link):/, '');
  return path.isAbsolute(dir) ? dir : undefined;
}

export function refusalReason(): string {
  return '这个包既不是工作台的模块，也不是运行时的插件，装了也用不上';
}
