import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DESIGN_FILE, acceptanceOf } from './design.mjs';

const CLI = fileURLToPath(new URL('../bin/dsh-wb-module.mjs', import.meta.url));
const SCRIPTS = ['typecheck', 'test', 'selfcheck'];
const TARGETS = ['team', 'public', 'tarball', 'git', 'local'];
const PUBLIC_REGISTRIES = ['https://registry.npmjs.org/', 'https://registry.npmmirror.com/'];
const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const REQUIRED_FILES = ['dist/host.js', 'client.js', 'cordis.patch.yml', 'package.json'];

export class ReleaseError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.name = 'ReleaseError';
    this.code = code;
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

function argValue(args, flag) {
  const at = args.indexOf(flag);
  return at === -1 ? undefined : args[at + 1];
}

function hasFlag(args, flag) {
  return args.includes(flag);
}

function tailOf(text) {
  return String(text ?? '')
    .trim()
    .split('\n')
    .filter((one) => one.trim() !== '')
    .slice(-6)
    .join(' | ');
}

function parseJson(text) {
  const raw = String(text ?? '');
  const start = raw.search(/[[{]/);
  if (start === -1) return undefined;
  try {
    return JSON.parse(raw.slice(start));
  } catch {
    return undefined;
  }
}

function quote(value) {
  const text = String(value);
  return /[\s"'$`\\]/.test(text) ? `'${text.replace(/'/g, `'\\''`)}'` : text;
}

function defaultExec(command, argv, { cwd, capture = false, allowFailure = false } = {}) {
  const cache = join(tmpdir(), 'dsh-wb-npm-cache');
  const logs = join(tmpdir(), 'dsh-wb-npm-logs');
  mkdirSync(cache, { recursive: true });
  mkdirSync(logs, { recursive: true });
  const result = spawnSync(command, argv, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, npm_config_cache: cache, npm_config_logs_dir: logs },
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error !== undefined && result.error !== null) {
    if (allowFailure) return { status: 1, stdout: '', stderr: String(result.error) };
    throw new ReleaseError(`跑不起 ${command}：${String(result.error)}`);
  }
  const status = result.status ?? 1;
  const stdout = typeof result.stdout === 'string' ? result.stdout : '';
  const stderr = typeof result.stderr === 'string' ? result.stderr : '';
  if (status !== 0 && !allowFailure) {
    const text = tailOf(`${stdout}\n${stderr}`);
    throw new ReleaseError(`${command} ${argv.join(' ')} 没过${text === '' ? '' : `：${text}`}`);
  }
  return { status, stdout, stderr };
}

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

function dshHomeOf(home) {
  return home ?? process.env.DSH_HOME?.trim() ?? join(homedir(), '.dsh');
}

function statePathOf(home, unit) {
  return join(dshHomeOf(home), 'workbench', 'releases', `${unit}.json`);
}

function artifactsDirOf(home, unit) {
  return join(dshHomeOf(home), 'workbench', 'artifacts', unit);
}

function readState(home, unit) {
  try {
    return JSON.parse(readFileSync(statePathOf(home, unit), 'utf8'));
  } catch {
    return undefined;
  }
}

function writeState(home, unit, state) {
  const file = statePathOf(home, unit);
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(temp, file);
}

function removeState(home, unit) {
  try {
    rmSync(statePathOf(home, unit));
  } catch {
    return;
  }
}

function normalizeRegistry(url) {
  const value = String(url ?? '').trim();
  if (value === '') return '';
  return value.endsWith('/') ? value : `${value}/`;
}

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

function targetOf(root, manifest, args) {
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

function licenseOf(root, manifest, target, args) {
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

function repositoryOf(root, exec) {
  const result = exec('git', ['-C', root, 'remote', 'get-url', 'origin'], { capture: true, allowFailure: true });
  const url = result.status === 0 ? result.stdout.trim() : '';
  return url === '' ? undefined : { type: 'git', url };
}

function bumpVersion(version, kind) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(String(version));
  if (match === null) throw new ReleaseError(`当前版本号读不出来：${String(version)}`);
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function nextVersion(current, asked, exists) {
  if (asked !== undefined) {
    const version = /^(major|minor|patch)$/.test(asked) ? bumpVersion(current, asked) : asked;
    if (!SEMVER.test(version)) {
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

function loginCommandOf(registry) {
  return `npm login --registry ${registry}`;
}

function npmrcArgs(npmrc) {
  return npmrc === undefined ? [] : ['--userconfig', npmrc];
}

function checkLogin(exec, info) {
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

function registryInfoOf(root, manifest, args, target, fallbackRegistry) {
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
        '这个工坊还没配团队源。让公司把 registry 和 token 写进 `.npmrc`；或者我先给你打一个安装包。',
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
  const allowed = ['dist', 'client.js', 'cordis.patch.yml', 'package.json', 'README.md', 'design.json'];
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

function targetInfoOf(root, manifest, args, home, exec, target, fallbackRegistry) {
  if (target === 'team' || target === 'public') return registryInfoOf(root, manifest, args, target, fallbackRegistry);
  if (target === 'tarball') return tarballInfoOf(root, manifest, args, home);
  if (target === 'git') return gitInfoOf(root, manifest, args, exec);
  return { target: 'local', kind: 'local' };
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

function localFiles(exec, root) {
  const result = exec(
    'npm',
    ['pack', '--dry-run', '--json', '--ignore-scripts', '--cache', join(tmpdir(), 'dsh-wb-npm-cache')],
    { cwd: root, capture: true, allowFailure: true },
  );
  if (result.status !== 0) throw new ReleaseError(`核不了本地包内容：${tailOf(`${result.stdout}\n${result.stderr}`)}`);
  const parsed = parseJson(result.stdout);
  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  const files = Array.isArray(first?.files) ? first.files.map((one) => String(one.path ?? one)) : [];
  if (files.length === 0) throw new ReleaseError('npm pack 没列出包内容');
  return files;
}

function checkPublished(files) {
  const missing = REQUIRED_FILES.filter((one) => !files.includes(one));
  if (missing.length > 0) throw new ReleaseError(`包里少了 ${missing.join(' / ')} —— 装上会起不来`);
  const leaked = files.filter(
    (one) => one.startsWith('src/') || one.endsWith('.npmrc') || one.startsWith('template') || one.includes('.env'),
  );
  if (leaked.length > 0) throw new ReleaseError(`包里混进了不该发的：${leaked.slice(0, 3).join('、')}`);
}

function checkGitFiles(files) {
  const missing = REQUIRED_FILES.filter((one) => !files.includes(one));
  if (missing.length > 0) throw new ReleaseError(`tag 里少了 ${missing.join(' / ')} —— 装上会起不来`);
  const leaked = files.filter((one) => one.endsWith('.npmrc') || one.includes('.env'));
  if (leaked.length > 0) throw new ReleaseError(`tag 里混进了凭据文件：${leaked.slice(0, 3).join('、')}`);
}

function registryExists(exec, info, name, version) {
  const argv = ['view', `${name}@${version}`, 'version', '--json', '--registry', info.registry, ...npmrcArgs(info.npmrc)];
  const result = exec('npm', argv, { capture: true, allowFailure: true });
  if (result.status === 0) return true;
  const text = `${result.stdout}\n${result.stderr}`;
  if (/E404|404|No matching version|not found|不存在/i.test(text)) return false;
  throw new ReleaseError(`查团队源失败（${info.registry}）：${tailOf(text)}`);
}

function publishArgsOf(info) {
  return [
    'publish',
    '--registry',
    info.registry,
    '--access',
    info.access,
    '--ignore-scripts',
    ...npmrcArgs(info.npmrc),
  ];
}

function otpCommandOf(root, info) {
  return [
    `cd ${quote(root)}`,
    '&&',
    'npm',
    'publish',
    '--registry',
    info.registry,
    '--access',
    info.access,
    '--ignore-scripts',
    ...npmrcArgs(info.npmrc),
  ].join(' ');
}

function publishRegistry(exec, root, info, manifest, version) {
  const result = exec('npm', publishArgsOf(info), { cwd: root, capture: true, allowFailure: true });
  if (result.status === 0) return;
  const text = `${result.stdout}\n${result.stderr}`;
  if (/EOTP|one-time password|OTP/i.test(text)) {
    throw new NeedsUser(
      'otp',
      '源要求一次性验证码。构建和门禁都过了，请在终端跑下面这条，按提示输入验证码；完了跟我说「好了」，我来核对。',
      otpCommandOf(root, info),
      { target: info.target, name: manifest.name, version, registry: info.registry },
    );
  }
  if (info.target === 'public' && /E403|403|taken|already exists|Forbidden|cannot publish over/i.test(text)) {
    throw new NeedsUser('name', '这个名字在 npm 上已经被占了。换一个：`@<user>/<name>` 或加一个后缀？', undefined, {
      target: info.target,
      name: manifest.name,
      version,
    });
  }
  if (/E403|403|already exists|Forbidden/i.test(text)) {
    throw new NeedsUser('scope', '团队源不让发这个包名（可能被占了，或没有权限）。让管理员确认 scope / 权限后跟我说。', undefined, {
      target: info.target,
      name: manifest.name,
      version,
    });
  }
  if (/E402|402|E404|404|scope|payment|not found/i.test(text)) {
    throw new NeedsUser('scope', '团队源要求包名带 scope。用 `@<scope>/<name>` 吗？', undefined, {
      target: info.target,
      name: manifest.name,
      version,
    });
  }
  throw new ReleaseError(`npm publish 没过：${tailOf(text)}`);
}

function verifyRegistry(exec, info, name, version) {
  const view = exec(
    'npm',
    ['view', `${name}@${version}`, 'version', 'dist.tarball', '--json', '--registry', info.registry, ...npmrcArgs(info.npmrc)],
    { capture: true, allowFailure: true },
  );
  if (view.status !== 0) {
    throw new ReleaseError(`发完了，但在源上查不到 ${name}@${version} —— 去 registry 确认一下`);
  }
  const packed = exec(
    'npm',
    ['pack', `${name}@${version}`, '--dry-run', '--json', '--ignore-scripts', '--registry', info.registry, ...npmrcArgs(info.npmrc)],
    { capture: true, allowFailure: true },
  );
  if (packed.status !== 0) throw new ReleaseError(`发完了，但核不了包：${tailOf(`${packed.stdout}\n${packed.stderr}`)}`);
  const parsed = parseJson(packed.stdout);
  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  const files = Array.isArray(first?.files) ? first.files.map((one) => String(one.path ?? one)) : [];
  if (files.length === 0) throw new ReleaseError('发完了，但 npm pack 没列出包内容');
  checkPublished(files);
  return files;
}

function packTarball(exec, info, version) {
  mkdirSync(info.out, { recursive: true });
  const result = exec(
    'npm',
    ['pack', '--json', '--ignore-scripts', '--pack-destination', info.out],
    { capture: true, allowFailure: true },
  );
  if (result.status !== 0) throw new ReleaseError(`npm pack 没过：${tailOf(`${result.stdout}\n${result.stderr}`)}`);
  const parsed = parseJson(result.stdout);
  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  const filename = typeof first?.filename === 'string' ? first.filename : info.fileNameOf(version);
  const file = join(info.out, filename);
  if (!existsSync(file)) throw new ReleaseError(`npm pack 说生成了 ${filename}，但文件不在 ${info.out}`);
  return file;
}

function httpsUrlOf(url) {
  const text = String(url).trim();
  if (!text.startsWith('git@')) return text;
  const rest = text.slice(4);
  const at = rest.indexOf(':');
  if (at === -1) return text;
  return `https://${rest.slice(0, at)}/${rest.slice(at + 1)}`;
}

function gitInstallSpecOf(info, version) {
  const base = `git+${httpsUrlOf(info.url)}#${info.tagOf(version)}`;
  return info.packagePath === '.' ? base : `${base}&path:/${info.packagePath}`;
}

function gitPathsOf(info) {
  const prefix = info.packagePath === '.' ? '' : `${info.packagePath}/`;
  return ['dist', 'client.js', 'cordis.patch.yml', 'package.json', 'README.md', 'design.json']
    .map((one) => `${prefix}${one}`)
    .filter((one) => existsSync(join(info.toplevel, one)));
}

function gitCommitOf(exec, info, version, capture, progress = {}) {
  const add = exec('git', ['-C', info.toplevel, 'add', '-f', '--', ...gitPathsOf(info)], {
    capture,
    allowFailure: true,
  });
  if (add.status !== 0) throw new ReleaseError(`git add 没过：${tailOf(`${add.stdout}\n${add.stderr}`)}`);
  const commit = exec(
    'git',
    ['-C', info.toplevel, 'commit', '-m', `chore(release): ${info.tagOf(version)}`],
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

function installOf(info, name, version) {
  if (info.kind === 'tarball') return `dsh plugin --profile workbench add ${info.fileOf(version)}`;
  if (info.kind === 'git') return `dsh plugin --profile workbench add ${gitInstallSpecOf(info, version)}`;
  return `dsh plugin --profile workbench add ${name}@${version}`;
}

function stateOf(info, manifest, version, status) {
  const base = {
    target: info.target,
    name: manifest.name,
    version,
    status,
    at: new Date().toISOString(),
  };
  if (info.kind === 'registry') base.registry = info.registry;
  if (info.kind === 'tarball') base.file = info.fileOf(version);
  if (info.kind === 'git') {
    base.remote = info.url;
    base.tag = info.tagOf(version);
  }
  return base;
}

function human(out, summary) {
  if (summary.target === 'local') {
    out('没发，留在本机。');
    return;
  }
  if (summary.dryRun === true) {
    out(`○ 只到预览（dry-run）：${summary.name}@${summary.version} → ${summary.target}`);
    if (summary.changes.length > 0) out(`  会改：${summary.changes.join('；')}`);
    if (summary.files !== undefined) out(`  包内容：${summary.files.join(' · ')}`);
    out(`  安装：${summary.install}`);
    out('  什么都没写');
    return;
  }
  const where =
    summary.target === 'tarball'
      ? summary.file
      : summary.target === 'git'
        ? `${summary.git.url}（tag ${summary.git.tag}）`
        : summary.registry;
  out(`✔ 已发布 ${summary.name}@${summary.version} → ${where}`);
  if (summary.changes.length > 0) out(`  改了：${summary.changes.join('；')}`);
  if (summary.files !== undefined) out(`  包内容：${summary.files.join(' · ')}`);
  out(`  安装：${summary.install}`);
  out('  已从出口侧核过包内容');
}

function emit(out, json, value) {
  if (json) out(JSON.stringify(value));
  else human(out, value);
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
  const manifest = readManifest(root);
  const unit = manifest?.dsh?.workbench?.unit;
  if (typeof unit !== 'string' || unit === '') throw new ReleaseError('这不是一个 wb 模块包（没有 dsh.workbench.unit）');
  if (typeof manifest.name !== 'string' || manifest.name === '') throw new ReleaseError('package.json 里没有 name');
  if (typeof manifest.version !== 'string' || manifest.version === '') {
    throw new ReleaseError('package.json 里没有 version');
  }
  const earlyState = readState(home, unit);
  const askedTarget = argValue(args, '--target');
  const target =
    verify && askedTarget === undefined && TARGETS.includes(earlyState?.target)
      ? earlyState.target
      : targetOf(root, manifest, args);
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
  const info = targetInfoOf(root, manifest, args, home, exec, target, earlyState?.registry);
  if (verify) {
    const state = earlyState;
    const version = argValue(args, '--version') ?? state?.version ?? manifest.version;
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
    };
    emit(out, json, summary);
    return summary;
  }
  if (!dryRun && !hasFlag(args, '--yes')) {
    throw new ReleaseError('还没发：确认后加 --yes 真发；只想预览就加 --dry-run');
  }
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
  const earlyLicense = info.kind === 'registry' ? licenseOf(root, manifest, target, args) : undefined;
  if (info.kind === 'registry') checkLogin(exec, info);
  const capture = json;
  const stageOptions = { cwd: root, capture, err };
  runGate(exec, root, stageOptions);

  if (info.kind === 'tarball') {
    const version = nextVersion(manifest.version, argValue(args, '--version'), info.exists);
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
      changes: version === manifest.version ? [] : [`version → ${version}`],
      install: installOf(info, manifest.name, version),
    };
    if (dryRun) {
      emit(out, json, summary);
      return summary;
    }
    runCliStage(exec, root, ['check'], stageOptions);
    const next = { ...manifest, version };
    writeManifest(root, next);
    writeState(home, unit, stateOf(info, next, version, 'intent'));
    let packed = false;
    try {
      const file = packTarball(exec, info, version);
      packed = true;
      writeState(home, unit, { ...stateOf(info, next, version, 'published'), file });
      const packedFiles = localFiles(exec, root);
      checkPublished(packedFiles);
      writeState(home, unit, { ...stateOf(info, next, version, 'verified'), file });
      summary.file = file;
      summary.files = packedFiles;
      emit(out, json, summary);
      return summary;
    } catch (error) {
      if (!packed) {
        writeManifest(root, manifest);
        removeState(home, unit);
      }
      throw error;
    }
  }

  if (info.kind === 'git') {
    const version = nextVersion(manifest.version, argValue(args, '--version'), info.exists);
    const files = localFiles(exec, root);
    checkPublished(files);
    const summary = {
      ok: true,
      dryRun,
      target,
      name: manifest.name,
      version,
      files,
      changes: version === manifest.version ? [] : [`version → ${version}`],
      git: { url: info.url, tag: info.tagOf(version) },
      install: installOf(info, manifest.name, version),
    };
    if (dryRun) {
      emit(out, json, summary);
      return summary;
    }
    runCliStage(exec, root, ['check'], stageOptions);
    const next = { ...manifest, version };
    writeManifest(root, next);
    writeState(home, unit, stateOf(info, next, version, 'intent'));
    const progress = { committed: false };
    try {
      const commit = gitCommitOf(exec, info, version, capture, progress);
      writeState(home, unit, { ...stateOf(info, next, version, 'committed'), commit });
      gitPushOf(exec, info, version, capture);
      const checked = verifyGit(exec, info, version);
      writeState(home, unit, {
        ...stateOf(info, next, version, 'verified'),
        commit: checked.commit,
      });
      summary.files = checked.files;
      summary.git.commit = checked.commit;
      emit(out, json, summary);
      return summary;
    } catch (error) {
      if (!progress.committed) {
        writeManifest(root, manifest);
        removeState(home, unit);
      }
      throw error;
    }
  }

  const original = JSON.parse(JSON.stringify(manifest));
  const next = { ...manifest };
  const changes = [];
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
  if (JSON.stringify(publishConfig) !== JSON.stringify(next.publishConfig ?? {})) {
    next.publishConfig = publishConfig;
    changes.push(`publishConfig → ${info.registry}（${info.access}）`);
  }
  if (next.private === true) {
    delete next.private;
    changes.push('摘掉 private');
  }
  const version = nextVersion(next.version, argValue(args, '--version'), (one) => registryExists(exec, info, next.name, one));
  if (version !== next.version) {
    next.version = version;
    changes.push(`version → ${version}`);
  }
  if (dryRun) {
    runCliStage(exec, root, ['check'], stageOptions);
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
    };
    emit(out, json, summary);
    return summary;
  }
  writeManifest(root, next);
  let published = false;
  try {
    runCliStage(exec, root, ['check'], stageOptions);
    writeState(home, unit, stateOf(info, next, version, 'intent'));
    publishRegistry(exec, root, info, next, version);
    published = true;
    const files = verifyRegistry(exec, info, next.name, version);
    writeState(home, unit, stateOf(info, next, version, 'verified'));
    const summary = {
      ok: true,
      verified: true,
      target,
      name: next.name,
      version,
      registry: info.registry,
      changes,
      files,
      install: installOf(info, next.name, version),
    };
    emit(out, json, summary);
    return summary;
  } catch (error) {
    if (!published && !(error instanceof NeedsUser && error.step === 'otp')) {
      writeManifest(root, original);
      removeState(home, unit);
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
    if (error instanceof ReleaseError) {
      console.error(`✖ ${error.message}`);
      process.exit(error.code);
    }
    throw error;
  }
}
