import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import semver from 'semver';

import { DESIGN_FILE, acceptanceOf } from './design.mjs';
import {
  advanceRun,
  artifactFingerprintOf,
  finishRun,
  interruptRun,
  readState,
  removeState,
  resumableState,
  startRun,
  writeState,
} from './release-journal.mjs';
import { emit, installOf, marketInstallOf, stateOf } from './release-report.mjs';
import { authorChangeOf } from './release-changelog.mjs';
import { CHANGELOG_FILE, CHANGELOG_KINDS, changelogDate } from '@dsh-workbench/shared/host';
import { applyChangelog, changelogProblemOf } from './changelog.mjs';
import {
  NeedsUser,
  ReleaseError,
  ResumableError,
  argValue,
  defaultExec,
  dshHomeOf,
  hasFlag,
  tailOf,
} from './release-util.mjs';
import {
  TARGETS,
  checkLogin,
  licenseOf,
  repositoryOf,
  targetInfoOf,
  targetOf,
} from './release-target.mjs';
import {
  checkGitFiles,
  checkPublished,
  localFiles,
  packTarball,
  publishRegistry,
  registryExists,
  verifyRegistry,
} from './release-publish.mjs';
import {
  MarketIndexError,
  identityOf,
  marketVersionExists,
  refreshMarketEntry,
  resolveIndexPlan,
  updateMarketIndex,
  verifyMarketArtifact,
} from './market-index.mjs';

export { NeedsUser, ReleaseError, ResumableError };

const CLI = fileURLToPath(new URL('../bin/dsh-wb-module.mjs', import.meta.url));
const SCRIPTS = ['typecheck', 'test', 'selfcheck'];

function readManifest(root) {
  const file = join(root, 'package.json');
  if (!existsSync(file)) throw new ReleaseError(`${root} 里没有 package.json —— 这不是一个包目录`, 2);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw new ReleaseError('package.json 不是合法 JSON');
  }
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new ReleaseError('package.json 不是一个对象');
  }
  return manifest;
}

