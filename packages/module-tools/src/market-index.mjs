import { randomBytes } from 'node:crypto';
import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import {
  MARKET_ENTRIES_README_LINES,
  MARKET_INDEX_README_LINES,
  assembleMarketIndex,
  claimOf,
  collectMarketEntryFiles,
  gitUrlOk,
  marketArtifactPath,
  marketArtifactPathFor,
  marketArtifactRoot,
  marketEntryFilesOfLegacy,
  marketEntryPath,
  marketMetaDocOf,
  marketMetaPath,
  marketSourceKey,
  marketVersionDocLeanOf,
  parseMarketIndexJson,
} from '@dsh-workbench/shared/host';

const MARKET_DIR = 'market';
const LEGACY_FILE = 'market.json';
const SAFE_PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const WORKSPACE_PREFIX = 'workspace:';
const ARTIFACT_DIRS = ['dist'];
const ARTIFACT_FILES = ['client.js', 'cordis.patch.yml', 'README.md', 'CHANGELOG.md'];
const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

export class MarketIndexError extends Error {
  constructor(message, step, command) {
    super(message);
    this.name = 'MarketIndexError';
    this.step = step;
    this.command = command;
  }
}

function argValue(args, flag) {
  const at = args.indexOf(flag);
  return at === -1 ? undefined : args[at + 1];
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

function tailOf(text) {
  return String(text ?? '')
    .trim()
    .split('\n')
    .filter((one) => one.trim() !== '')
    .slice(-4)
    .join(' | ');
}

function workbenchRootOf(home) {
  const explicit = process.env.DSH_WORKBENCH_HOME?.trim();
  return explicit === undefined || explicit === '' ? join(home, 'workbench') : explicit;
}

function statedPolicy(value) {
  return value === 'artifacts-in-repo' || value === 'catalog-only' ? value : undefined;
}

export function sanitizeManifest(manifest) {
  const next = globalThis.structuredClone(manifest);
  delete next.scripts;
  for (const field of DEP_FIELDS) {
    const deps = next[field];
    if (deps === null || typeof deps !== 'object' || Array.isArray(deps)) continue;
    for (const [name, spec] of Object.entries(deps)) {
      if (typeof spec === 'string' && spec.trim().startsWith(WORKSPACE_PREFIX)) delete deps[name];
    }
    if (Object.keys(deps).length === 0) delete next[field];
  }
  return next;
}

function authorParts(manifest) {
  const author = manifest?.author;
  const raw =
    typeof author === 'string'
      ? author.trim()
      : author !== null && typeof author === 'object' && typeof author.name === 'string'
        ? author.name.trim()
        : '';
  const declaredEmail =
    author !== null && typeof author === 'object' && typeof author.email === 'string' ? author.email.trim() : '';
  const match = /^(.*?)\s*<([^>]*)>/.exec(raw);
  const name = (match === null ? raw : match[1]).trim();
  const email = match === null ? declaredEmail : match[2].trim() || declaredEmail;
  return { name, email };
}

function authorOf(manifest) {
  const author = manifest.author;
  if (typeof author === 'string') return author.trim();
  if (author !== null && typeof author === 'object' && typeof author.name === 'string') return author.name.trim();
  return '';
}

export function authorTextOf(manifest) {
  const { name, email } = authorParts(manifest);
  if (name === '') return '';
  return email === '' ? name : `${name} <${email}>`;
}

export function claimProblemText(name, claim, unit) {
  if (claim.state === 'unit-taken') {
    return (
      `市场里 ${claim.entry} 已经用了模块 id ${unit} —— 两个模块不能共用一个 id，装在一起会撞。` +
      '给这个模块换一个 unit（dsh.workbench.unit）再发；那个条目如果已经废弃，让索引维护者删掉或给它换一个 unit。'
    );
  }
  if (claim.state === 'path-taken') {
    return (
      `市场仓库里的 ${marketArtifactRoot(name)} 已经被 ${claim.entry} 占了 —— 一个产物目录只能放一个包。` +
      '换一个包名再发；那个条目如果已经废弃，让索引维护者先处理掉。'
    );
  }
  return (
    `市场里 ${name} 已经有主了（${claim.owner ?? '未署名'}），同一个名字不能再由别人发。` +
    '要发就换个带团队 scope 的包名；你就是原来的作者（只是换了机器或署名），用 author 参数带上原来的署名再发一次（CLI 是 --author）；' +
    '确实是接手，让索引维护者把这一条的 owner 改成你。'
  );
}

export function missingPublisherText() {
  return '市场里一个名字要有主人：给 package.json 补上 author，或用 author 参数传一个署名（CLI 是 --author），再发。';
}

function unitOf(manifest) {
  const unit = manifest?.dsh?.workbench?.unit;
  return typeof unit === 'string' ? unit.trim() : '';
}

function indexPathOf(plan) {
  const asked = (plan.source.path ?? '').trim();
  const base = asked === '' ? MARKET_DIR : asked.replace(/^\/+/, '');
  return base.replace(/\/+$/, '') || MARKET_DIR;
}

function readWorktreeIndex(workdir, dir) {
  const root = join(workdir, dir);
  if (existsSync(root)) {
    const assembled = assembleMarketIndex(collectMarketEntryFiles(root));
    if (!assembled.ok) {
      throw new MarketIndexError(
        `${dir}/ 里有不合规的条目：${assembled.problems.map((one) => one.detail).join('；')}`,
        'index-write',
      );
    }
    return assembled.index;
  }
  const legacy = join(workdir, LEGACY_FILE);
  if (!existsSync(legacy)) return { format: 1, plugins: [] };
  const parsed = parseMarketIndexJson(readFileSync(legacy, 'utf8'));
  if (!parsed.ok) {
    throw new MarketIndexError(
      `${LEGACY_FILE} 不合 format 1：${parsed.problems.map((one) => one.detail).join('；')}`,
      'index-write',
    );
  }
  return parsed.index;
}

function ensureClaimFree(workdir, dir, input) {
  const claim = claimOf(readWorktreeIndex(workdir, dir), input);
  if (claim.state === 'conflict' || claim.state === 'unit-taken' || claim.state === 'path-taken') {
    throw new MarketIndexError(claimProblemText(input.name, claim, input.unit), 'market-owner');
  }
}

function ensureVersionFree(workdir, dir, input) {
  const entry = readWorktreeIndex(workdir, dir).plugins.find((one) => one.name === input.name);
  if (entry?.versions.some((one) => one.version === input.version) === true) {
    throw new MarketIndexError(`索引里已经有 ${input.name}@${input.version} —— 换个版本号再发`, 'market-owner');
  }
}

function writeEntryFile(workdir, dir, entry, version) {
  const doc = marketVersionDocLeanOf(entry, version);
  const rel = marketEntryPath(dir, entry.name, version.version);
  const file = join(workdir, ...rel.split('/'));
  if (existsSync(file)) {
    const current = JSON.parse(readFileSync(file, 'utf8'));
    if (isDeepStrictEqual(current, doc)) return rel;
    throw new MarketIndexError(
      `索引里已经有 ${entry.name}@${version.version}（${rel}）—— 换个版本号再发`,
      'market-owner',
    );
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
  return rel;
}

function metaEpochOf(workdir, dir, name) {
  const root = join(workdir, dir, name);
  if (!existsSync(root)) return 0;
  let epoch = 0;
  for (const item of readdirSync(root)) {
    if (!item.startsWith('meta-') || !item.endsWith('.json')) continue;
    try {
      const doc = JSON.parse(readFileSync(join(root, item), 'utf8'));
      if (typeof doc.epoch === 'number' && doc.epoch > epoch) epoch = doc.epoch;
    } catch {
      continue;
    }
  }
  return epoch;
}

function writeMetaFile(workdir, dir, entry, at) {
  const epoch = metaEpochOf(workdir, dir, entry.name) + 1;
  const suffix = randomBytes(3).toString('hex');
  const doc = marketMetaDocOf(entry, epoch, Math.floor(at / 1000));
  const rel = marketMetaPath(dir, entry.name, epoch, suffix);
  const file = join(workdir, ...rel.split('/'));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
  return rel;
}

function migrateLegacyIndex(workdir, dir) {
  const legacy = join(workdir, LEGACY_FILE);
  if (!existsSync(legacy)) return [];
  const files = marketEntryFilesOfLegacy(readFileSync(legacy, 'utf8'), dir);
  if (files === undefined) {
    const parsed = parseMarketIndexJson(readFileSync(legacy, 'utf8'));
    throw new MarketIndexError(
      `${LEGACY_FILE} 不合 format 1：${parsed.ok ? '' : parsed.problems.map((one) => one.detail).join('；')}`,
      'index-write',
    );
  }
  const written = [];
  for (const file of files) {
    const target = join(workdir, ...file.path.split('/'));
    if (existsSync(target)) continue;
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.text);
    written.push(file.path);
  }
  const marker = join(workdir, dir, 'README.md');
  if (!existsSync(marker)) {
    mkdirSync(join(workdir, dir), { recursive: true });
    writeFileSync(marker, MARKET_ENTRIES_README_LINES.join('\n'));
    written.push(`${dir}/README.md`);
  }
  rmSync(legacy);
  written.push(LEGACY_FILE);
  return written;
}

function revOf(exec, workdir, ref) {
  const result = runGit(exec, workdir, ['rev-parse', ref], { allowFailure: true });
  return result.status === 0 ? result.stdout.trim() : '';
}

function syncWorktree(exec, workdir, branch) {
  const fetched = runGit(exec, workdir, ['fetch', 'origin', branch], { allowFailure: true });
  if (fetched.status !== 0) {
    throw new MarketIndexError(
      `拉不到索引仓库的远端 ${branch}：${tailOf(`${fetched.stdout}\n${fetched.stderr}`)}`,
      'git-auth',
      `git -C ${workdir} fetch origin ${branch}`,
    );
  }
  const head = revOf(exec, workdir, 'HEAD');
  const remote = revOf(exec, workdir, `origin/${branch}`);
  if (head === '' || remote === '' || head === remote) return;
  const behind = runGit(exec, workdir, ['merge-base', '--is-ancestor', head, `origin/${branch}`], {
    allowFailure: true,
  });
  if (behind.status !== 0) return;
  runGit(exec, workdir, ['reset', '--hard', `origin/${branch}`], { allowFailure: true });
}

function replicatePush(exec, workdir, branch, base, redo) {
  let last = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const sha = redo();
    const pushed = pushOf(exec, workdir, branch);
    if (pushed.status === 0) return { ok: true, sha };
    last = tailOf(`${pushed.stdout}\n${pushed.stderr}`);
    const fetched = runGit(exec, workdir, ['fetch', 'origin', branch], { allowFailure: true });
    if (fetched.status !== 0) return { ok: false, code: 'git-auth', reason: last };
    const remote = revOf(exec, workdir, `origin/${branch}`);
    const ancestor =
      base === ''
        ? true
        : runGit(exec, workdir, ['merge-base', '--is-ancestor', base, `origin/${branch}`], {
            allowFailure: true,
          }).status === 0;
    if (!ancestor) {
      return {
        ok: false,
        code: 'git-market-rewritten',
        reason: `远端 ${branch} 的历史被改写过（本地基点不在它的祖先里）—— 不自动合并：${last}`,
      };
    }
    if (remote === '' || remote === base) {
      return { ok: false, code: 'git-market-protected', reason: last };
    }
    const reset = runGit(exec, workdir, ['reset', '--hard', `origin/${branch}`], { allowFailure: true });
    if (reset.status !== 0) {
      return { ok: false, code: 'index-write', reason: `同步远端失败：${tailOf(reset.stderr)}` };
    }
  }
  return { ok: false, code: 'index-write', reason: `远端一直在变，重试 3 次没挤进去（${last}）—— 过一会儿再发` };
}

