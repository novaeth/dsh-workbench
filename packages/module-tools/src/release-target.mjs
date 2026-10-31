import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

import {
  NeedsUser,
  ReleaseError,
  argValue,
  artifactsDirOf,
  hasFlag,
  normalizeRegistry,
  tailOf,
} from './release-util.mjs';

const TARGETS = ['team', 'public', 'tarball', 'git', 'market', 'local'];
const PUBLIC_REGISTRIES = ['https://registry.npmjs.org/', 'https://registry.npmmirror.com/'];

function isPublicRegistry(registry) {
  return PUBLIC_REGISTRIES.includes(normalizeRegistry(registry));
}

function findNpmrc(root) {
  let dir = resolve(root);
  for (;;) {
    const file = join(dir, '.npmrc');
    if (existsSync(file)) return file;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

function hasAuth(file) {
  if (file === undefined) return false;
  try {
    return /(_authToken|_auth\s*=|always-auth)/i.test(readFileSync(file, 'utf8'));
  } catch {
    return false;
  }
}

function registryInNpmrc(file, name) {
  if (file === undefined) return '';
  let general = '';
  const scope = name.startsWith('@') ? name.slice(0, name.indexOf('/')) : '';
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#') || line.startsWith(';')) continue;
    const at = line.indexOf('=');
    if (at === -1) continue;
    const key = line.slice(0, at).trim();
    const value = normalizeRegistry(line.slice(at + 1).trim());
    if (value === '') continue;
    if (scope !== '' && key === `${scope}:registry`) return value;
    if (key === 'registry') general = value;
  }
  return general;
}

function configuredRegistry(root, manifest) {
  const npmrc = findNpmrc(root);
  return (
    normalizeRegistry(process.env.DSH_WB_PUBLISH_REGISTRY) ||
    normalizeRegistry(manifest.publishConfig?.registry) ||
    registryInNpmrc(npmrc, String(manifest.name ?? ''))
  );
}

export function targetOf(root, manifest, args, indexPlan) {
  const asked = argValue(args, '--target');
  if (asked !== undefined) {
    if (!TARGETS.includes(asked)) throw new ReleaseError(`--target 只认 ${TARGETS.join(' / ')}`);
    return asked;
  }
  if (hasFlag(args, '--public')) return 'public';
  if (hasFlag(args, '--git') || argValue(args, '--git') !== undefined) return 'git';
  if (argValue(args, '--out') !== undefined) return 'tarball';
  const flagged = normalizeRegistry(argValue(args, '--registry'));
  if (flagged !== '') return isPublicRegistry(flagged) ? 'public' : 'team';
  if (indexPlan?.policy === 'artifacts-in-repo') return 'market';
  const configured = configuredRegistry(root, manifest);
  if (configured !== '') return isPublicRegistry(configured) ? 'public' : 'team';
  return 'tarball';
}

function licenseFileOf(root) {
  for (const name of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'COPYING']) {
    if (existsSync(join(root, name))) return name;
  }
  return undefined;
}

export function licenseOf(root, manifest, target, args) {
  const given = argValue(args, '--license') ?? manifest.license;
  if (typeof given === 'string' && given.trim() !== '') return given.trim();
  const file = licenseFileOf(root);
  if (file !== undefined) return `SEE LICENSE IN ${file}`;
  if (target === 'public') {
    throw new NeedsUser('license', '公开发布需要一个许可证。用 MIT、Apache-2.0，还是仓库里已有的 LICENSE？', undefined, {
      target,
    });
  }
  if (target === 'team') return 'UNLICENSED';
  return undefined;
}

export function repositoryOf(root, exec) {
  const result = exec('git', ['-C', root, 'remote', 'get-url', 'origin'], { capture: true, allowFailure: true });
  const url = result.status === 0 ? result.stdout.trim() : '';
  return url === '' ? undefined : { type: 'git', url };
}

function loginCommandOf(registry) {
  return `npm login --registry ${registry}`;
}

export function npmrcArgs(npmrc) {
  return npmrc === undefined ? [] : ['--userconfig', npmrc];
}

export function checkLogin(exec, info) {
  const argv = ['whoami', '--registry', info.registry, ...npmrcArgs(info.npmrc)];
  const result = exec('npm', argv, { capture: true, allowFailure: true });
  if (result.status === 0) return;
  const text = `${result.stdout}\n${result.stderr}`;
  if (/E404|404|not found/i.test(text)) return;
  if (/ENEEDAUTH|not logged in|401|Unauthorized|E401|E403|403/i.test(text)) {
    throw new NeedsUser(
      'login',
      `${info.target === 'public' ? 'npm' : '团队源'}还没登录。请在终端跑 \`${loginCommandOf(info.registry)}\`，走完登录/验证器再跟我说「好了」，我接着发。`,
      loginCommandOf(info.registry),
      { target: info.target, registry: info.registry },
    );
  }
  throw new ReleaseError(`连不上源（${info.registry}）：${tailOf(text)}`);
}

