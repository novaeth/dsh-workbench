import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const FINGERPRINT_FILES = [
  'package.json',
  'design.json',
  'dist/host.js',
  'client.js',
  'cordis.patch.yml',
  'README.md',
  'CHANGELOG.md',
];

function statePathOf(home, unit) {
  return join(home, 'workbench', 'releases', `${unit}.json`);
}

export function readState(home, unit) {
  try {
    return JSON.parse(readFileSync(statePathOf(home, unit), 'utf8'));
  } catch {
    return undefined;
  }
}

export function writeState(home, unit, state) {
  const file = statePathOf(home, unit);
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(temp, file);
}

export function removeState(home, unit) {
  try {
    rmSync(statePathOf(home, unit));
  } catch {
    return;
  }
}

export function artifactFingerprintOf(root) {
  const hash = createHash('sha256');
  for (const rel of FINGERPRINT_FILES) {
    hash.update(`${rel}:`);
    try {
      hash.update(readFileSync(join(root, rel)));
    } catch {
      hash.update('missing');
    }
    hash.update('\n');
  }
  return hash.digest('hex').slice(0, 16);
}

export function resumableState(home, unit) {
  const state = readState(home, unit);
  if (state === undefined || typeof state !== 'object' || state === null) return undefined;
  const run = state.run;
  if (run === undefined || typeof run !== 'object' || run === null) return undefined;
  if (run.state === 'done') return undefined;
  return state;
}

export function startRun(home, unit, init) {
  const current = readState(home, unit) ?? {};
  const previous = current.run;
  const resuming = init.resume === true && previous !== undefined;
  const run = {
    ...(resuming ? previous : {}),
    id: resuming && typeof previous.id === 'string' ? previous.id : `run-${randomUUID()}`,
    state: 'running',
    phase: 'preflight',
    attempts: resuming ? Number(previous.attempts ?? 0) + 1 : 0,
    pid: process.pid,
    startedAt: resuming && typeof previous.startedAt === 'string' ? previous.startedAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...init.fields,
  };
  writeState(home, unit, {
    ...current,
    target: init.target,
    name: init.name,
    ...(init.version === undefined ? {} : { version: init.version }),
    ...(typeof current.status === 'string' ? {} : { status: 'intent' }),
    at: new Date().toISOString(),
    run,
  });
  return run;
}

export function advanceRun(home, unit, patch) {
  const current = readState(home, unit);
  if (current === undefined || typeof current !== 'object' || current === null) return undefined;
  const run = {
    ...(current.run ?? {}),
    ...patch,
    pid: process.pid,
    updatedAt: new Date().toISOString(),
  };
  writeState(home, unit, {
    ...current,
    ...(patch.version === undefined ? {} : { version: patch.version }),
    ...(patch.status === undefined ? {} : { status: patch.status }),
    run,
  });
  return run;
}

export function interruptRun(home, unit, failure) {
  const current = readState(home, unit) ?? {};
  const run = {
    ...(current.run ?? {}),
    state: 'interrupted',
    ...(typeof failure.phase === 'string' ? { phase: failure.phase } : {}),
    lastError: {
      class: failure.class ?? 'transient',
      code: failure.code ?? '',
      text: failure.text ?? '',
      at: new Date().toISOString(),
    },
    updatedAt: new Date().toISOString(),
  };
  writeState(home, unit, { ...current, run });
  return run;
}

export function finishRun(home, unit, patch = {}) {
  return advanceRun(home, unit, { ...patch, state: 'done' });
}
