import { mkdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { execaSync } from 'execa';
import semver from 'semver';

export class ReleaseError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.name = 'ReleaseError';
    this.code = code;
  }
}

export class ResumableError extends ReleaseError {
  constructor(message, resume) {
    super(message, 4);
    this.name = 'ResumableError';
    this.resume = resume;
  }

  toJSON() {
    return { ok: false, resumable: true, text: this.message, resume: this.resume };
  }
}

export class NeedsUser extends Error {
  constructor(step, text, command, extra = {}) {
    super(text);
    this.name = 'NeedsUser';
    this.step = step;
    this.text = text;
    this.command = command;
    this.extra = extra;
  }

  toJSON() {
    return {
      step: this.step,
      text: this.text,
      ...(this.command === undefined ? {} : { command: this.command }),
      ...this.extra,
    };
  }
}

export function tailOf(text) {
  return String(text ?? '')
    .trim()
    .split('\n')
    .filter((one) => one.trim() !== '')
    .slice(-6)
    .join(' | ');
}

export function argValue(args, flag) {
  const at = args.indexOf(flag);
  return at === -1 ? undefined : args[at + 1];
}

export function argValues(args, flag) {
  const values = [];
  for (let at = 0; at < args.length; at += 1) {
    if (args[at] === flag) values.push(args[at + 1] ?? '');
  }
  return values;
}

export function hasFlag(args, flag) {
  return args.includes(flag);
}

export function normalizeRegistry(url) {
  const value = String(url ?? '').trim();
  if (value === '') return '';
  return value.endsWith('/') ? value : `${value}/`;
}

export function dshHomeOf(home) {
  return home ?? process.env.DSH_HOME?.trim() ?? join(homedir(), '.dsh');
}

export function workbenchRootOf(home) {
  const configured = process.env.DSH_WORKBENCH_HOME?.trim();
  if (configured !== undefined && configured !== '') return configured;
  return join(dshHomeOf(home), 'workbench');
}

export function artifactsDirOf(home, unit) {
  return join(workbenchRootOf(home), 'artifacts', unit);
}

export function publishTagOf(version) {
  const prerelease = semver.prerelease(String(version ?? '').trim());
  if (prerelease === null) return undefined;
  return typeof prerelease[0] === 'string' ? prerelease[0] : 'next';
}

export function defaultExec(command, argv, { cwd, capture = false, allowFailure = false } = {}) {
  const cache = join(tmpdir(), 'dsh-wb-npm-cache');
  const logs = join(tmpdir(), 'dsh-wb-npm-logs');
  mkdirSync(cache, { recursive: true });
  mkdirSync(logs, { recursive: true });
  let result;
  try {
    result = execaSync(command, argv, {
      cwd,
      env: { ...process.env, npm_config_cache: cache, npm_config_logs_dir: logs },
      reject: false,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
  } catch (error) {
    if (allowFailure) return { status: 1, stdout: '', stderr: String(error) };
    throw new ReleaseError(`跑不起 ${command}：${String(error)}`);
  }
  const status = result.exitCode ?? 1;
  const stdout = typeof result.stdout === 'string' ? result.stdout : '';
  const stderr = typeof result.stderr === 'string' ? result.stderr : '';
  if (status !== 0 && !allowFailure) {
    const text = tailOf(`${stdout}\n${stderr}`);
    throw new ReleaseError(`${command} ${argv.join(' ')} 没过${text === '' ? '' : `：${text}`}`);
  }
  return { status, stdout, stderr };
}