export function registryInfoOf(root, manifest, args, target, fallbackRegistry) {
  const name = String(manifest.name ?? '');
  const askedNpmrc = argValue(args, '--npmrc');
  const sourceNpmrc = askedNpmrc === undefined ? findNpmrc(root) : resolve(askedNpmrc);
  if (askedNpmrc !== undefined && !existsSync(sourceNpmrc)) {
    throw new ReleaseError(`--npmrc 指的文件不存在：${sourceNpmrc}`);
  }
  const npmrc = askedNpmrc !== undefined ? sourceNpmrc : hasAuth(sourceNpmrc) ? sourceNpmrc : undefined;
  const flagged = normalizeRegistry(argValue(args, '--registry'));
  let registry;
  if (target === 'public') {
    registry = flagged || 'https://registry.npmjs.org/';
    if (!isPublicRegistry(registry)) {
      throw new ReleaseError('public 目标要公网源；团队私有源用 --target team');
    }
  } else {
    registry =
      flagged ||
      normalizeRegistry(process.env.DSH_WB_PUBLISH_REGISTRY) ||
      normalizeRegistry(manifest.publishConfig?.registry) ||
      normalizeRegistry(fallbackRegistry) ||
      registryInNpmrc(sourceNpmrc, name);
    if (registry === '') {
      throw new NeedsUser(
        'registry',
        '这台机器还没配团队源。让公司把 registry 和 token 写进 `.npmrc`；或者我先给你打一个安装包。',
        undefined,
        { target },
      );
    }
    if (isPublicRegistry(registry)) {
      throw new ReleaseError('这个源是公共 npm —— 用 --target public 明确公开发布');
    }
  }
  const access = argValue(args, '--access') ?? manifest.publishConfig?.access ?? (target === 'public' ? 'public' : 'restricted');
  if (access !== 'restricted' && access !== 'public') {
    throw new ReleaseError(`--access 只认 restricted / public（收到「${access}」）`);
  }
  if (target === 'public' && access !== 'public') throw new ReleaseError('public 目标只接受 --access public');
  return { target, kind: 'registry', name, registry, access, npmrc };
}

function tarballInfoOf(root, manifest, args, home) {
  const out = resolve(argValue(args, '--out') ?? artifactsDirOf(home, String(manifest.dsh?.workbench?.unit ?? '')));
  const fileNameOf = (version) => `${String(manifest.name).replace(/^@/, '').replace(/[/\\]/g, '-')}-${version}.tgz`;
  const fileOf = (version) => join(out, fileNameOf(version));
  return {
    target: 'tarball',
    kind: 'tarball',
    out,
    fileNameOf,
    fileOf,
    exists: (version) => existsSync(fileOf(version)),
  };
}

function gitInfoOf(root, manifest, args, exec) {
  const unit = String(manifest.dsh?.workbench?.unit ?? '');
  const top = exec('git', ['-C', root, 'rev-parse', '--show-toplevel'], { capture: true, allowFailure: true });
  if (top.status !== 0) {
    throw new NeedsUser(
      'git-remote',
      '这个模块目录还不是 git 仓库。先给它一个仓库/配好权限，或改打一个安装包。',
      undefined,
      { target: 'git' },
    );
  }
  const toplevel = top.stdout.trim();
  const branchResult = exec('git', ['-C', toplevel, 'rev-parse', '--abbrev-ref', 'HEAD'], {
    capture: true,
    allowFailure: true,
  });
  const branch = branchResult.status === 0 ? branchResult.stdout.trim() : '';
  if (branch === '' || branch === 'HEAD') {
    throw new NeedsUser('git-branch', '这个仓库现在不在一个分支上（detached HEAD）。先切回一个分支，再发。', undefined, {
      target: 'git',
    });
  }
  const remote = argValue(args, '--git') ?? 'origin';
  const remoteResult = exec('git', ['-C', toplevel, 'remote', 'get-url', remote], { capture: true, allowFailure: true });
  if (remoteResult.status !== 0 || remoteResult.stdout.trim() === '') {
    throw new NeedsUser('git-remote', `这个仓库没有可推送的远端 ${remote}。先加一个远端，或改打一个安装包。`, undefined, {
      target: 'git',
      remote,
    });
  }
  const url = remoteResult.stdout.trim();
  const packagePath = relative(toplevel, root).split(sep).join('/') || '.';
  const status = exec('git', ['-C', toplevel, 'status', '--porcelain', '--untracked-files=all'], {
    capture: true,
    allowFailure: true,
  });
  if (status.status !== 0) throw new ReleaseError(`读不了 git 状态：${tailOf(status.stderr)}`);
  const prefix = packagePath === '.' ? '' : `${packagePath}/`;
  const allowed = ['dist', 'client.js', 'cordis.patch.yml', 'package.json', 'README.md', 'CHANGELOG.md', 'design.json'];
  const dirty = status.stdout
    .trim()
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => line.slice(3).trim())
    .filter((path) => {
      if (!path.startsWith(prefix)) return true;
      const rel = path.slice(prefix.length);
      return !allowed.some((one) => rel === one || rel.startsWith(`${one}/`));
    });
  if (dirty.length > 0) {
    throw new NeedsUser(
      'git-dirty',
      `工作区还有别的未提交改动（${dirty.slice(0, 3).join('、')}）。先提交/暂存，再发；或改用安装包。`,
      undefined,
      { target: 'git', paths: dirty.slice(0, 3) },
    );
  }
  const tagOf = (version) => `${unit}@${version}`;
  const exists = (version) =>
    exec('git', ['-C', toplevel, 'rev-parse', '-q', '--verify', `refs/tags/${tagOf(version)}`], {
      capture: true,
      allowFailure: true,
    }).status === 0;
  return { target: 'git', kind: 'git', toplevel, branch, remote, url, packagePath, tagOf, exists };
}

export function targetInfoOf(root, manifest, args, home, exec, target, fallbackRegistry) {
  if (target === 'team' || target === 'public') return registryInfoOf(root, manifest, args, target, fallbackRegistry);
  if (target === 'tarball') return tarballInfoOf(root, manifest, args, home);
  if (target === 'git') return gitInfoOf(root, manifest, args, exec);
  return { target: 'local', kind: 'local' };
}

export { TARGETS };