function writeManifest(root, manifest) {
  writeFileSync(join(root, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

function bumpVersion(version, kind) {
  const next = semver.inc(String(version), kind);
  if (next === null) throw new ReleaseError(`当前版本号读不出来：${String(version)}`);
  return next;
}

function nextVersion(current, asked, exists) {
  if (asked !== undefined) {
    const version = /^(major|minor|patch)$/.test(asked) ? bumpVersion(current, asked) : asked;
    if (semver.valid(version) === null) {
      throw new ReleaseError(`--version 只认 patch / minor / major / x.y.z（收到「${asked}」）`);
    }
    if (exists(version)) throw new ReleaseError(`${version} 已经被占了 —— 换一个版本`);
    return version;
  }
  if (!exists(current)) return current;
  for (const kind of ['patch', 'minor', 'major']) {
    const version = bumpVersion(current, kind);
    if (!exists(version)) return version;
  }
  throw new ReleaseError('版本号没法自动加 —— 手动给 --version');
}

function stage(exec, command, argv, { cwd, capture, err, label }) {
  const result = exec(command, argv, { cwd, capture, allowFailure: true });
  if (result.status === 0) return result;
  if (capture) {
    const text = `${result.stdout}\n${result.stderr}`.trim();
    if (text !== '') err(text.split('\n').slice(-30).join('\n'));
  }
  throw new ReleaseError(`${label} 没过——先修红字，别发`);
}

function runCliStage(exec, root, argv, options) {
  return stage(exec, process.execPath, [CLI, ...argv, '--cwd', root], {
    ...options,
    label: `dsh-wb-module ${argv.join(' ')}`,
  });
}

function runScriptStage(exec, root, script, options) {
  return stage(exec, 'npm', ['run', script], { ...options, label: `npm run ${script}` });
}

function runGate(exec, root, options) {
  runCliStage(exec, root, ['build'], options);
  for (const script of SCRIPTS) runScriptStage(exec, root, script, options);
}

function gitPathsOf(info) {
  const prefix = info.packagePath === '.' ? '' : `${info.packagePath}/`;
  return ['dist', 'client.js', 'cordis.patch.yml', 'package.json', 'README.md', 'CHANGELOG.md', 'design.json']
    .map((one) => `${prefix}${one}`)
    .filter((one) => existsSync(join(info.toplevel, one)));
}

const MESSAGE_FILES = ['src/messages.ts', 'src/messages.tsx', 'src/messages.mjs', 'src/messages.js'];

function titleIn(segment, key) {
  const quoted = `['"\`]${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`;
  const match = new RegExp(`${quoted}\\s*:\\s*['"\`]([^'"\`]*)['"\`]`).exec(segment);
  return match === null ? '' : match[1].trim();
}

export function cardTitleFromMessages(root, unit) {
  if (unit === '') return undefined;
  const key = `${unit}.cardTitle`;
  for (const file of MESSAGE_FILES) {
    let text;
    try {
      text = readFileSync(join(root, file), 'utf8');
    } catch {
      continue;
    }
    const zhAt = text.search(/\bzh\s*:/);
    const enAt = text.search(/\ben\s*:/);
    const zh = zhAt === -1 ? '' : titleIn(text.slice(zhAt, enAt === -1 ? text.length : enAt), key);
    const en = enAt === -1 ? '' : titleIn(text.slice(enAt), key);
    if (zh === '' && en === '') continue;
    return { ...(zh === '' ? {} : { zh }), ...(en === '' ? {} : { en }) };
  }
  return undefined;
}

function gitCommitOf(exec, info, version, capture, progress = {}, identity) {
  const add = exec('git', ['-C', info.toplevel, 'add', '-f', '--', ...gitPathsOf(info)], {
    capture,
    allowFailure: true,
  });
  if (add.status !== 0) throw new ReleaseError(`git add 没过：${tailOf(`${add.stdout}\n${add.stderr}`)}`);
  const who = [];
  if (identity !== undefined) {
    who.push('-c', `user.name=${identity.name}`);
    if (identity.email !== undefined) who.push('-c', `user.email=${identity.email}`);
  }
  const commit = exec(
    'git',
    ['-C', info.toplevel, ...who, 'commit', '-m', `chore(release): ${info.tagOf(version)}`],
    { capture, allowFailure: true },
  );
  if (commit.status !== 0) throw new ReleaseError(`git commit 没过：${tailOf(`${commit.stdout}\n${commit.stderr}`)}`);
  progress.committed = true;
  const tag = exec('git', ['-C', info.toplevel, 'tag', info.tagOf(version)], { capture, allowFailure: true });
  if (tag.status !== 0) throw new ReleaseError(`git tag 没过：${tailOf(`${tag.stdout}\n${tag.stderr}`)}`);
  const head = exec('git', ['-C', info.toplevel, 'rev-parse', 'HEAD'], { capture, allowFailure: true });
  if (head.status !== 0) throw new ReleaseError('读不了刚提交的 commit');
  return head.stdout.trim();
}

function gitPushOf(exec, info, version, capture) {
  const branch = exec(
    'git',
    ['-C', info.toplevel, 'push', info.remote, `HEAD:refs/heads/${info.branch}`],
    { capture, allowFailure: true },
  );
  if (branch.status !== 0) {
    throw new NeedsUser('git-auth', '推不上去：远端没给这个目录推送权限，或远端有新提交。检查权限/同步后跟我说，我重推。', undefined, {
      target: 'git',
      remote: info.remote,
      tag: info.tagOf(version),
    });
  }
  const tag = exec('git', ['-C', info.toplevel, 'push', info.remote, `refs/tags/${info.tagOf(version)}`], {
    capture,
    allowFailure: true,
  });
  if (tag.status !== 0) {
    throw new NeedsUser('git-auth', '分支推上去了，但 tag 没推上去。检查权限后跟我说，我补推。', undefined, {
      target: 'git',
      remote: info.remote,
      tag: info.tagOf(version),
    });
  }
}

function verifyGit(exec, info, version) {
  const commit = exec('git', ['-C', info.toplevel, 'rev-parse', `${info.tagOf(version)}^{commit}`], {
    capture: true,
    allowFailure: true,
  });
  if (commit.status !== 0) throw new ReleaseError(`发完了，但本地找不到 tag ${info.tagOf(version)}`);
  const tree = exec('git', ['-C', info.toplevel, 'ls-tree', '-r', '--name-only', info.tagOf(version)], {
    capture: true,
    allowFailure: true,
  });
  if (tree.status !== 0) throw new ReleaseError(`核不了 tag ${info.tagOf(version)} 的内容`);
  const prefix = info.packagePath === '.' ? '' : `${info.packagePath}/`;
  const files = tree.stdout
    .split('\n')
    .map((one) => one.trim())
    .filter((one) => one !== '' && one.startsWith(prefix))
    .map((one) => one.slice(prefix.length));
  checkGitFiles(files);
  return { commit: commit.stdout.trim(), files };
}

export async function runRelease({
  root,
  args = [],
  exec = defaultExec,
  home = dshHomeOf(),
  out = console.log,
  err = console.error,
} = {}) {
  const json = hasFlag(args, '--json');
  const dryRun = hasFlag(args, '--dry-run');
  const verify = hasFlag(args, '--verify');
  const askedAuthor = argValue(args, '--author');
  const explicitAuthor = askedAuthor === undefined ? undefined : askedAuthor.trim();
  if (askedAuthor !== undefined && (explicitAuthor === '' || /[\r\n]/u.test(explicitAuthor))) {
    throw new ReleaseError('--author 只认一行署名：姓名，或 姓名 <邮箱>');
  }
  const changelogNote = (argValue(args, '--changelog-note') ?? '').trim();
  const changelogKind = (argValue(args, '--changelog-type') ?? 'changed').trim();
  if (!CHANGELOG_KINDS.includes(changelogKind)) {
    throw new ReleaseError(`--changelog-type 只认 ${CHANGELOG_KINDS.join(' / ')}（收到「${changelogKind}」）`);
  }
  const manifest = readManifest(root);
  const unit = manifest?.dsh?.workbench?.unit;
  if (typeof unit !== 'string' || unit === '') throw new ReleaseError('这不是一个 wb 模块包（没有 dsh.workbench.unit）');
  if (typeof manifest.name !== 'string' || manifest.name === '') throw new ReleaseError('package.json 里没有 name');
  if (typeof manifest.version !== 'string' || manifest.version === '') {
    throw new ReleaseError('package.json 里没有 version');
  }
  const earlyState = readState(home, unit);
  const resume = hasFlag(args, '--resume');
  const journal = resume ? resumableState(home, unit) : undefined;
  if (resume && journal === undefined) {
    throw new ReleaseError('没有可续跑的发布记录 —— 去掉 --resume 正常发一次');
  }
  const askedTarget = argValue(args, '--target');
  if (resume && askedTarget !== undefined && askedTarget !== journal?.target) {
    throw new ReleaseError(`这条续跑记录属于出口 ${String(journal?.target)}，和 --target ${askedTarget} 不一致`);
  }
  const stateTarget =
    verify && askedTarget === undefined && TARGETS.includes(earlyState?.target) ? earlyState.target : undefined;
  const resumeTarget = resume && askedTarget === undefined ? journal?.target : undefined;
  const needPlan = !verify || stateTarget === 'market' || askedTarget === 'market';
  let indexPlan;
  if (needPlan) {
    try {
      indexPlan = resolveIndexPlan({ args, home, exec });
    } catch (error) {
      if (error instanceof MarketIndexError) {
        throw new NeedsUser(error.step ?? 'index-write', error.message, error.command, {
          target: askedTarget ?? 'market',
        });
      }
      throw error;
    }
  }
  if (resume && indexPlan === undefined && journal?.run?.indexPlan !== undefined) {
    indexPlan = journal.run.indexPlan;
  }
  const target = resumeTarget ?? stateTarget ?? targetOf(root, manifest, args, indexPlan);
  if (target === 'local') {
    const summary = {
      ok: true,
      target: 'local',
      name: manifest.name,
      version: manifest.version,
      changes: [],
      install: '',
      text: '没发，留在本机。',
    };
    emit(out, json, summary);
    return summary;
  }
  const explicitApplied = explicitAuthor !== undefined && !verify && !dryRun;
  if (explicitApplied) {
    manifest.author = explicitAuthor;
    writeManifest(root, manifest);
  }
  if (target === 'market') {
    if (indexPlan === undefined) {
      throw new ReleaseError('没有可写的 git 索引源 —— 用 --index <仓库> 指定，或先在「模块市场 → 发现」里初始化索引');
    }
    if (indexPlan.policy !== 'artifacts-in-repo') {
      if (indexPlan.policyStated !== true) {
        throw new NeedsUser(
          'index-write',
          indexPlan.origin === 'argument'
            ? '这个索引仓库默认只当目录。要往里发产物，加 --index-policy artifacts-in-repo 再跑一次。'
            : '这个索引源还没设为可发布。到「模块市场 → 发现 → 索引源」点「设为可发布」，再发一次。',
          undefined,
          {
            target: 'market',
            ...(indexPlan.origin === 'argument' ? {} : { enableTool: 'workbench_market_enable' }),
            ...(indexPlan.sourceId === undefined ? {} : { sourceId: indexPlan.sourceId }),
            ...(indexPlan.source.url === '' ? {} : { sourceUrl: indexPlan.source.url }),
          },
        );
      }
      throw new ReleaseError('这个索引源是 catalog-only：它只收目录、不放产物。用 --index-policy artifacts-in-repo 或换一个可写仓库');
    }
  }
  if (hasFlag(args, '--refresh')) {
    if (dryRun) throw new ReleaseError('--refresh 没有预览：它只改索引里的标题 / 作者 / 说明');
    if (target !== 'market') throw new ReleaseError('--refresh 只对市场索引有意义（--target market）');
    if (indexPlan === undefined) {
      throw new ReleaseError('没有可写的 git 索引源 —— 用 --index <仓库> 指定，或先在「模块市场 → 发现」里初始化索引');
    }
    const cardTitle = cardTitleFromMessages(root, unit);
    const titled = cardTitle === undefined ? manifest : { ...manifest, title: cardTitle };
    const result = refreshMarketEntry({ plan: indexPlan, exec, home, manifest: titled });
    if (result.updated !== true && result.reason !== undefined) {
      throw new ReleaseError(`刷新市集元数据没走通：${result.reason}`);
    }
    const summary = {
      ok: true,
      target: 'market',
      refresh: true,
      name: manifest.name,
      version: result.version ?? manifest.version,
      refreshed: result.updated === true,
      market: {
        url: indexPlan.source.url,
        ...(result.branch === undefined ? {} : { branch: result.branch }),
        ...(result.commit === undefined ? {} : { commit: result.commit }),
      },
      changes:
        result.updated === true
          ? ['市集元数据已刷新', ...(explicitAuthor === undefined ? [] : ['author ← --author'])]
          : [],
      install: '',
      text:
        result.updated === true
          ? `已刷新 ${manifest.name} 的市集元数据（版本 ${result.version ?? manifest.version} 不变）`
          : `${manifest.name} 的市集元数据本来就是这样，没动`,
    };
    emit(out, json, summary);
    return summary;
  }
  const authored = authorChangeOf(root, manifest, exec);
  const authorChange = explicitAuthor === undefined ? authored.change : 'author ← --author';
  if (!explicitApplied && !verify && !dryRun && authored.author !== undefined) {
    manifest.author = authored.author;
    writeManifest(root, manifest);
  }
  const frozenVersion = resume && typeof journal?.version === 'string' ? journal.version : undefined;
  const info =
    target === 'market'
      ? { target: 'market', kind: 'market', url: indexPlan.source.url }
      : targetInfoOf(root, manifest, args, home, exec, target, earlyState?.registry);
  const askedVersion = argValue(args, '--version');
  const targetVersionOf = () => {
    if (info.kind === 'tarball' || info.kind === 'git') {
      return frozenVersion ?? nextVersion(manifest.version, askedVersion, info.exists);
    }
    if (info.kind === 'registry') {
      return frozenVersion ?? nextVersion(manifest.version, askedVersion, (one) => registryExists(exec, info, manifest.name, one));
    }
    if (info.kind === 'market' && indexPlan !== undefined) {
      return (
        frozenVersion ??
        nextVersion(manifest.version, askedVersion, (one) =>
          marketVersionExists({ plan: indexPlan, exec, home, name: manifest.name, version: one }),
        )
      );
    }
    return frozenVersion ?? nextVersion(manifest.version, askedVersion, () => false);
  };
  const releaseVersion = verify ? undefined : targetVersionOf();
  const changelogProblem = verify || dryRun ? undefined : changelogProblemOf(root, releaseVersion);
  if (changelogProblem !== undefined && changelogNote === '') {
    throw new NeedsUser('changelog', changelogProblem.reason, changelogProblem.command, {
      target,
      version: releaseVersion,
    });
  }
  const fingerprint = artifactFingerprintOf(root);
  const resumeMatchesTree = resume && frozenVersion !== undefined && journal?.run?.fingerprint === fingerprint;
  const tracking = !verify && !dryRun;
  if (tracking) {
    startRun(home, unit, {
      target,
      name: manifest.name,
      resume,
      ...(frozenVersion === undefined ? {} : { version: frozenVersion }),
      fields: {
        fingerprint,
        ...(indexPlan === undefined
          ? {}
          : { indexPlan: { source: indexPlan.source, policy: indexPlan.policy } }),
      },
    });
  }
  const indexPreviewOf = (name, version) =>
    indexPlan === undefined
      ? undefined
      : {
          kind: 'git',
          url: indexPlan.source.url,
          policy: indexPlan.policy,
          entry: `${name}@${version}`,
          updated: false,
          planned: true,
        };
  const indexOf = (manifestNow, version, publish) => {
    if (indexPlan === undefined) return undefined;
    if (target === 'tarball' || target === 'local') {
      return {
        kind: 'git',
        url: indexPlan.source.url,
        entry: `${manifestNow.name}@${version}`,
        updated: false,
        reason: `${target} 不进市场索引`,
      };
    }
    return updateMarketIndex({
      plan: indexPlan,
      root,
      manifest: manifestNow,
      unit,
      version,
      publish,
      exec,
      home,
      now: () => Date.now(),
    });
  };
  let changelogChange;
  const changesOf = (version) => [
    ...(authorChange === undefined ? [] : [authorChange]),
    ...(version === manifest.version ? [] : [`version → ${version}`]),
    ...(changelogChange === undefined ? [] : [changelogChange]),
  ];
  if (verify) {
    const state = earlyState;
    const version = argValue(args, '--version') ?? state?.version ?? manifest.version;
    if (info.kind === 'market') {
      if (indexPlan === undefined) throw new ReleaseError('没有可写的 git 索引源，核不了这次的产物');
      const commit = typeof state?.commit === 'string' ? state.commit : '';
      if (commit === '') throw new ReleaseError('没有记录上次发布的 commit —— 先正常发一次再核');
      let checked;
      try {
        checked = verifyMarketArtifact({ plan: indexPlan, exec, home, unit, commit });
      } catch (error) {
        throw new ReleaseError(error instanceof Error ? error.message : String(error));
      }
      const summary = {
        ok: true,
        verified: true,
        target,
        name: manifest.name,
        version,
        files: checked.files,
        market: {
          kind: 'git',
          url: indexPlan.source.url,
          branch: state?.branch,
          commit,
          path: checked.path,
          entry: `${manifest.name}@${version}`,
          updated: true,
        },
        changes: [],
        install: marketInstallOf(indexPlan.source.url, commit, checked.path),
      };
      writeState(home, unit, { ...state, status: 'verified' });
      emit(out, json, summary);
      return summary;
    }
    if (info.kind === 'registry') {
      const files = verifyRegistry(exec, info, manifest.name, version);
      const summary = {
        ok: true,
        verified: true,
        target,
        name: manifest.name,
        version,
        registry: info.registry,
        files,
        changes: [],
        install: installOf(info, manifest.name, version),
      };
      writeState(home, unit, { ...stateOf(info, manifest, version, 'verified') });
      emit(out, json, summary);
      return summary;
    }
    if (info.kind === 'tarball') {
      const file = state?.file ?? info.fileOf(version);
      if (!existsSync(file)) throw new ReleaseError(`找不到安装包 ${file}`);
      const summary = {
        ok: true,
        verified: true,
        target,
        name: manifest.name,
        version,
        file,
        files: [],
        changes: [],
        install: installOf(info, manifest.name, version),
      };
      writeState(home, unit, { ...stateOf(info, manifest, version, 'verified') });
      emit(out, json, summary);
      return summary;
    }
    const checked = verifyGit(exec, info, version);
    const summary = {
      ok: true,
      verified: true,
      target,
      name: manifest.name,
      version,
      files: checked.files,
      git: { url: info.url, tag: info.tagOf(version), commit: checked.commit },
      changes: [],
      install: installOf(info, manifest.name, version),
    };
    writeState(home, unit, { ...stateOf(info, manifest, version, 'verified') });
    emit(out, json, summary);
    return summary;
  }
  const existing = earlyState;
  if (
    !dryRun &&
    argValue(args, '--version') === undefined &&
    info.kind === 'registry' &&
    existing?.status === 'published' &&
    existing.target === target &&
    existing.name === manifest.name &&
    existing.version === manifest.version
  ) {
    const version = manifest.version;
    const files = verifyRegistry(exec, info, manifest.name, version);
    writeState(home, unit, stateOf(info, manifest, version, 'verified'));
    if (tracking) finishRun(home, unit, { version });
    const summary = {
      ok: true,
      verified: true,
      target,
      name: manifest.name,
      version,
      registry: info.registry,
      changes: [],
      files,
      install: installOf(info, manifest.name, version),
      market: indexOf(manifest, version, { registry: info.registry }),
    };
    emit(out, json, summary);
    return summary;
  }
  if (
    !dryRun &&
    argValue(args, '--version') === undefined &&
    target === 'git' &&
    existing?.target === 'git' &&
    existing.status === 'committed' &&
    existing.tag === info.tagOf(String(existing.version ?? ''))
  ) {
    const version = String(existing.version);
    gitPushOf(exec, info, version, json);
    const checked = verifyGit(exec, info, version);
    writeState(home, unit, { ...stateOf(info, manifest, version, 'verified'), commit: checked.commit });
    if (tracking) finishRun(home, unit, { version });
    const summary = {
      ok: true,
      verified: true,
      target,
      name: manifest.name,
      version,
      files: checked.files,
      changes: [],
      git: { url: info.url, tag: info.tagOf(version), commit: checked.commit },
      install: installOf(info, manifest.name, version),
      market: indexOf(manifest, version, {
        git: { url: info.url, commit: checked.commit, path: info.packagePath },
      }),
    };
    emit(out, json, summary);
    return summary;
  }
  if (!dryRun && !hasFlag(args, '--yes')) {
    throw new ReleaseError('还没发：确认后加 --yes 真发；只想预览就加 --dry-run');
  }
  if (!resumeMatchesTree) {
    if (!existsSync(join(root, DESIGN_FILE))) {
      throw new NeedsUser('acceptance', '还没有 design.json。先在真卡片上逐条走通，再 design accept。', undefined, {
        target,
      });
    }
    const acceptance = acceptanceOf(root);
    if (acceptance.total === 0) {
      throw new NeedsUser('acceptance', '验收清单是空的。先在真卡片上逐条走通，再 design accept。', undefined, { target });
    }
    if (acceptance.checked < acceptance.total) {
      throw new NeedsUser(
        'acceptance',
        `还有 ${acceptance.total - acceptance.checked} 条验收没打勾（${acceptance.checked}/${acceptance.total}）。先在真卡片上走完，确认没问题我再发。`,
        undefined,
        { target },
      );
    }
  }
  const earlyLicense = info.kind === 'registry' ? licenseOf(root, manifest, target, args) : undefined;
  if (info.kind === 'registry') checkLogin(exec, info);
  const changelog = dryRun
    ? undefined
    : applyChangelog(root, {
        version: releaseVersion,
        kind: changelogKind,
        note: changelogNote,
        date: changelogDate(),
      });
  if (!dryRun && changelog === undefined) {
    const problem = changelogProblemOf(root, releaseVersion);
    throw new NeedsUser(
      'changelog',
      problem?.reason ?? `${CHANGELOG_FILE} 里没有 ${String(releaseVersion)} 这一版`,
      problem?.command,
      { target, version: releaseVersion },
    );
  }
  if (changelog !== undefined && changelog.action === 'written') {
    changelogChange = `CHANGELOG ← ${changelog.version}`;
  }
  const changelogReport =
    changelog === undefined ? undefined : { version: changelog.version, action: changelog.action };
  const capture = json;
  const stageOptions = { cwd: root, capture, err };
  if (!resumeMatchesTree) runGate(exec, root, stageOptions);
  if (tracking) advanceRun(home, unit, { phase: 'gates' });

  if (info.kind === 'market') {
    const version = releaseVersion;
    const files = localFiles(exec, root);
    checkPublished(files);
    const summary = {
      ok: true,
      dryRun,
      target,
      name: manifest.name,
      version,
      files,
      changes: changesOf(version),
      ...(changelogReport === undefined ? {} : { changelog: changelogReport }),
      install: '',
      market: indexPreviewOf(manifest.name, version),
    };
    if (dryRun) {
      emit(out, json, summary);
      return summary;
    }
    if (!resumeMatchesTree) runCliStage(exec, root, ['check'], stageOptions);
    if (tracking) advanceRun(home, unit, { phase: 'version', version });
    const next = { ...manifest, version };
    const cardTitle = cardTitleFromMessages(root, unit);
    const titled = cardTitle === undefined ? next : { ...next, title: cardTitle };
    const index = updateMarketIndex({
      plan: indexPlan,
      root,
      manifest: titled,
      unit,
      version,
      publish: {},
      exec,
      home,
      now: () => Date.now(),
      ...(journal?.run === undefined ? {} : { resume: journal.run }),
      ...(tracking ? { onStep: (step) => advanceRun(home, unit, step) } : {}),
    });
    if (index.updated !== true || index.commit === undefined || index.commit === '') {
      const failure = {
        class: index.code === 'git-market-protected' ? 'human' : 'transient',
        code: index.code ?? 'index-write',
        text: index.reason ?? '没拿到产物 commit',
        phase: index.phase ?? 'index',
      };
      if (tracking) interruptRun(home, unit, failure);
      throw new ResumableError(`发布中断在第 ${String(index.phase ?? 'index')} 步：${failure.text}`, {
        unit,
        target,
        version,
        phase: index.phase ?? 'index',
        ...(index.branch === undefined ? {} : { branch: index.branch }),
      });
    }
    writeManifest(root, next);
    const path = index.path ?? `packages/${unit}`;
    const install = marketInstallOf(index.url, index.commit, path);
    const journalNow = tracking ? readState(home, unit)?.run : undefined;
    writeState(home, unit, {
      target: 'market',
      name: next.name,
      version,
      status: 'verified',
      at: new Date().toISOString(),
      url: index.url,
      branch: index.branch,
      commit: index.commit,
      path,
      ...(tracking
        ? { run: { ...(journalNow ?? {}), state: 'done', phase: 'done', updatedAt: new Date().toISOString() } }
        : {}),
    });
    summary.market = { ...index, commits: 2 };
    summary.install = install;
    emit(out, json, summary);
    return summary;
  }

  if (info.kind === 'tarball') {
    const version = releaseVersion;
    const files = localFiles(exec, root);
    checkPublished(files);
    const summary = {
      ok: true,
      dryRun,
      target,
      name: manifest.name,
      version,
      file: info.fileOf(version),
      files,
      changes: changesOf(version),
      ...(changelogReport === undefined ? {} : { changelog: changelogReport }),
      install: installOf(info, manifest.name, version),
    };
    if (dryRun) {
      emit(out, json, summary);
      return summary;
    }
    if (!resumeMatchesTree) runCliStage(exec, root, ['check'], stageOptions);
    const next = { ...manifest, version };
    writeManifest(root, next);
    if (tracking) advanceRun(home, unit, { phase: 'version', version, fingerprint: artifactFingerprintOf(root) });
    writeState(home, unit, stateOf(info, next, version, 'intent'));
    let packed = false;
    try {
      const file = packTarball(exec, info, version);
      packed = true;
      writeState(home, unit, { ...stateOf(info, next, version, 'published'), file });
      const packedFiles = localFiles(exec, root);
      checkPublished(packedFiles);
      writeState(home, unit, { ...stateOf(info, next, version, 'verified'), file });
      if (tracking) finishRun(home, unit, { version });
      summary.file = file;
      summary.files = packedFiles;
      summary.market = indexOf(next, version, {});
      emit(out, json, summary);
      return summary;
    } catch (error) {
      if (!packed) {
        writeManifest(root, manifest);
        if (tracking) {
          interruptRun(home, unit, { code: 'tarball', text: String(error?.message ?? error) });
        } else {
          removeState(home, unit);
        }
      }
      throw error;
    }
  }

  if (info.kind === 'git') {
    const version = releaseVersion;
    const files = localFiles(exec, root);
    checkPublished(files);
    const summary = {
      ok: true,
      dryRun,
      target,
      name: manifest.name,
      version,
      files,
      changes: changesOf(version),
      ...(changelogReport === undefined ? {} : { changelog: changelogReport }),
      git: { url: info.url, tag: info.tagOf(version) },
      install: installOf(info, manifest.name, version),
      ...(dryRun ? { market: indexPreviewOf(manifest.name, version) } : {}),
    };
    if (dryRun) {
      emit(out, json, summary);
      return summary;
    }
    if (!resumeMatchesTree) runCliStage(exec, root, ['check'], stageOptions);
    const next = { ...manifest, version };
    writeManifest(root, next);
    if (tracking) advanceRun(home, unit, { phase: 'version', version, fingerprint: artifactFingerprintOf(root) });
    writeState(home, unit, stateOf(info, next, version, 'intent'));
    const progress = { committed: false };
    try {
      const commit = gitCommitOf(exec, info, version, capture, progress, identityOf(next));
      writeState(home, unit, { ...stateOf(info, next, version, 'committed'), commit });
      gitPushOf(exec, info, version, capture);
      const checked = verifyGit(exec, info, version);
      writeState(home, unit, {
        ...stateOf(info, next, version, 'verified'),
        commit: checked.commit,
      });
      if (tracking) finishRun(home, unit, { version });
      summary.files = checked.files;
      summary.git.commit = checked.commit;
      summary.market = indexOf(next, version, {
        git: { url: info.url, commit: checked.commit, path: info.packagePath },
      });
      emit(out, json, summary);
      return summary;
    } catch (error) {
      if (!progress.committed) {
        writeManifest(root, manifest);
        if (tracking) {
          interruptRun(home, unit, { code: 'git', text: String(error?.message ?? error) });
        } else {
          removeState(home, unit);
        }
      }
      throw error;
    }
  }

  const original = globalThis.structuredClone(manifest);
  const next = { ...manifest };
  const changes = [];
  if (authorChange !== undefined) changes.push(authorChange);
  const license = earlyLicense;
  if (license !== undefined && next.license !== license) {
    next.license = license;
    changes.push(`license → ${license}`);
  }
  if (next.repository === undefined) {
    const repository = repositoryOf(root, exec);
    if (repository !== undefined) {
      next.repository = repository;
      changes.push('repository ← git remote');
    }
  }
  const publishConfig = { ...(next.publishConfig ?? {}), registry: info.registry, access: info.access };
  if (!isDeepStrictEqual(publishConfig, next.publishConfig ?? {})) {
    next.publishConfig = publishConfig;
    changes.push(`publishConfig → ${info.registry}（${info.access}）`);
  }
  if (next.private === true) {
    delete next.private;
    changes.push('摘掉 private');
  }
  const version = releaseVersion;
  if (version !== next.version) {
    next.version = version;
    changes.push(`version → ${version}`);
  }
  if (changelogChange !== undefined) changes.push(changelogChange);
  if (dryRun) {
    if (!resumeMatchesTree) runCliStage(exec, root, ['check'], stageOptions);
    const files = localFiles(exec, root);
    checkPublished(files);
    const summary = {
      ok: true,
      dryRun: true,
      target,
      name: next.name,
      version,
      registry: info.registry,
      changes,
      files,
      install: installOf(info, next.name, version),
      market: indexPreviewOf(next.name, version),
    };
    emit(out, json, summary);
    return summary;
  }
  writeManifest(root, next);
  if (tracking) advanceRun(home, unit, { phase: 'version', version, fingerprint: artifactFingerprintOf(root) });
  let published = false;
  try {
    if (!resumeMatchesTree) runCliStage(exec, root, ['check'], stageOptions);
    writeState(home, unit, stateOf(info, next, version, 'intent'));
    publishRegistry(exec, root, info, next, version);
    published = true;
    const files = verifyRegistry(exec, info, next.name, version);
    writeState(home, unit, stateOf(info, next, version, 'verified'));
    if (tracking) finishRun(home, unit, { version });
    const summary = {
      ok: true,
      verified: true,
      target,
      name: next.name,
      version,
      registry: info.registry,
      changes,
      files,
      ...(changelogReport === undefined ? {} : { changelog: changelogReport }),
      install: installOf(info, next.name, version),
      market: indexOf(next, version, { registry: info.registry }),
    };
    emit(out, json, summary);
    return summary;
  } catch (error) {
    if (!published && !(error instanceof NeedsUser && error.step === 'otp')) {
      writeManifest(root, original);
      if (tracking) {
        interruptRun(home, unit, { code: 'registry', text: String(error?.message ?? error) });
      } else {
        removeState(home, unit);
      }
    }
    if (published) writeState(home, unit, stateOf(info, next, version, 'published'));
    throw error;
  }
}

export async function release({ root, args = [] }) {
  try {
    return await runRelease({ root, args });
  } catch (error) {
    if (error instanceof NeedsUser) {
      if (hasFlag(args, '--json')) {
        process.stdout.write(`${JSON.stringify({ ok: false, target: error.extra.target, needsUser: error.toJSON() })}\n`);
      } else {
        console.error(error.text);
      }
      process.exit(3);
    }
    if (error instanceof ResumableError) {
      if (hasFlag(args, '--json')) {
        process.stdout.write(`${JSON.stringify(error.toJSON())}\n`);
      } else {
        console.error(`✖ ${error.message}`);
        console.error('  这是可续跑的中断：加 --resume 再跑一次。');
      }
      process.exit(4);
    }
    if (error instanceof ReleaseError) {
      console.error(`✖ ${error.message}`);
      process.exit(error.code);
    }
    throw error;
  }
}