export function identityOf(manifest) {
  const { name, email } = authorParts(manifest);
  if (name === '') return undefined;
  return email === '' ? { name } : { name, email };
}

function descriptionOf(manifest) {
  const description = typeof manifest.description === 'string' ? manifest.description.trim() : '';
  return description === '' ? undefined : { zh: description };
}

function titleOf(manifest) {
  const title = manifest.title;
  if (typeof title === 'string') {
    const text = title.trim();
    return text === '' ? undefined : { zh: text };
  }
  if (title === null || typeof title !== 'object' || Array.isArray(title)) return undefined;
  const zh = typeof title.zh === 'string' ? title.zh.trim() : '';
  const en = typeof title.en === 'string' ? title.en.trim() : '';
  if (zh === '' && en === '') return undefined;
  return { ...(zh === '' ? {} : { zh }), ...(en === '' ? {} : { en }) };
}

function textListOf(value) {
  return Array.isArray(value)
    ? [...new Set(value.flatMap((one) => (typeof one === 'string' && one.trim() !== '' ? [one.trim()] : [])))]
    : [];
}

function recordOf(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function recordFieldOf(container, key) {
  const value = container[key];
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) return value;
  const next = {};
  container[key] = next;
  return next;
}

export function labelsOfManifest(manifest) {
  const dsh = recordOf(recordOf(manifest).dsh);
  const workbench = recordOf(dsh.workbench);
  return textListOf(recordOf(workbench.market).labels);
}

