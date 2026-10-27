import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CHANGELOG_FILE,
  CHANGELOG_KINDS,
  appendChangelogEntry,
  changelogDate,
  changelogHasEntry,
  changelogSkeleton,
  changelogVersion,
  isValidVersion,
} from '@dsh-workbench/shared/host';

const USAGE = `用法：
  changelog init                              建一份 ${CHANGELOG_FILE}（已有就不动）
  changelog add <版本> [--type ${CHANGELOG_KINDS.join('|')}] [--note <文字>] [--date <日期>]
  changelog check [版本]                      查这一版有没有记录（省略版本用 package.json 的）
版本也可以省略：用 package.json 里的 version。发布时这一版必须有记录，否则拦下。`;

function argValue(args, flag) {
  const at = args.indexOf(flag);
  return at === -1 ? undefined : args[at + 1];
}

function positional(args, at) {
  const value = args[at];
  return value === undefined || value.startsWith('--') ? undefined : value;
}

export function changelogFileOf(root) {
  return join(root, CHANGELOG_FILE);
}

export function readChangelogText(root) {
  try {
    return readFileSync(changelogFileOf(root), 'utf8');
  } catch {
    return '';
  }
}

export function manifestVersionOf(root) {
  try {
    const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
    return typeof version === 'string' ? version.trim() : '';
  } catch {
    return '';
  }
}

export function changelogProblemOf(root, version) {
  const text = readChangelogText(root);
  if (text.trim() === '') {
    return {
      reason: `包里还没有 ${CHANGELOG_FILE} —— 更新日志要随包发布`,
      command: 'dsh-wb-module changelog init',
    };
  }
  if (!changelogHasEntry(text, version)) {
    return {
      reason: `${CHANGELOG_FILE} 里没有 ${version} 这一版的内容 —— 发布前先把这一版写进去`,
      command: `dsh-wb-module changelog add ${version} --note "这一版改了什么"`,
    };
  }
  return undefined;
}

export function initChangelog(root) {
  const file = changelogFileOf(root);
  if (existsSync(file)) return { file, created: false };
  writeFileSync(file, changelogSkeleton());
  return { file, created: true };
}

export class ChangelogError extends Error {
  constructor(message, code = 2) {
    super(message);
    this.name = 'ChangelogError';
    this.code = code;
  }
}

export function addChangelog(root, { version, kind = 'changed', note, date }) {
  const text = (note ?? '').trim();
  if (text === '') throw new ChangelogError('changelog add 要一句 --note：这一版改了什么');
  if (!CHANGELOG_KINDS.includes(kind)) {
    throw new ChangelogError(`--type 只认 ${CHANGELOG_KINDS.join(' / ')}（收到「${kind}」）`);
  }
  const wanted = changelogVersion(version === undefined || version === '' ? manifestVersionOf(root) : version);
  if (!isValidVersion(wanted)) {
    throw new ChangelogError(`版本要写成 x.y.z（收到「${String(version)}」）—— 也可以省略，用 package.json 里的`);
  }
  const file = changelogFileOf(root);
  const body = appendChangelogEntry(readChangelogText(root), { version: wanted, kind, note: text, date });
  writeFileSync(file, body);
  return { file, version: wanted, kind };
}

function runInit(root, args) {
  const result = initChangelog(root);
  if (args.includes('--json')) {
    console.log(JSON.stringify({ ok: true, ...result }));
    return;
  }
  if (!result.created) {
    console.log(`${CHANGELOG_FILE} 已经在：${result.file} —— 没动它`);
    return;
  }
  console.log(`✔ 建好了 ${result.file}`);
  console.log(`  下一步：dsh-wb-module changelog add ${manifestVersionOf(root) || '<版本>'} --note "这一版改了什么"`);
}

function runAdd(root, args) {
  const version = positional(args, 1) ?? manifestVersionOf(root);
  const kind = argValue(args, '--type') ?? 'changed';
  const note = argValue(args, '--note') ?? '';
  const date = (argValue(args, '--date') ?? changelogDate()).trim();
  let result;
  try {
    result = addChangelog(root, { version, kind, note, date });
  } catch (error) {
    if (!(error instanceof ChangelogError)) throw error;
    console.error(error.message);
    process.exit(error.code);
  }
  if (args.includes('--json')) {
    console.log(JSON.stringify({ ok: true, ...result, date }));
    return;
  }
  console.log(`✔ ${CHANGELOG_FILE} 已记下 ${result.version}（${result.kind}）`);
}

function runCheck(root, args) {
  const version = changelogVersion(positional(args, 1) ?? manifestVersionOf(root));
  if (!isValidVersion(version)) {
    console.error('changelog check 要知道查哪一版：给一个 x.y.z，或先让 package.json 有 version');
    process.exit(2);
  }
  const problem = changelogProblemOf(root, version);
  if (args.includes('--json')) {
    console.log(
      JSON.stringify(
        problem === undefined
          ? { ok: true, version }
          : { ok: false, version, reason: problem.reason, command: problem.command },
      ),
    );
  } else if (problem === undefined) {
    console.log(`✔ ${CHANGELOG_FILE} 里有 ${version} 的更新日志`);
  } else {
    console.error(`✖ ${problem.reason}`);
    console.error(`  补上：${problem.command}`);
  }
  if (problem !== undefined) process.exit(1);
}

export async function changelog({ root, args = [] }) {
  const sub = args[0];
  if (sub === 'init') return runInit(root, args);
  if (sub === 'add') return runAdd(root, args);
  if (sub === 'check') return runCheck(root, args);
  console.error(`不认识的 changelog 子命令：${String(sub)}`);
  console.error(USAGE);
  process.exit(2);
}
