import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import {
  MARKET_INDEX_README_LINES,
  MARKET_INDEX_SEED,
  claimOf,
  gitUrlOk,
  marketArtifactPath,
  marketSourceKey,
  parseMarketIndexJson,
  upsertMarketEntry,
} from '@dsh-workbench/shared/host';

const MARKET_FILE = 'market.json';
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

export function claimProblemText(name, claim) {
  if (claim.state === 'path-taken') {
    return (
      `市场仓库里的 ${marketArtifactPath(name)} 已经被 ${claim.entry} 占了 —— 一个产物目录只能放一个包。` +
      '换一个包名再发；确实是接手，让索引维护者先把那一条处理掉。'
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

function claimOfIndexFile(workdir, indexPath, input) {
  const file = join(workdir, indexPath);
  if (!existsSync(file)) return { state: 'new' };
  const parsed = parseMarketIndexJson(readFileSync(file, 'utf8'));
  if (!parsed.ok) {
    throw new MarketIndexError(
      `${indexPath} 不合 format 1：${parsed.problems.map((one) => one.detail).join('；')}`,
      'index-write',
    );
  }
  return claimOf(parsed.index, input);
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

export function entryMetaOf(manifest) {
  const author = authorOf(manifest);
  const homepage = typeof manifest.homepage === 'string' ? manifest.homepage.trim() : '';
  const keywords = textListOf(manifest.keywords);
  const market = manifest.dsh?.workbench?.market;
  const marketRecord = market !== null && typeof market === 'object' && !Array.isArray(market) ? market : {};
  const category = typeof marketRecord.category === 'string' ? marketRecord.category.trim() : '';
  const labels = textListOf(marketRecord.labels);
  const order = manifest.dsh?.workbench?.card?.order;
  const title = titleOf(manifest);
  const description = descriptionOf(manifest);
  return {
    ...(title === undefined ? {} : { title }),
    ...(description === undefined ? {} : { description }),
    ...(author === '' ? {} : { author }),
    ...(homepage === '' ? {} : { homepage }),
    metadata: {
      workbench: true,
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

export function mergeIndexText(text, entry) {
  const raw = String(text ?? '').trim();
  const parsed = raw === '' ? { ok: true, index: { format: 1, plugins: [] } } : parseMarketIndexJson(raw);
  if (!parsed.ok) return { ok: false, problems: parsed.problems };
  const merged = upsertMarketEntry(parsed.index, entry);
  const checked = parseMarketIndexJson(JSON.stringify(merged));
  if (!checked.ok) return { ok: false, problems: checked.problems };
  return { ok: true, text: `${JSON.stringify(checked.index, null, 2)}\n` };
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
      `这个工坊还没配可写的 git 索引源。给我一个能推的 git 仓库（或它在本机的 clone 路径），我配成索引源并建一份 ${MARKET_FILE}。`,
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

function copyArtifacts(root, workdir, name, manifest) {
  if (!SAFE_PACKAGE_NAME.test(name)) {
    throw new MarketIndexError(`包名不是合法 npm 名，没法当产物目录：${JSON.stringify(name)}`, 'index-write');
  }
  const path = marketArtifactPath(name);
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

function writeEntry(workdir, indexPath, entry, publisher) {
  const file = join(workdir, indexPath);
  const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (publisher === '') throw new MarketIndexError(missingPublisherText(), 'market-owner');
  const claim = claimOfIndexFile(workdir, indexPath, {
    name: entry.name,
    publisher,
    artifactPath: entry.versions[0]?.source?.type === 'git' ? entry.versions[0].source.path : undefined,
  });
  if (claim.state === 'conflict' || claim.state === 'path-taken') {
    throw new MarketIndexError(claimProblemText(entry.name, claim), 'market-owner');
  }
  const merged = mergeIndexText(current, entry);
  if (!merged.ok) {
    throw new MarketIndexError(
      `${indexPath} 不合 format 1：${merged.problems.map((one) => one.detail).join('；')}`,
      'index-write',
    );
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, merged.text);
}

function resetToRemote(exec, workdir, branch) {
  const fetched = runGit(exec, workdir, ['fetch', 'origin', branch], { allowFailure: true });
  if (fetched.status !== 0) return false;
  const reset = runGit(exec, workdir, ['reset', '--hard', `origin/${branch}`], { allowFailure: true });
  return reset.status === 0;
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

export function marketClaim({ plan, exec, home, name, publisher }) {
  const workdir = worktreeOf(plan, exec, home);
  return claimOfIndexFile(workdir, plan.source.path ?? MARKET_FILE, {
    name,
    publisher,
    artifactPath: marketArtifactPath(name),
  });
}

export function updateMarketIndex(options) {
  const { plan, exec, home, root, manifest, version, publish, now, resume, onStep } = options;
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
    const indexPath = plan.source.path ?? MARKET_FILE;
    if (resume !== undefined && plan.source.localPath === undefined) {
      runGit(exec, workdir, ['reset', '--hard', 'HEAD'], { allowFailure: true });
      runGit(exec, workdir, ['clean', '-fd', '--', marketArtifactPath(manifest.name), indexPath], {
        allowFailure: true,
      });
    } else {
      assertClean(exec, workdir);
    }
    const branch = plan.source.ref ?? resume?.branch ?? currentBranch(exec, workdir);
    base = { ...base, branch };
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
    const claim = claimOfIndexFile(workdir, indexPath, {
      name: manifest.name,
      publisher,
      artifactPath: marketArtifactPath(manifest.name),
    });
    if (claim.state === 'conflict' || claim.state === 'path-taken') {
      throw new MarketIndexError(claimProblemText(manifest.name, claim), 'market-owner');
    }
    let source;
    let artifactPath;
    if (plan.policy === 'artifacts-in-repo') {
      report({ phase: 'artifacts' });
      artifactPath = copyArtifacts(root, workdir, manifest.name, manifest);
      report({ phase: 'artifacts-copied' });
      const sha = commitOf(exec, workdir, `chore(release): ${entryName}`, identityOf(manifest));
      report({ phase: 'artifacts-committed', artifactCommit: sha });
      const pushed = pushOf(exec, workdir, branch);
      if (pushed.status !== 0) {
        phase = 'artifacts';
        throw new MarketIndexError(
          `产物提交推不上去（分支保护或权限）：本地 commit ${sha}；去合并/给权限后跟我说，我补索引。${tailOf(`${pushed.stdout}\n${pushed.stderr}`)}`,
          'git-market-protected',
          `git -C ${workdir} push origin HEAD:refs/heads/${branch}`,
        );
      }
      report({ phase: 'artifacts-pushed', artifactCommit: sha, artifactPushed: true });
      source = { type: 'git', url: plan.source.url, commit: sha, path: artifactPath };
    } else {
      source = publishSourceOf(publish ?? {});
      if (source === undefined) throw new MarketIndexError('这个出口没有可写进索引的 source（tarball 不进索引）', 'index-write');
      if (source.type === 'npm' && source.registry === 'https://registry.npmjs.org/') delete source.registry;
    }
    const entry = indexEntryOf({ manifest, version, source, at: now() });
    report({ phase: 'index' });
    writeEntry(workdir, indexPath, entry, publisher);
    let indexSha = commitOf(exec, workdir, `chore(market): ${entryName}`, identityOf(manifest));
    report({ phase: 'index-committed', indexCommit: indexSha });
    const pushed = pushOf(exec, workdir, branch);
    if (pushed.status !== 0) {
      const replayed = resetToRemote(exec, workdir, branch);
      if (!replayed) {
        phase = 'index';
        throw new MarketIndexError(
          `模块已进仓库、索引没更新（本地 commit ${indexSha}）：${tailOf(`${pushed.stdout}\n${pushed.stderr}`)}`,
        );
      }
      writeEntry(workdir, indexPath, entry, publisher);
      indexSha = commitOf(exec, workdir, `chore(market): ${entryName}`, identityOf(manifest));
      report({ phase: 'index-committed', indexCommit: indexSha });
      const retried = pushOf(exec, workdir, branch);
      if (retried.status !== 0) {
        phase = 'index';
        throw new MarketIndexError(`模块已进仓库、索引没更新：${tailOf(`${retried.stdout}\n${retried.stderr}`)}`);
      }
    }
    report({ phase: 'index-pushed', indexCommit: indexSha, indexPushed: true });
    const local = runGit(exec, workdir, ['rev-parse', 'HEAD']);
    const headSha = local.status === 0 ? local.stdout.trim() : '';
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
  let base = { kind: 'git', url: plan.source.url, entry: manifest.name };
  let phase = 'start';
  try {
    const workdir = worktreeOf(plan, exec, home);
    const indexPath = plan.source.path ?? MARKET_FILE;
    if (publisher === '') throw new MarketIndexError(missingPublisherText(), 'market-owner');
    assertClean(exec, workdir);
    const branch = plan.source.ref ?? currentBranch(exec, workdir);
    base = { ...base, branch };
    const file = join(workdir, indexPath);
    if (!existsSync(file)) throw new MarketIndexError(`索引里还没有 ${indexPath} —— 先正常发一版`, 'index-write');
    const parsed = parseMarketIndexJson(readFileSync(file, 'utf8'));
    if (!parsed.ok) {
      throw new MarketIndexError(
        `${indexPath} 不是 format 1：${parsed.problems.map((one) => one.detail).join('；')}`,
        'index-write',
      );
    }
    const existing = parsed.index.plugins.find((one) => one.name === manifest.name);
    if (existing === undefined) {
      throw new MarketIndexError(`${manifest.name} 还不在索引里 —— 先正常发一版`, 'index-write');
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
    writeEntry(workdir, indexPath, next, publisher);
    let indexSha = commitOf(exec, workdir, `chore(market): refresh ${manifest.name}`, identityOf(manifest));
    const pushed = pushOf(exec, workdir, branch);
    if (pushed.status !== 0) {
      const replayed = resetToRemote(exec, workdir, branch);
      if (!replayed) {
        throw new MarketIndexError(`元数据没推上去（本地 commit ${indexSha}）：${tailOf(pushed.stderr)}`, 'index-write');
      }
      writeEntry(workdir, indexPath, next, publisher);
      indexSha = commitOf(exec, workdir, `chore(market): refresh ${manifest.name}`, identityOf(manifest));
      const retried = pushOf(exec, workdir, branch);
      if (retried.status !== 0) {
        throw new MarketIndexError(`元数据没推上去：${tailOf(retried.stderr)}`, 'index-write');
      }
    }
    const head = runGit(exec, workdir, ['rev-parse', 'HEAD']);
    const headSha = head.status === 0 ? head.stdout.trim() : '';
    const remoteHead = remoteHeadOf(exec, workdir, branch);
    if (headSha === '' || remoteHead !== headSha) {
      phase = 'remote-check';
      throw new MarketIndexError(
        `索引没推上去：远端 ${branch} 是 ${shortOf(remoteHead)}，本地是 ${shortOf(headSha)}`,
        'git-market-pushed',
      );
    }
    return { ...base, updated: true, version: latest, commit: indexSha, phase: 'done' };
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
  const { exec, home, url, dir, ref, indexPath = MARKET_FILE, readme = true } = options;
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
  const created = [];
  const file = join(workdir, indexPath);
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, MARKET_INDEX_SEED);
    created.push(indexPath);
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
    const file = join(workdir, plan.source.path ?? MARKET_FILE);
    if (!existsSync(file)) return false;
    const parsed = parseMarketIndexJson(readFileSync(file, 'utf8'));
    if (!parsed.ok) return false;
    const entry = parsed.index.plugins.find((one) => one.name === name);
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

export { MARKET_FILE };