export function setManifestLabels(manifest, labels) {
  if (labels.length === 0) return;
  const market = recordFieldOf(recordFieldOf(recordFieldOf(manifest, 'dsh'), 'workbench'), 'market');
  market.labels = [...labels];
}

export function mergeEntryLabels(entry, labels) {
  if (!Array.isArray(labels) || labels.length === 0) return entry;
  const wanted = [...labels];
  if (isDeepStrictEqual(entry.metadata?.labels ?? [], wanted)) return entry;
  return { ...entry, metadata: { ...(entry.metadata ?? {}), labels: wanted } };
}

export function entryMetaOf(manifest) {
  const author = authorOf(manifest);
  const homepage = typeof manifest.homepage === 'string' ? manifest.homepage.trim() : '';
  const keywords = textListOf(manifest.keywords);
  const marketRecord = recordOf(manifest.dsh?.workbench?.market);
  const category = typeof marketRecord.category === 'string' ? marketRecord.category.trim() : '';
  const labels = labelsOfManifest(manifest);
  const order = manifest.dsh?.workbench?.card?.order;
  const unit = unitOf(manifest);
  const title = titleOf(manifest);
  const description = descriptionOf(manifest);
  return {
    ...(title === undefined ? {} : { title }),
    ...(description === undefined ? {} : { description }),
    ...(author === '' ? {} : { author }),
    ...(homepage === '' ? {} : { homepage }),
    metadata: {
      workbench: true,
      ...(unit === '' ? {} : { unit }),
      ...(category === '' ? {} : { category }),
      ...(labels.length === 0 ? {} : { labels }),
      ...(keywords.length === 0 ? {} : { keywords }),
      ...(typeof order === 'number' ? { sortKeys: { order } } : {}),
    },
  };
}

export function indexEntryOf(input) {
  const manifest = input.manifest;
  const dsh = manifest.engines?.dsh;
  const owner = authorTextOf(manifest);
  return {
    name: manifest.name,
    ...(owner === '' ? {} : { owner }),
    ...entryMetaOf(manifest),
    versions: [
      {
        version: input.version,
        publishTimestamp: Math.floor(input.at / 1000),
        source: input.source,
        ...(typeof dsh === 'string' && dsh.trim() !== '' ? { engines: { dsh: dsh.trim() } } : {}),
      },
    ],
  };
}

function readSources(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    const record = parsed !== null && typeof parsed === 'object' ? parsed : {};
    const sources = Array.isArray(record.sources) ? record.sources : [];
    const selected = typeof record.selected === 'string' ? record.selected : null;
    return { sources, selected };
  } catch {
    return { sources: [], selected: null };
  }
}

function planOf(raw, args, fallbackPolicy, origin) {
  if (raw === null || typeof raw !== 'object') return undefined;
  if (raw.kind !== 'git') return undefined;
  const url = typeof raw.url === 'string' ? raw.url.trim() : '';
  const localPath = typeof raw.localPath === 'string' && raw.localPath.trim() !== '' ? resolve(raw.localPath.trim()) : '';
  if (url === '' && localPath === '') return undefined;
  if (url !== '' && !gitUrlOk(url)) return undefined;
  const ref = (argValue(args, '--index-ref') ?? (typeof raw.ref === 'string' ? raw.ref : '')).trim();
  const path = (argValue(args, '--index-path') ?? (typeof raw.path === 'string' ? raw.path : '')).trim();
  const fromArgument = statedPolicy(argValue(args, '--index-policy'));
  const fromSource = statedPolicy(raw.policy);
  return {
    source: {
      kind: 'git',
      url,
      ...(ref === '' ? {} : { ref }),
      ...(path === '' ? {} : { path }),
      ...(localPath === '' ? {} : { localPath }),
    },
    policy: fromArgument ?? fromSource ?? fallbackPolicy,
    policyStated: fromArgument !== undefined || fromSource !== undefined,
    origin,
  };
}

export function resolveIndexPlan({ args = [], home, exec }) {
  const asked = (argValue(args, '--index') ?? 'auto').trim();
  if (asked === 'none') return undefined;
  const plan =
    asked !== 'auto' && asked !== ''
      ? planFromArgument(asked, args, exec)
      : planFromSources(join(workbenchRootOf(home), 'market-index', 'sources.json'), args);
  if (plan === undefined) {
    if (asked === 'auto' || asked === '') return undefined;
    throw new MarketIndexError(
      `这个工坊还没配可写的 git 索引源。给我一个能推的 git 仓库（或它在本机的 clone 路径），我配成索引源并建一份 ${MARKET_DIR}/。`,
      'index-write',
    );
  }
  if (plan.source.url === '' && plan.source.localPath !== undefined) {
    const remote = exec('git', ['-C', plan.source.localPath, 'remote', 'get-url', 'origin'], {
      capture: true,
      allowFailure: true,
    });
    const url = remote.status === 0 ? remote.stdout.trim() : '';
    if (url === '') {
      throw new MarketIndexError(`索引目录没有 origin 远端：${plan.source.localPath}`, 'index-write');
    }
    plan.source.url = url;
  }
  return plan;
}

function planFromArgument(asked, args, exec) {
  const asDir = resolve(asked);
  if (existsSync(asDir)) {
    const remote = exec('git', ['-C', asDir, 'remote', 'get-url', 'origin'], { capture: true, allowFailure: true });
    const url = remote.status === 0 ? remote.stdout.trim() : '';
    const plan = planOf({ kind: 'git', url, localPath: asDir }, args, 'artifacts-in-repo', 'argument');
    if (plan === undefined) {
      throw new MarketIndexError(`--index 指的目录不是 git 仓库或没有 origin：${asDir}`, 'index-write');
    }
    return plan;
  }
  if (!gitUrlOk(asked)) {
    throw new MarketIndexError(`--index 只认 none / 目录 / git 地址（收到「${asked}」）`, 'index-write');
  }
  return planOf({ kind: 'git', url: asked }, args, 'catalog-only', 'argument');
}

function findBySourceId(payload, id) {
  const found = payload.sources.find((one) => one?.id === id);
  if (found === undefined) {
    const known = payload.sources.map((one) => one?.id).filter((one) => typeof one === 'string').join('、') || '（空）';
    throw new MarketIndexError(`没有这个索引源：${id}。现有的：${known}`, 'index-write');
  }
  if (found.kind !== 'git') {
    throw new MarketIndexError(`索引源 ${id} 是 http 地址，只能读，不能当发布目的地`, 'index-write');
  }
  return found;
}

function planFromSources(file, args) {
  const payload = readSources(file);
  const asked = (argValue(args, '--index-source') ?? '').trim();
  let found;
  if (asked !== '') {
    found = findBySourceId(payload, asked);
  } else {
    const publishable = payload.sources.filter((one) => one?.kind === 'git' && one.policy === 'artifacts-in-repo');
    if (publishable.length === 1) {
      found = publishable[0];
    } else if (publishable.length > 1) {
      found = publishable.find((one) => one.id === payload.selected);
      if (found === undefined) {
        const ids = publishable.map((one) => one.id).join('、');
        throw new MarketIndexError(`有多个可发布的索引源（${ids}）—— 用 --index-source 指定发到哪一个`, 'index-write');
      }
    } else {
      found = payload.sources.find((one) => one?.id === payload.selected);
    }
  }
  const plan = planOf(found ?? null, args, 'catalog-only', 'sources');
  return plan === undefined || found === undefined || found === null || typeof found.id !== 'string'
    ? plan
    : { ...plan, sourceId: found.id };
}

function runGit(exec, cwd, argv, { allowFailure = false } = {}) {
  return exec('git', ['-C', cwd, ...argv], { capture: true, allowFailure });
}

function currentBranch(exec, cwd) {
  const result = runGit(exec, cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const branch = result.status === 0 ? result.stdout.trim() : '';
  if (branch === '' || branch === 'HEAD') {
    throw new MarketIndexError('索引仓库不在一个分支上（detached HEAD）——切回分支再发', 'index-write');
  }
  return branch;
}

function worktreeOf(plan, exec, home) {
  const source = plan.source;
  if (source.localPath !== undefined) return source.localPath;
  const base = join(workbenchRootOf(home), 'market-index', marketSourceKey(source));
  const workdir = join(base, 'worktree');
  if (existsSync(workdir)) return workdir;
  mkdirSync(base, { recursive: true });
  const branch = source.ref === undefined ? [] : ['--branch', source.ref];
  const cloned = exec('git', ['clone', ...branch, source.url, workdir], { capture: true, allowFailure: true });
  if (cloned.status !== 0) {
    rmSync(workdir, { recursive: true, force: true });
    throw new MarketIndexError(
      `索引仓库克隆不下来：${tailOf(`${cloned.stdout}\n${cloned.stderr}`)}`,
      'index-write',
      `git clone ${source.url} ${workdir}`,
    );
  }
  return workdir;
}

function assertClean(exec, workdir) {
  const status = runGit(exec, workdir, ['status', '--porcelain', '--untracked-files=all']);
  if (status.status !== 0) throw new MarketIndexError(`读不了索引仓库状态：${tailOf(status.stderr)}`, 'index-write');
  const dirty = status.stdout.trim();
  if (dirty !== '') {
    throw new MarketIndexError(
      `索引仓库的工作区不干净（${dirty.split('\n').slice(0, 3).join('、')}）——先提交/暂存，再发`,
      'index-write',
    );
  }
}

function commitOf(exec, workdir, message, identity) {
  const added = runGit(exec, workdir, ['add', '-A'], { allowFailure: true });
  if (added.status !== 0) throw new MarketIndexError(`git add 没过：${tailOf(`${added.stdout}\n${added.stderr}`)}`);
  const who = [];
  if (identity !== undefined) {
    who.push('-c', `user.name=${identity.name}`);
    if (identity.email !== undefined) who.push('-c', `user.email=${identity.email}`);
  }
  const committed = runGit(exec, workdir, [...who, 'commit', '-m', message], { allowFailure: true });
  const text = `${committed.stdout}\n${committed.stderr}`;
  if (committed.status !== 0 && !/nothing to commit|no changes added|无文件要提交/i.test(text)) {
    throw new MarketIndexError(`git commit 没过：${tailOf(text)}`);
  }
  const head = runGit(exec, workdir, ['rev-parse', 'HEAD']);
  return head.status === 0 ? head.stdout.trim() : '';
}

function pushOf(exec, workdir, branch, remote = 'origin') {
  return runGit(exec, workdir, ['push', remote, `HEAD:refs/heads/${branch}`], { allowFailure: true });
}

function shortOf(value) {
  return typeof value === 'string' && value.length >= 7 ? value.slice(0, 7) : String(value ?? '');
}

function remoteHeadOf(exec, workdir, branch) {
  const result = runGit(exec, workdir, ['ls-remote', 'origin', `refs/heads/${branch}`], { allowFailure: true });
  if (result.status !== 0) {
    throw new MarketIndexError(`核不了远端分支 ${branch}：${tailOf(result.stderr)}`, 'index-write');
  }
  const line = result.stdout.trim().split('\n')[0] ?? '';
  return line.split(/\s+/)[0] ?? '';
}

function copyArtifacts(root, workdir, name, version, manifest) {
  if (!SAFE_PACKAGE_NAME.test(name)) {
    throw new MarketIndexError(`包名不是合法 npm 名，没法当产物目录：${JSON.stringify(name)}`, 'index-write');
  }
  const path = marketArtifactPathFor(name, version);
  const dest = join(workdir, path);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  for (const dir of ARTIFACT_DIRS) {
    const src = join(root, dir);
    if (existsSync(src)) cpSync(src, join(dest, dir), { recursive: true });
  }
  for (const file of ARTIFACT_FILES) {
    const src = join(root, file);
    if (existsSync(src)) copyFileSync(src, join(dest, file));
  }
  writeFileSync(join(dest, 'package.json'), `${JSON.stringify(sanitizeManifest(manifest), null, 2)}\n`);
  return path;
}

function publishSourceOf(publish) {
  if (publish.git !== undefined) {
    return {
      type: 'git',
      url: publish.git.url,
      commit: publish.git.commit,
      ...(publish.git.path === undefined || publish.git.path === '' || publish.git.path === '.'
        ? {}
        : { path: publish.git.path }),
    };
  }
  if (publish.registry !== undefined && publish.registry !== '') {
    return { type: 'npm', registry: publish.registry };
  }
  return undefined;
}

export function marketClaim({ plan, exec, home, name, unit, publisher }) {
  const workdir = worktreeOf(plan, exec, home);
  return claimOf(readWorktreeIndex(workdir, indexPathOf(plan)), {
    name,
    publisher,
    unit,
    artifactPath: marketArtifactRoot(name),
  });
}

const META_KEYS = ['title', 'description', 'author', 'owner', 'homepage', 'icon', 'metadata'];

function withCurrentMeta(entry, current, update) {
  if (current === undefined) return entry;
  const next = { ...entry };
  if (!update) {
    for (const key of META_KEYS) {
      if (key === 'owner') continue;
      if (current[key] === undefined) delete next[key];
      else next[key] = current[key];
    }
  }
  if (current.owner !== undefined) next.owner = current.owner;
  return next;
}

export function updateMarketIndex(options) {
  const { plan, exec, home, root, manifest, version, publish, now, resume, onStep } = options;
  const unit = options.unit ?? unitOf(manifest);
  const publisher = options.publisher ?? authorTextOf(manifest);
  const entryName = `${manifest.name}@${version}`;
  let base = { kind: 'git', url: plan.source.url, entry: entryName };
  let phase = 'start';
  const report = (step) => {
    if (typeof step.phase === 'string') phase = step.phase;
    try {
      onStep?.(step);
    } catch {
      return;
    }
  };
  try {
    const workdir = worktreeOf(plan, exec, home);
    const dir = indexPathOf(plan);
    const branch = plan.source.ref ?? resume?.branch ?? currentBranch(exec, workdir);
    base = { ...base, branch };
    if (resume !== undefined) {
      if (plan.source.localPath === undefined) {
        const fetched = runGit(exec, workdir, ['fetch', 'origin', branch], { allowFailure: true });
        if (fetched.status === 0) runGit(exec, workdir, ['reset', '--hard', `origin/${branch}`], { allowFailure: true });
        runGit(exec, workdir, ['clean', '-fd', '--', marketArtifactPathFor(manifest.name, version), dir], {
          allowFailure: true,
        });
      }
      rmSync(join(workdir, dir, manifest.name, `${version}.json`), { force: true });
    } else {
      assertClean(exec, workdir);
    }
    if (typeof resume?.indexCommit === 'string' && resume.indexCommit !== '' && resume.indexPushed === true) {
      const remote = remoteHeadOf(exec, workdir, branch);
      if (remote === resume.indexCommit) {
        report({ phase: 'remote-checked', indexCommit: resume.indexCommit, indexPushed: true });
        return {
          ...base,
          ...(typeof resume.path === 'string' ? { path: resume.path } : {}),
          commit: typeof resume.artifactCommit === 'string' ? resume.artifactCommit : resume.indexCommit,
          updated: true,
          resumed: true,
        };
      }
    }
    if (publisher === '') throw new MarketIndexError(missingPublisherText(), 'market-owner');
    syncWorktree(exec, workdir, branch);
    const baseSha = revOf(exec, workdir, 'HEAD');
    const claimInput = {
      name: manifest.name,
      publisher,
      unit,
      version,
      artifactPath: marketArtifactRoot(manifest.name),
    };
    ensureClaimFree(workdir, dir, claimInput);
    ensureVersionFree(workdir, dir, claimInput);
    let source;
    let artifactPath;
    let artifactSha = '';
    let indexSha = '';
    if (plan.policy === 'artifacts-in-repo') {
      report({ phase: 'artifacts' });
      const done = replicatePush(exec, workdir, branch, baseSha, () => {
        ensureClaimFree(workdir, dir, claimInput);
        migrateLegacyIndex(workdir, dir);
        artifactPath = copyArtifacts(root, workdir, manifest.name, version, manifest);
        report({ phase: 'artifacts-copied' });
        artifactSha = commitOf(exec, workdir, `chore(release): ${entryName}`, identityOf(manifest));
        report({ phase: 'artifacts-committed', artifactCommit: artifactSha });
        return artifactSha;
      });
      if (!done.ok) {
        phase = 'artifacts';
        throw new MarketIndexError(
          `产物提交推不上去（分支保护或权限）：本地 commit ${artifactSha}；去合并/给权限后跟我说，我补索引。${done.reason}`,
          done.code,
          `git -C ${workdir} push origin HEAD:refs/heads/${branch}`,
        );
      }
      report({ phase: 'artifacts-pushed', artifactCommit: artifactSha, artifactPushed: true });
      source = { type: 'git', url: plan.source.url, commit: artifactSha, path: artifactPath };
    } else {
      source = publishSourceOf(publish ?? {});
      if (source === undefined) throw new MarketIndexError('这个出口没有可写进索引的 source（tarball 不进索引）', 'index-write');
      if (source.type === 'npm' && source.registry === 'https://registry.npmjs.org/') delete source.registry;
    }
    const entry = indexEntryOf({ manifest, version, source, at: now() });
    report({ phase: 'index' });
    const indexed = replicatePush(exec, workdir, branch, baseSha, () => {
      if (plan.policy !== 'artifacts-in-repo') migrateLegacyIndex(workdir, dir);
      ensureClaimFree(workdir, dir, claimInput);
      const current = readWorktreeIndex(workdir, dir).plugins.find((one) => one.name === manifest.name);
      const base = withCurrentMeta(entry, current, options.metadata === true);
      const written = mergeEntryLabels(base, options.labels);
      if (current === undefined || options.metadata === true || written !== base) {
        writeMetaFile(workdir, dir, written, now());
      }
      writeEntryFile(workdir, dir, written, written.versions[0]);
      indexSha = commitOf(exec, workdir, `chore(market): ${entryName}`, identityOf(manifest));
      report({ phase: 'index-committed', indexCommit: indexSha });
      return indexSha;
    });
    if (!indexed.ok) {
      phase = 'index';
      throw new MarketIndexError(
        indexed.code === 'git-market-protected' || indexed.code === 'git-auth'
          ? `模块已进仓库、索引没更新（本地 commit ${indexSha}）：${indexed.reason}`
          : indexed.reason,
        indexed.code,
      );
    }
    report({ phase: 'index-pushed', indexCommit: indexSha, indexPushed: true });
    const headSha = revOf(exec, workdir, 'HEAD');
    const remoteHead = remoteHeadOf(exec, workdir, branch);
    if (headSha === '' || remoteHead !== headSha) {
      phase = 'remote-check';
      throw new MarketIndexError(
        `${plan.policy === 'artifacts-in-repo' ? '两个 commit 没都推上去' : '索引提交没推上去'}：` +
          `远端 ${branch} 是 ${shortOf(remoteHead)}，本地是 ${shortOf(headSha)}`,
        'git-market-pushed',
      );
    }
    report({ phase: 'remote-checked' });
    return {
      ...base,
      ...(artifactPath === undefined ? {} : { path: artifactPath }),
      commit: source.type === 'git' ? source.commit : indexSha,
      updated: true,
      phase: 'done',
    };
  } catch (error) {
    return {
      ...base,
      updated: false,
      phase,
      code: error instanceof MarketIndexError ? error.step : undefined,
      reason: messageOf(error),
    };
  }
}

export function refreshMarketEntry(options) {
  const { plan, exec, home, manifest } = options;
  const publisher = options.publisher ?? authorTextOf(manifest);
  const unit = options.unit ?? unitOf(manifest);
  let base = { kind: 'git', url: plan.source.url, entry: manifest.name };
  let phase = 'start';
  try {
    const workdir = worktreeOf(plan, exec, home);
    const dir = indexPathOf(plan);
    if (publisher === '') throw new MarketIndexError(missingPublisherText(), 'market-owner');
    assertClean(exec, workdir);
    const branch = plan.source.ref ?? currentBranch(exec, workdir);
    base = { ...base, branch };
    syncWorktree(exec, workdir, branch);
    const index = readWorktreeIndex(workdir, dir);
    const existing = index.plugins.find((one) => one.name === manifest.name);
    if (existing === undefined) {
      throw new MarketIndexError(`${manifest.name} 还不在索引里 —— 先正常发一版`, 'index-write');
    }
    const claim = claimOf(index, {
      name: manifest.name,
      publisher,
      unit,
      artifactPath: marketArtifactRoot(manifest.name),
    });
    if (claim.state === 'conflict' || claim.state === 'unit-taken' || claim.state === 'path-taken') {
      throw new MarketIndexError(claimProblemText(manifest.name, claim, unit), 'market-owner');
    }
    const latest = existing.versions[0]?.version ?? '';
    const meta = entryMetaOf(manifest);
    const next = { ...existing };
    for (const key of ['title', 'description', 'author', 'homepage', 'metadata']) {
      if (Object.hasOwn(meta, key)) next[key] = meta[key];
      else delete next[key];
    }
    if (isDeepStrictEqual(next, existing)) {
      return { ...base, updated: false, unchanged: true, version: latest, phase: 'done' };
    }
    const at = Date.now();
    const baseSha = revOf(exec, workdir, 'HEAD');
    const done = replicatePush(exec, workdir, branch, baseSha, () => {
      writeMetaFile(workdir, dir, next, at);
      return commitOf(exec, workdir, `chore(market): refresh ${manifest.name}`, identityOf(manifest));
    });
    if (!done.ok) throw new MarketIndexError(done.reason, done.code);
    const headSha = revOf(exec, workdir, 'HEAD');
    const remoteHead = remoteHeadOf(exec, workdir, branch);
    if (headSha === '' || remoteHead !== headSha) {
      phase = 'remote-check';
      throw new MarketIndexError(
        `索引没推上去：远端 ${branch} 是 ${shortOf(remoteHead)}，本地是 ${shortOf(headSha)}`,
        'git-market-pushed',
      );
    }
    return { ...base, updated: true, version: latest, commit: done.sha, phase: 'done' };
  } catch (error) {
    return {
      ...base,
      updated: false,
      phase,
      code: error instanceof MarketIndexError ? error.step : undefined,
      reason: messageOf(error),
    };
  }
}

function hasHead(exec, workdir) {
  return runGit(exec, workdir, ['rev-parse', '--verify', 'HEAD'], { allowFailure: true }).status === 0;
}

function isGithub(url) {
  try {
    return new URL(url).hostname.toLowerCase() === 'github.com';
  } catch {
    return /^[\w.-]+@github\.com:/i.test(url);
  }
}

function defaultBranchOf(exec, workdir, url, ref) {
  const asked = String(ref ?? '').trim();
  if (asked !== '') return asked;
  const symref = runGit(exec, workdir, ['symbolic-ref', '--short', 'HEAD'], { allowFailure: true });
  const branch = symref.status === 0 ? symref.stdout.trim() : '';
  if (branch !== '') return branch;
  if (isGithub(url)) return 'main';
  throw new MarketIndexError(
    '空仓库要先知道建哪个分支：用 --ref <分支> 指定（例如 main / master）。',
    'index-init',
  );
}

export function initializeMarketRepo(options) {
  const { exec, home, url, dir, ref, indexPath = MARKET_DIR, readme = true } = options;
  let workdir;
  let remote = String(url ?? '').trim();
  if (dir !== undefined) {
    workdir = resolve(dir);
    if (!existsSync(join(workdir, '.git'))) {
      throw new MarketIndexError(`不是一个 git 工作区：${workdir}`, 'index-init');
    }
    const origin = runGit(exec, workdir, ['remote', 'get-url', 'origin'], { allowFailure: true });
    if (origin.status !== 0 || origin.stdout.trim() === '') {
      throw new MarketIndexError(`索引目录没有 origin 远端：${workdir}`, 'index-init');
    }
    remote = origin.stdout.trim();
  } else {
    if (!gitUrlOk(remote)) throw new MarketIndexError(`不是可用的 git 地址：${remote}`, 'index-init');
    workdir = worktreeOf({ source: { kind: 'git', url: remote } }, exec, home);
  }
  assertClean(exec, workdir);
  const head = hasHead(exec, workdir);
  const branch = head ? currentBranch(exec, workdir) : defaultBranchOf(exec, workdir, remote, ref);
  if (!head) {
    const switched = runGit(exec, workdir, ['checkout', '-B', branch], { allowFailure: true });
    if (switched.status !== 0) throw new MarketIndexError(`建分支 ${branch} 没过：${tailOf(switched.stderr)}`, 'index-init');
  }
  const created = migrateLegacyIndex(workdir, indexPath);
  const indexDir = join(workdir, indexPath);
  const marker = join(indexDir, 'README.md');
  if (!existsSync(marker)) {
    mkdirSync(indexDir, { recursive: true });
    writeFileSync(marker, MARKET_ENTRIES_README_LINES.join('\n'));
    created.push(`${indexPath}/README.md`);
  }
  const readmeFile = join(workdir, 'README.md');
  if (readme && !existsSync(readmeFile)) {
    writeFileSync(readmeFile, `${MARKET_INDEX_README_LINES.join('\n')}`);
    created.push('README.md');
  }
  let commit;
  if (created.length > 0) {
    const added = runGit(exec, workdir, ['add', ...created], { allowFailure: true });
    if (added.status !== 0) throw new MarketIndexError(`git add 没过：${tailOf(added.stderr)}`, 'index-init');
    commit = commitOf(exec, workdir, 'chore: init market index');
    const pushed = pushOf(exec, workdir, branch);
    if (pushed.status !== 0) {
      throw new MarketIndexError(
        `初始化提交推不上去：${tailOf(`${pushed.stdout}\n${pushed.stderr}`)}`,
        'index-init',
        `git -C ${workdir} push origin HEAD:refs/heads/${branch}`,
      );
    }
  } else {
    const current = runGit(exec, workdir, ['rev-parse', 'HEAD'], { allowFailure: true });
    commit = current.status === 0 ? current.stdout.trim() : '';
  }
  return { ok: true, url: remote, branch, commit, created, changed: created.length > 0, firstBranch: !head };
}

export function marketVersionExists({ plan, exec, home, name, version }) {
  try {
    const workdir = worktreeOf(plan, exec, home);
    const entry = readWorktreeIndex(workdir, indexPathOf(plan)).plugins.find((one) => one.name === name);
    return entry?.versions.some((one) => one.version === version) === true;
  } catch {
    return false;
  }
}

export function verifyMarketArtifact({ plan, exec, home, name, path, commit }) {
  const workdir = worktreeOf(plan, exec, home);
  const found = runGit(exec, workdir, ['cat-file', '-e', `${commit}^{commit}`], { allowFailure: true });
  if (found.status !== 0) {
    throw new MarketIndexError(`索引仓库里找不到 commit ${commit}`, 'market-verify');
  }
  const tree = runGit(exec, workdir, ['ls-tree', '-r', '--name-only', commit], { allowFailure: true });
  if (tree.status !== 0) {
    throw new MarketIndexError(`读不了 commit ${commit} 的内容：${tailOf(tree.stderr)}`, 'market-verify');
  }
  const artifactPath = typeof path === 'string' && path !== '' ? path : marketArtifactPath(name);
  const prefix = `${artifactPath}/`;
  const files = tree.stdout
    .split('\n')
    .map((one) => one.trim())
    .filter((one) => one.startsWith(prefix))
    .map((one) => one.slice(prefix.length));
  return { path: artifactPath, files };
}

