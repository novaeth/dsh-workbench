import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assembleMarketIndex, collectMarketEntryFiles } from '@dsh-workbench/shared/host';

import { NeedsUser, ReleaseError, ResumableError, runRelease } from '../../../src/release.mjs';

const FILES = [
  { path: 'client.js', size: 10 },
  { path: 'cordis.patch.yml', size: 10 },
  { path: 'dist/host.js', size: 10 },
  { path: 'package.json', size: 10 },
  { path: 'README.md', size: 10 },
  { path: 'CHANGELOG.md', size: 10 },
];

const CHANGELOG = [
  '# 更新日志',
  '',
  '## v0.1.2',
  '',
  '`2026-10-26`',
  '',
  '### ✨ 新增',
  '',
  '- 两点一版',
  '',
  '## v0.1.1',
  '',
  '`2026-10-26`',
  '',
  '### ✨ 新增',
  '',
  '- 一点一版',
  '',
  '## v0.1.0',
  '',
  '`2026-10-26`',
  '',
  '### ✨ 新增',
  '',
  '- 一点零版',
  '',
].join('\n');

const COMMIT = 'a'.repeat(40);

function packageOf(overrides = {}) {
  return {
    name: '@demo/probe',
    version: '0.1.0',
    private: true,
    description: 'probe',
    scripts: { build: 'x', typecheck: 'x', test: 'x', selfcheck: 'x' },
    dsh: { workbench: { unit: 'probe' }, workbenchFaces: { host: 'src/host.ts', client: 'src/client.tsx' } },
    ...overrides,
  };
}

function designOf(checked) {
  return {
    unit: 'probe',
    name: '@demo/probe',
    oneLine: 'probe',
    panel: [{ cell: 'c', conclusion: 'c', link: '' }],
    states: [],
    config: [],
    capabilities: [],
    linkage: [],
    datasource: { read: 'r', params: 'p', credentials: 'c', notLoggedIn: 'n', timeout: 't' },
    writes: [],
    acceptance: [
      { step: '打开面板', checked },
      { step: '点刷新', checked },
    ],
  };
}

function probeOf({ checked = true, manifest = packageOf(), changelog = CHANGELOG } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'wb-rel-'));
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(dir, 'design.json'), `${JSON.stringify(designOf(checked), null, 2)}\n`);
  writeFileSync(join(dir, 'cordis.patch.yml'), '- id: probe\n');
  if (changelog !== undefined) writeFileSync(join(dir, 'CHANGELOG.md'), changelog);
  return dir;
}

function readIndex(repo) {
  const root = join(repo, 'market');
  if (!existsSync(root)) return readIndex(repo);
  const assembled = assembleMarketIndex(collectMarketEntryFiles(root));
  if (!assembled.ok) throw new Error(`索引组装不过：${JSON.stringify(assembled.problems)}`);
  return JSON.parse(JSON.stringify(assembled.index));
}

function indexExists(repo) {
  return existsSync(join(repo, 'market')) || existsSync(join(repo, 'market.json'));
}

function homeOf() {
  return mkdtempSync(join(tmpdir(), 'wb-rel-home-'));
}

function ok(stdout = '') {
  return { status: 0, stdout, stderr: '' };
}

function fail(stderr = '') {
  return { status: 1, stdout: '', stderr };
}

function fakeExec(root, plan = {}) {
  const calls = [];
  const pushes = [...(plan.pushes ?? [])];
  const state = {
    published: new Set(plan.versions ?? []),
    tags: new Set(),
    commits: 0,
    pushes: 0,
  };
  const readManifest = () => JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const fileNameOf = () => {
    const manifest = readManifest();
    return `${manifest.name.replace(/^@/, '').replace(/[/\\]/g, '-')}-${manifest.version}.tgz`;
  };
  const exec = (command, argv, options = {}) => {
    calls.push({ command, argv, options });
    if (command.endsWith('node') || command.endsWith('node.exe')) return ok();
    if (command === 'npm') {
      const verb = argv[0];
      if (verb === 'whoami') return plan.whoami === undefined ? ok('demo\n') : plan.whoami;
      if (verb === 'run') return ok();
      if (verb === 'view') {
        if (argv.includes('dist.tarball')) return ok(`{"version":"${argv[1].split('@').pop()}"}`);
        const version = String(argv[1]).split('@').pop();
        return state.published.has(version) ? ok(`{"version":"${version}"}`) : fail('E404 Not Found');
      }
      if (verb === 'publish') {
        if (plan.publish !== undefined) return plan.publish;
        const version = readManifest().version;
        state.published.add(version);
        return ok();
      }
      if (verb === 'pack') {
        if (argv.includes('--dry-run')) return ok(JSON.stringify([{ files: plan.files ?? FILES }]));
        const at = argv.indexOf('--pack-destination');
        const out = at === -1 ? root : argv[at + 1];
        const filename = fileNameOf();
        writeFileSync(join(out, filename), 'tgz');
        return ok(JSON.stringify([{ filename, files: plan.files ?? FILES }]));
      }
      return ok();
    }
    if (command === 'git') {
      let at = argv[0] === '-C' ? 2 : 0;
      while (argv[at] === '-c') at += 2;
      const verb = argv[at];
      const rest = argv.slice(at + 1);
      if (verb === 'rev-parse' && rest[0] === '--show-toplevel') {
        return plan.gitTop === undefined ? ok(root) : plan.gitTop;
      }
      if (verb === 'rev-parse' && rest[0] === '--abbrev-ref') return ok('main\n');
      if (verb === 'rev-parse' && rest[0] === '-q') {
        return state.tags.has(rest[2].replace('refs/tags/', '')) ? ok('') : fail();
      }
      if (verb === 'rev-parse' && rest[0]?.endsWith('^{commit}')) return ok(`${COMMIT}\n`);
      if (verb === 'rev-parse' && rest[0] === 'HEAD') return ok(`${COMMIT}\n`);
      if (verb === 'remote') return ok('https://github.com/demo/probe.git\n');
      if (verb === 'config') {
        if (rest[0] === 'user.name') return plan.authorName === undefined ? ok('') : ok(`${plan.authorName}\n`);
        if (rest[0] === 'user.email') return plan.authorEmail === undefined ? ok('') : ok(`${plan.authorEmail}\n`);
        return ok('');
      }
      if (verb === 'status') return ok(plan.dirty ?? '');
      if (verb === 'add') return ok();
      if (verb === 'commit') {
        state.commits += 1;
        return ok();
      }
      if (verb === 'tag') {
        state.tags.add(rest[0]);
        return ok();
      }
      if (verb === 'push') {
        state.pushes += 1;
        if (pushes.length > 0) return pushes.shift();
        return plan.push === undefined ? ok() : plan.push;
      }
      if (verb === 'ls-remote') return ok(`${plan.remoteHead ?? COMMIT}\trefs/heads/main\n`);
      if (verb === 'ls-tree') {
        return ok(`${(plan.gitFiles ?? FILES.map((one) => one.path)).join('\n')}\n`);
      }
      return ok();
    }
    return ok();
  };
  return { exec, calls, state };
}

function hasCall(calls, command, first) {
  return calls.some((one) => one.command === command && (first === undefined || one.argv.includes(first)));
}

function failureOf(promise) {
  return promise.then(
    () => undefined,
    (error) => error,
  );
}

export const checks = [
  {
    title: 'release：team 源发完写元数据、从源上核包、状态落 verified',
    async run(_ctx, report) {
      const title = 'release：team 源发完写元数据、从源上核包、状态落 verified';
      const dir = probeOf();
      const home = homeOf();
      const fake = fakeExec(dir);
      try {
        const result = await runRelease({
          root: dir,
          home,
          args: ['--target', 'team', '--registry', 'https://npm.demo.test/', '--yes', '--json'],
          exec: fake.exec,
          out: () => {},
          err: () => {},
        });
        const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
        if (result.target !== 'team' || result.version !== '0.1.0') throw new Error(`结果不对：${JSON.stringify(result)}`);
        if (manifest.private === true) throw new Error('private 还在');
        if (manifest.license !== 'UNLICENSED') throw new Error(`license 不对：${manifest.license}`);
        if (manifest.publishConfig?.registry !== 'https://npm.demo.test/') throw new Error('registry 没写');
        if (!hasCall(fake.calls, 'npm', 'publish')) throw new Error('没有 publish');
        const state = JSON.parse(readFileSync(join(home, 'workbench', 'releases', 'probe.json'), 'utf8'));
        if (state.status !== 'verified') throw new Error(`状态不对：${state.status}`);
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      } finally {
        rmSync(dir, { recursive: true, force: true });
        rmSync(home, { recursive: true, force: true });
      }
    },
  },
  {
    title: 'release：验收没打完不发（用户说"没问题"是闸，不是提示）',
    async run(_ctx, report) {
      const title = 'release：验收没打完不发（用户说"没问题"是闸，不是提示）';
      const dir = probeOf({ checked: false });
      const home = homeOf();
      const fake = fakeExec(dir);
      try {
        const error = await failureOf(
          runRelease({
            root: dir,
            home,
            args: ['--target', 'team', '--registry', 'https://npm.demo.test/', '--yes'],
            exec: fake.exec,
            out: () => {},
            err: () => {},
          }),
        );
        if (!(error instanceof NeedsUser) || error.step !== 'acceptance') {
          throw new Error(`没有拦住：${error?.message ?? error}`);
        }
        if (hasCall(fake.calls, 'npm', 'publish')) throw new Error('验收没过却跑了 publish');
        if (hasCall(fake.calls, process.execPath, 'build')) throw new Error('验收没过就跑了 build');
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      } finally {
        rmSync(dir, { recursive: true, force: true });
        rmSync(home, { recursive: true, force: true });
      }
    },
  },
  {
    title: 'release：tarball 零凭据打包、保留 private、状态落 verified',
    async run(_ctx, report) {
      const title = 'release：tarball 零凭据打包、保留 private、状态落 verified';
      const dir = probeOf();
      const home = homeOf();
      const fake = fakeExec(dir);
      try {
        const result = await runRelease({
          root: dir,
          home,
          args: ['--target', 'tarball', '--yes', '--json'],
          exec: fake.exec,
          out: () => {},
          err: () => {},
        });
        const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
        if (result.target !== 'tarball' || result.file === undefined) throw new Error('没有安装包路径');
        if (!existsSync(result.file)) throw new Error('安装包没落盘');
        if (manifest.private !== true) throw new Error('tarball 不该摘 private');
        if (hasCall(fake.calls, 'npm', 'publish')) throw new Error('tarball 不该 publish');
        if (!result.install.includes(result.file)) throw new Error('安装命令没带文件路径');
        const state = JSON.parse(readFileSync(join(home, 'workbench', 'releases', 'probe.json'), 'utf8'));
        if (state.status !== 'verified' || state.target !== 'tarball') throw new Error('状态不对');
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      } finally {
        rmSync(dir, { recursive: true, force: true });
        rmSync(home, { recursive: true, force: true });
      }
    },
  },
  {
    title: 'release：public 缺 license 先问人；给了 license 才发',
    async run(_ctx, report) {
      const title = 'release：public 缺 license 先问人；给了 license 才发';
      const dir = probeOf();
      const home = homeOf();
      const fake = fakeExec(dir);
      try {
        const blocked = await failureOf(
          runRelease({
            root: dir,
            home,
            args: ['--target', 'public', '--yes'],
            exec: fake.exec,
            out: () => {},
            err: () => {},
          }),
        );
        if (!(blocked instanceof NeedsUser) || blocked.step !== 'license') {
          throw new Error(`没问 license：${blocked?.message ?? blocked}`);
        }
        const result = await runRelease({
          root: dir,
          home,
          args: ['--target', 'public', '--license', 'MIT', '--yes', '--json'],
          exec: fake.exec,
          out: () => {},
          err: () => {},
        });
        const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
        if (result.target !== 'public' || manifest.license !== 'MIT') throw new Error('public 没发成');
        if (manifest.publishConfig?.access !== 'public') throw new Error('access 不是 public');
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      } finally {
        rmSync(dir, { recursive: true, force: true });
        rmSync(home, { recursive: true, force: true });
      }
    },
  },
  {
    title: 'release：public 要验证码时给确切命令，--verify 只核不发',
    async run(_ctx, report) {
      const title = 'release：public 要验证码时给确切命令，--verify 只核不发';
      const dir = probeOf();
      const home = homeOf();
      const fake = fakeExec(dir, { publish: fail('npm error code EOTP\none-time password required') });
      try {
        const error = await failureOf(
          runRelease({
            root: dir,
            home,
            args: ['--target', 'public', '--license', 'MIT', '--yes'],
            exec: fake.exec,
            out: () => {},
            err: () => {},
          }),
        );
        if (!(error instanceof NeedsUser) || error.step !== 'otp') {
          throw new Error(`没问 OTP：${error?.message ?? error}`);
        }
        if (!String(error.command).includes('npm publish')) throw new Error('没给确切 publish 命令');
        const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
        if (manifest.private === true) throw new Error('OTP 交接前不该把 private 放回去');
        fake.state.published.add('0.1.0');
        const verified = await runRelease({
          root: dir,
          home,
          args: ['--verify', '--target', 'public', '--version', '0.1.0', '--json'],
          exec: fake.exec,
          out: () => {},
          err: () => {},
        });
        if (verified.verified !== true) throw new Error('--verify 没核过');
        if (hasCall(fake.calls, 'npm', 'publish') === false) throw new Error('之前那次 publish 没跑到');
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      } finally {
        rmSync(dir, { recursive: true, force: true });
        rmSync(home, { recursive: true, force: true });
      }
    },
  },
  {
    title: 'release：git 提交产物 + tag + push，发后核 tag 内容',
    async run(_ctx, report) {
      const title = 'release：git 提交产物 + tag + push，发后核 tag 内容';
      const dir = probeOf();
      const home = homeOf();
      const fake = fakeExec(dir);
      try {
        const result = await runRelease({
          root: dir,
          home,
          args: ['--target', 'git', '--yes', '--json'],
          exec: fake.exec,
          out: () => {},
          err: () => {},
        });
        const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
        if (result.target !== 'git' || result.git?.tag !== 'probe@0.1.0') throw new Error('git 结果不对');
        if (manifest.private !== true) throw new Error('git 不该摘 private');
        if (!hasCall(fake.calls, 'git', 'commit') || !hasCall(fake.calls, 'git', 'push')) throw new Error('没提交/推送');
        if (!result.install.includes('git+https://github.com/demo/probe.git#probe@0.1.0')) {
          throw new Error(`安装 spec 不对：${result.install}`);
        }
        const state = JSON.parse(readFileSync(join(home, 'workbench', 'releases', 'probe.json'), 'utf8'));
        if (state.status !== 'verified' || state.commit !== COMMIT) throw new Error('状态不对');
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      } finally {
        rmSync(dir, { recursive: true, force: true });
        rmSync(home, { recursive: true, force: true });
      }
    },
  },
  {
    title: 'release：git 没远端 / 工作区脏都先问人，不提交',
    async run(_ctx, report) {
      const title = 'release：git 没远端 / 工作区脏都先问人，不提交';
      const dir = probeOf();
      const home = homeOf();
      try {
        const noRemote = fakeExec(dir, { gitTop: fail('not a git repository') });
        const first = await failureOf(
          runRelease({
            root: dir,
            home,
            args: ['--target', 'git', '--yes'],
            exec: noRemote.exec,
            out: () => {},
            err: () => {},
          }),
        );
        if (!(first instanceof NeedsUser) || first.step !== 'git-remote') throw new Error('没拦住没远端');
        const dirty = fakeExec(dir, { dirty: ' M src/host.ts\n' });
        const second = await failureOf(
          runRelease({
            root: dir,
            home,
            args: ['--target', 'git', '--yes'],
            exec: dirty.exec,
            out: () => {},
            err: () => {},
          }),
        );
        if (!(second instanceof NeedsUser) || second.step !== 'git-dirty') throw new Error('没拦住脏工作区');
        if (hasCall(dirty.calls, 'git', 'commit')) throw new Error('脏工作区还提交了');
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      } finally {
        rmSync(dir, { recursive: true, force: true });
        rmSync(home, { recursive: true, force: true });
      }
    },
  },
  {
    title: 'release：git push 失败后保留 commit，重跑只补推不重复提交',
    async run(_ctx, report) {
      const title = 'release：git push 失败后保留 commit，重跑只补推不重复提交';
      const dir = probeOf();
      const home = homeOf();
      const failing = fakeExec(dir, { push: fail('permission denied') });
      try {
        const first = await failureOf(
          runRelease({
            root: dir,
            home,
            args: ['--target', 'git', '--yes'],
            exec: failing.exec,
            out: () => {},
            err: () => {},
          }),
        );
        if (!(first instanceof NeedsUser) || first.step !== 'git-auth') throw new Error('没给 git 权限交接');
        const state = JSON.parse(readFileSync(join(home, 'workbench', 'releases', 'probe.json'), 'utf8'));
        if (state.status !== 'committed') throw new Error(`失败后状态不对：${state.status}`);
        const retry = fakeExec(dir, { versions: ['0.1.0'] });
        const second = await runRelease({
          root: dir,
          home,
          args: ['--target', 'git', '--yes', '--json'],
          exec: retry.exec,
          out: () => {},
          err: () => {},
        });
        if (second.verified !== true) throw new Error('重跑没核过');
        if (retry.state.commits !== 0) throw new Error('重跑又提交了一次');
        if (retry.state.pushes === 0) throw new Error('重跑没补推');
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      } finally {
        rmSync(dir, { recursive: true, force: true });
        rmSync(home, { recursive: true, force: true });
      }
    },
  },
  {
    title: 'release：team 发布失败把 private 放回去；没登录先问人且不跑门禁',
    async run(_ctx, report) {
      const title = 'release：team 发布失败把 private 放回去；没登录先问人且不跑门禁';
      const dir = probeOf();
      const home = homeOf();
      try {
        const failing = fakeExec(dir, { publish: fail('E500 boom') });
        const error = await failureOf(
          runRelease({
            root: dir,
            home,
            args: ['--target', 'team', '--registry', 'https://npm.demo.test/', '--yes'],
            exec: failing.exec,
            out: () => {},
            err: () => {},
          }),
        );
        if (!(error instanceof ReleaseError)) throw new Error('发布失败没报 ReleaseError');
        const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
        if (manifest.private !== true) throw new Error('失败后 private 没放回去');
        const anonymous = fakeExec(dir, { whoami: fail('npm error code ENEEDAUTH') });
        const login = await failureOf(
          runRelease({
            root: dir,
            home,
            args: ['--target', 'team', '--registry', 'https://npm.demo.test/', '--yes'],
            exec: anonymous.exec,
            out: () => {},
            err: () => {},
          }),
        );
        if (!(login instanceof NeedsUser) || login.step !== 'login') throw new Error('没登录没先问人');
        if (hasCall(anonymous.calls, process.execPath, 'build')) throw new Error('没登录就跑了 build');
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      } finally {
        rmSync(dir, { recursive: true, force: true });
        rmSync(home, { recursive: true, force: true });
      }
    },
  },

  {
    title: 'release：dry-run 只预览，不写盘、不 publish、不留状态',
    async run(_ctx, report) {
      const title = 'release：dry-run 只预览，不写盘、不 publish、不留状态';
      const dir = probeOf();
      const home = homeOf();
      const fake = fakeExec(dir);
      try {
        const result = await runRelease({
          root: dir,
          home,
          args: ['--target', 'tarball', '--dry-run', '--json'],
          exec: fake.exec,
          out: () => {},
          err: () => {},
        });
        const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
        if (result.dryRun !== true) throw new Error('dryRun 不是 true');
        if (manifest.private !== true) throw new Error('dry-run 改了 private');
        if (hasCall(fake.calls, 'npm', 'publish')) throw new Error('dry-run 跑了 publish');
        if (hasCall(fake.calls, 'npm', '--pack-destination')) throw new Error('dry-run 真打了包');
        if (existsSync(join(home, 'workbench', 'releases', 'probe.json'))) throw new Error('dry-run 写了状态');
        if (existsSync(join(home, 'workbench', 'artifacts', 'probe'))) throw new Error('dry-run 建了产物目录');
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      } finally {
        rmSync(dir, { recursive: true, force: true });
        rmSync(home, { recursive: true, force: true });
      }
    },
  },
  {
    title: 'release：没给 target 时，有私源走 team，没有就走 tarball',
    async run(_ctx, report) {
      const title = 'release：没给 target 时，有私源走 team，没有就走 tarball';
      const teamDir = probeOf({
        manifest: packageOf({ publishConfig: { registry: 'https://npm.demo.test/' } }),
      });
      const tarDir = probeOf();
      const home = homeOf();
      const team = fakeExec(teamDir);
      const tar = fakeExec(tarDir);
      try {
        const a = await runRelease({
          root: teamDir,
          home,
          args: ['--dry-run', '--json'],
          exec: team.exec,
          out: () => {},
          err: () => {},
        });
        const b = await runRelease({
          root: tarDir,
          home: homeOf(),
          args: ['--dry-run', '--json'],
          exec: tar.exec,
          out: () => {},
          err: () => {},
        });
        if (a.target !== 'team') throw new Error(`有私源没走 team：${a.target}`);
        if (b.target !== 'tarball') throw new Error(`没私源没走 tarball：${b.target}`);
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      } finally {
        rmSync(teamDir, { recursive: true, force: true });
        rmSync(tarDir, { recursive: true, force: true });
        rmSync(home, { recursive: true, force: true });
      }
    },
  },
  {
    title: 'release：local 是空操作，不跑门禁、不发任何东西',
    async run(_ctx, report) {
      const title = 'release：local 是空操作，不跑门禁、不发任何东西';
      const dir = probeOf();
      const home = homeOf();
      const fake = fakeExec(dir);
      try {
        const result = await runRelease({
          root: dir,
          home,
          args: ['--target', 'local', '--json'],
          exec: fake.exec,
          out: () => {},
          err: () => {},
        });
        if (result.target !== 'local') throw new Error('target 不是 local');
        if (hasCall(fake.calls, 'npm', 'publish')) throw new Error('local 跑了 publish');
        if (fake.calls.some((one) => one.command.endsWith('node'))) throw new Error('local 跑了门禁');
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      } finally {
        rmSync(dir, { recursive: true, force: true });
        rmSync(home, { recursive: true, force: true });
      }
    },
  },
  {
    title: 'release：public 名字被占 → needsUser name，且把 private 放回去',
    async run(_ctx, report) {
      const title = 'release：public 名字被占 → needsUser name，且把 private 放回去';
      const dir = probeOf();
      const home = homeOf();
      const fake = fakeExec(dir, { publish: fail('npm error E403 Forbidden name already exists') });
      try {
        const error = await failureOf(
          runRelease({
            root: dir,
            home,
            args: ['--target', 'public', '--license', 'MIT', '--yes'],
            exec: fake.exec,
            out: () => {},
            err: () => {},
          }),
        );
        if (!(error instanceof NeedsUser) || error.step !== 'name') throw new Error(`没给改名交接：${error?.message ?? error}`);
        const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
        if (manifest.private !== true) throw new Error('失败后 private 没放回去');
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      } finally {
        rmSync(dir, { recursive: true, force: true });
        rmSync(home, { recursive: true, force: true });
      }
    },
  },
  {
    title: 'release：状态是 published 时重跑只核验，不再发一版',
    async run(_ctx, report) {
      const title = 'release：状态是 published 时重跑只核验，不再发一版';
      const dir = probeOf();
      const home = homeOf();
      const fake = fakeExec(dir);
      try {
        await runRelease({
          root: dir,
          home,
          args: ['--target', 'team', '--registry', 'https://npm.demo.test/', '--yes', '--json'],
          exec: fake.exec,
          out: () => {},
          err: () => {},
        });
        const file = join(home, 'workbench', 'releases', 'probe.json');
        const state = JSON.parse(readFileSync(file, 'utf8'));
        writeFileSync(file, `${JSON.stringify({ ...state, status: 'published' }, null, 2)}\n`);
        const before = fake.calls.filter((one) => one.command === 'npm' && one.argv[0] === 'publish').length;
        const second = await runRelease({
          root: dir,
          home,
          args: ['--target', 'team', '--json'],
          exec: fake.exec,
          out: () => {},
          err: () => {},
        });
        const after = fake.calls.filter((one) => one.command === 'npm' && one.argv[0] === 'publish').length;
        if (second.verified !== true) throw new Error('重跑没核验');
        if (after !== before) throw new Error('重跑又发了一版');
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      } finally {
        rmSync(dir, { recursive: true, force: true });
        rmSync(home, { recursive: true, force: true });
      }
    },
  },

  {
    title: 'release：配了可写索引就默认发市场，产物与索引都进仓库',
    async run(_ctx, report) {
      const title = 'release：配了可写索引就默认发市场，产物与索引都进仓库';
      const dir = probeOf({ manifest: packageOf({ author: 'Probe <probe@example.com>' }) });
      const repo = mkdtempSync(join(tmpdir(), 'wb-rel-market-'));
      const home = homeOf();
      const fake = fakeExec(dir);
      try {
        const result = await runRelease({
          root: dir,
          home,
          args: ['--index', repo, '--yes', '--json'],
          exec: fake.exec,
          out: () => {},
          err: () => {},
        });
        if (result.target !== 'market') throw new Error(`没默认走 market：${result.target}`);
        if (!existsSync(join(repo, 'packages', '@demo', 'probe', 'package.json'))) throw new Error('产物没进仓库');
        if (!indexExists(repo)) throw new Error('索引没写');
        if (!result.install.includes('&path:/packages/@demo/probe')) throw new Error(`安装 spec 不对：${result.install}`);
        if (hasCall(fake.calls, 'npm', 'publish')) throw new Error('market 不该 publish');
        if (fake.calls.filter((one) => one.command === 'git' && one.argv.includes('push')).length !== 2) {
          throw new Error('应该推两次（产物 + 索引）');
        }
        const state = JSON.parse(readFileSync(join(home, 'workbench', 'releases', 'probe.json'), 'utf8'));
        if (state.target !== 'market' || state.commit !== COMMIT) throw new Error('状态不对');
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      } finally {
        rmSync(dir, { recursive: true, force: true });
        rmSync(repo, { recursive: true, force: true });
        rmSync(home, { recursive: true, force: true });
      }
    },
  },
  {
    title: 'release：市场发布中断落 journal，--resume 跳过门禁、接着补完',
    async run(_ctx, report) {
      const title = 'release：市场发布中断落 journal，--resume 跳过门禁、接着补完';
      const dir = probeOf({ manifest: packageOf({ author: 'Probe <probe@example.com>' }) });
      const repo = mkdtempSync(join(tmpdir(), 'wb-rel-resume-'));
      const home = homeOf();
      const failing = fakeExec(dir, { pushes: [ok(), fail('permission denied'), fail('permission denied')] });
      try {
        const first = await failureOf(
          runRelease({
            root: dir,
            home,
            args: ['--index', repo, '--yes', '--json'],
            exec: failing.exec,
            out: () => {},
            err: () => {},
          }),
        );
        if (!(first instanceof ResumableError)) throw new Error(`中断没给可续跑错误：${first?.message ?? first}`);
        if (first.resume?.phase !== 'index') throw new Error(`phase 不对：${String(first.resume?.phase)}`);
        const state = JSON.parse(readFileSync(join(home, 'workbench', 'releases', 'probe.json'), 'utf8'));
        if (state.run?.state !== 'interrupted') throw new Error(`journal 没落 interrupted：${String(state.run?.state)}`);
        if (state.run?.phase !== 'index') throw new Error(`journal phase 不对：${String(state.run?.phase)}`);
        if (state.run?.artifactPushed !== true) throw new Error('没记下产物已推上去');
        if (state.run?.indexPlan === undefined) throw new Error('没记下索引计划');
        const retry = fakeExec(dir);
        const second = await runRelease({
          root: dir,
          home,
          args: ['--resume', '--yes', '--json'],
          exec: retry.exec,
          out: () => {},
          err: () => {},
        });
        if (second.target !== 'market') throw new Error(`续跑没走市场：${String(second.target)}`);
        if (second.market?.updated !== true) throw new Error(`续跑没更新索引：${second.market?.reason}`);
        if (hasCall(retry.calls, 'npm', 'run')) throw new Error('续跑又把门禁跑了一遍');
        if (!second.install.includes('&path:/packages/@demo/probe')) throw new Error(`安装 spec 不对：${second.install}`);
        const done = JSON.parse(readFileSync(join(home, 'workbench', 'releases', 'probe.json'), 'utf8'));
        if (done.run?.state !== 'done' || done.status !== 'verified') throw new Error('续跑没落 done');
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      } finally {
        rmSync(dir, { recursive: true, force: true });
        rmSync(repo, { recursive: true, force: true });
        rmSync(home, { recursive: true, force: true });
      }
    },
  },
  {
    title: 'release：团队源没配 → needsUser registry；scope 不对 → needsUser scope',
    async run(_ctx, report) {
      const title = 'release：团队源没配 → needsUser registry；scope 不对 → needsUser scope';
      const dir = probeOf();
      const home = homeOf();
      const bare = fakeExec(dir);
      try {
        const noRegistry = await failureOf(
          runRelease({
            root: dir,
            home,
            args: ['--target', 'team', '--yes'],
            exec: bare.exec,
            out: () => {},
            err: () => {},
          }),
        );
        if (!(noRegistry instanceof NeedsUser) || noRegistry.step !== 'registry') {
          throw new Error(`没给配源交接：${noRegistry?.message ?? noRegistry}`);
        }
        const scoped = fakeExec(dir, { publish: fail('npm error E402 Payment Required scope') });
        const scope = await failureOf(
          runRelease({
            root: dir,
            home,
            args: ['--target', 'team', '--registry', 'https://npm.demo.test/', '--yes'],
            exec: scoped.exec,
            out: () => {},
            err: () => {},
          }),
        );
        if (!(scope instanceof NeedsUser) || scope.step !== 'scope') {
          throw new Error(`没给 scope 交接：${scope?.message ?? scope}`);
        }
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      } finally {
        rmSync(dir, { recursive: true, force: true });
        rmSync(home, { recursive: true, force: true });
      }
    },
  },
  {
    title: 'release：这一版没有更新日志 → needsUser changelog，门禁都不跑',
    async run(_ctx, report) {
      const title = 'release：这一版没有更新日志 → needsUser changelog，门禁都不跑';
      const dir = probeOf({
        changelog: '# 更新日志\n\n## v0.1.0\n\n`2026-10-01`\n\n### ✨ 新增\n\n- 老版本\n',
      });
      const home = homeOf();
      const fake = fakeExec(dir, { versions: ['0.1.0'] });
      try {
        const error = await failureOf(
          runRelease({
            root: dir,
            home,
            args: ['--target', 'team', '--registry', 'https://npm.demo.test/', '--yes'],
            exec: fake.exec,
            out: () => {},
            err: () => {},
          }),
        );
        if (!(error instanceof NeedsUser) || error.step !== 'changelog') {
          throw new Error(`没拦住缺更新日志：${error?.message ?? error}`);
        }
        if (!String(error.command).includes('--changelog-note')) {
          throw new Error(`没给补更新日志的命令：${String(error.command)}`);
        }
        if (hasCall(fake.calls, process.execPath, 'build')) throw new Error('更新日志没过就跑了 build');
        if (hasCall(fake.calls, 'npm', 'publish')) throw new Error('更新日志没过却跑了 publish');
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      } finally {
        rmSync(dir, { recursive: true, force: true });
        rmSync(home, { recursive: true, force: true });
      }
    },
  },
  {
    title: 'release：带上这一版的 note 就写进 CHANGELOG，产物再把这一版发出去',
    async run(_ctx, report) {
      const title = 'release：带上这一版的 note 就写进 CHANGELOG，产物再把这一版发出去';
      const dir = probeOf({
        changelog: '# 更新日志\n\n## v0.1.0\n\n`2026-10-01`\n\n### ✨ 新增\n\n- 老版本\n',
      });
      const home = homeOf();
      const fake = fakeExec(dir, { versions: ['0.1.0'] });
      try {
        const result = await runRelease({
          root: dir,
          home,
          args: [
            '--target',
            'team',
            '--registry',
            'https://npm.demo.test/',
            '--changelog-note',
            '这一版修了一条',
            '--changelog-type',
            'fixed',
            '--yes',
            '--json',
          ],
          exec: fake.exec,
          out: () => {},
          err: () => {},
        });
        if (result.version !== '0.1.1') throw new Error(`版本不对：${String(result.version)}`);
        if (result.changelog?.action !== 'written') throw new Error(`没写更新日志：${JSON.stringify(result.changelog)}`);
        if (result.changelog?.version !== '0.1.1') throw new Error('更新的版本不对');
        const text = readFileSync(join(dir, 'CHANGELOG.md'), 'utf8');
        if (!text.includes('## v0.1.1')) throw new Error('没写这一版的标题');
        if (!text.includes('### 🐛 修复')) throw new Error('没按分类写');
        if (!text.includes('- 这一版修了一条')) throw new Error('条目没写进去');
        if (!hasCall(fake.calls, 'npm', 'publish')) throw new Error('没有 publish');
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      } finally {
        rmSync(dir, { recursive: true, force: true });
        rmSync(home, { recursive: true, force: true });
      }
    },
  },
  {
    title: 'release：没写作者时从 git config 补上，索引与产物都带 author',
    async run(_ctx, report) {
      const title = 'release：没写作者时从 git config 补上，索引与产物都带 author';
      const dir = probeOf();
      const repo = mkdtempSync(join(tmpdir(), 'wb-rel-author-'));
      const home = homeOf();
      const fake = fakeExec(dir, { authorName: 'Probe', authorEmail: 'probe@example.com' });
      try {
        const result = await runRelease({
          root: dir,
          home,
          args: ['--index', repo, '--yes', '--json'],
          exec: fake.exec,
          out: () => {},
          err: () => {},
        });
        if (!result.changes.includes('author ← git config')) {
          throw new Error(`changes 里没记作者来源：${JSON.stringify(result.changes)}`);
        }
        const shipped = JSON.parse(readFileSync(join(repo, 'packages', '@demo', 'probe', 'package.json'), 'utf8'));
        if (shipped.author !== 'Probe <probe@example.com>') throw new Error(`产物里的 author 不对：${shipped.author}`);
        const index = readIndex(repo);
        if (index.plugins[0]?.author !== 'Probe <probe@example.com>') throw new Error('索引里没写作者');
        if (!existsSync(join(repo, 'packages', '@demo', 'probe', 'CHANGELOG.md'))) throw new Error('更新日志没随产物发布');
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      } finally {
        rmSync(dir, { recursive: true, force: true });
        rmSync(repo, { recursive: true, force: true });
        rmSync(home, { recursive: true, force: true });
      }
    },
  },
  {
    title: 'release：索引与产物的提交用模块作者署名（不是本机 fallback 那个 ksen@host）',
    async run(_ctx, report) {
      const title = 'release：索引与产物的提交用模块作者署名（不是本机 fallback 那个 ksen@host）';
      const dir = probeOf({ manifest: packageOf({ author: { name: '陈康', email: 'kang@example.com' } }) });
      const repo = mkdtempSync(join(tmpdir(), 'wb-rel-sign-'));
      const home = homeOf();
      const fake = fakeExec(dir);
      try {
        const result = await runRelease({
          root: dir,
          home,
          args: ['--index', repo, '--yes', '--json'],
          exec: fake.exec,
          out: () => {},
          err: () => {},
        });
        if (result.target !== 'market') throw new Error(`没走市场：${result.target}`);
        const commits = fake.calls.filter((one) => one.command === 'git' && one.argv.includes('commit'));
        if (commits.length < 2) throw new Error(`产物与索引该各提交一次，实际 ${String(commits.length)} 次`);
        for (const one of commits) {
          const line = one.argv.join(' ');
          if (!line.includes('user.name=陈康') || !line.includes('user.email=kang@example.com')) {
            throw new Error(`commit 没带作者署名：${line}`);
          }
        }
        const index = readIndex(repo);
        if (index.plugins[0]?.author !== '陈康') throw new Error(`索引作者不对：${String(index.plugins[0]?.author)}`);
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      } finally {
        rmSync(dir, { recursive: true, force: true });
        rmSync(repo, { recursive: true, force: true });
        rmSync(home, { recursive: true, force: true });
      }
    },
  },
  {
    title: 'release：--author 换署名：写回 package.json，产物、索引与提交都用它',
    async run(_ctx, report) {
      const title = 'release：--author 换署名：写回 package.json，产物、索引与提交都用它';
      const dir = probeOf({ manifest: packageOf({ author: '旧署名' }) });
      const repo = mkdtempSync(join(tmpdir(), 'wb-rel-author-flag-'));
      const home = homeOf();
      const fake = fakeExec(dir, { authorName: '本机', authorEmail: 'local@example.com' });
      try {
        const result = await runRelease({
          root: dir,
          home,
          args: ['--index', repo, '--author', '陈康 <kang@example.com>', '--yes', '--json'],
          exec: fake.exec,
          out: () => {},
          err: () => {},
        });
        if (!result.changes.includes('author ← --author')) {
          throw new Error(`changes 里没记这次换署名：${JSON.stringify(result.changes)}`);
        }
        const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
        if (manifest.author !== '陈康 <kang@example.com>') throw new Error(`manifest 没换：${manifest.author}`);
        const shipped = JSON.parse(readFileSync(join(repo, 'packages', '@demo', 'probe', 'package.json'), 'utf8'));
        if (shipped.author !== '陈康 <kang@example.com>') throw new Error(`产物里没换：${shipped.author}`);
        const index = readIndex(repo);
        if (index.plugins[0]?.author !== '陈康 <kang@example.com>') throw new Error(`索引里没换：${String(index.plugins[0]?.author)}`);
        const commits = fake.calls.filter((one) => one.command === 'git' && one.argv.includes('commit'));
        if (commits.length < 2) throw new Error(`产物与索引该各提交一次，实际 ${String(commits.length)} 次`);
        for (const one of commits) {
          const line = one.argv.join(' ');
          if (!line.includes('user.name=陈康') || !line.includes('user.email=kang@example.com')) {
            throw new Error(`commit 没带新署名：${line}`);
          }
        }
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      } finally {
        rmSync(dir, { recursive: true, force: true });
        rmSync(repo, { recursive: true, force: true });
        rmSync(home, { recursive: true, force: true });
      }
    },
  },
  {
    title: 'release：市集标题取模块自己的 messages（<unit>.cardTitle），不用往 package.json 里补',
    async run(_ctx, report) {
      const title = 'release：市集标题取模块自己的 messages（<unit>.cardTitle），不用往 package.json 里补';
      const dir = probeOf({ manifest: packageOf({ author: 'Probe <probe@example.com>' }) });
      mkdirSync(join(dir, 'src'), { recursive: true });
      writeFileSync(
        join(dir, 'src', 'messages.ts'),
        [
          'export const messages = {',
          "  zh: { 'probe.cardTitle': '探针' },",
          "  en: { 'probe.cardTitle': 'Probe' },",
          '};',
          '',
        ].join('\n'),
      );
      const repo = mkdtempSync(join(tmpdir(), 'wb-rel-title-'));
      const home = homeOf();
      const fake = fakeExec(dir);
      try {
        await runRelease({
          root: dir,
          home,
          args: ['--index', repo, '--yes', '--json'],
          exec: fake.exec,
          out: () => {},
          err: () => {},
        });
        const index = readIndex(repo);
        if (index.plugins[0]?.title?.zh !== '探针' || index.plugins[0]?.title?.en !== 'Probe') {
          throw new Error(`索引标题不对：${JSON.stringify(index.plugins[0]?.title)}`);
        }
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      } finally {
        rmSync(dir, { recursive: true, force: true });
        rmSync(repo, { recursive: true, force: true });
        rmSync(home, { recursive: true, force: true });
      }
    },
  },
  {
    title: 'release：--refresh 只改索引里的元数据（标题），版本号与产物都不动',
    async run(_ctx, report) {
      const title = 'release：--refresh 只改索引里的元数据（标题），版本号与产物都不动';
      const dir = probeOf({ manifest: packageOf({ author: 'Probe <probe@example.com>' }) });
      mkdirSync(join(dir, 'src'), { recursive: true });
      const messages = (name) =>
        ['export const messages = {', `  zh: { 'probe.cardTitle': '${name}' },`, '  en: {', "    'probe.cardTitle': 'Probe',", '  },', '};', ''].join('\n');
      writeFileSync(join(dir, 'src', 'messages.ts'), messages('旧名'));
      const repo = mkdtempSync(join(tmpdir(), 'wb-rel-refresh-'));
      const home = homeOf();
      const fake = fakeExec(dir);
      try {
        await runRelease({
          root: dir,
          home,
          args: ['--index', repo, '--yes', '--json'],
          exec: fake.exec,
          out: () => {},
          err: () => {},
        });
        writeFileSync(join(dir, 'src', 'messages.ts'), messages('新名'));
        const result = await runRelease({
          root: dir,
          home,
          args: ['--index', repo, '--refresh', '--target', 'market', '--yes', '--json'],
          exec: fake.exec,
          out: () => {},
          err: () => {},
        });
        if (result.refresh !== true || result.refreshed !== true) {
          throw new Error(`没标记成刷新：${JSON.stringify({ refresh: result.refresh, refreshed: result.refreshed })}`);
        }
        const index = readIndex(repo);
        const entry = index.plugins[0];
        if (entry.title?.zh !== '新名') throw new Error(`标题没刷：${JSON.stringify(entry.title)}`);
        if (entry.versions.length !== 1 || entry.versions[0].version !== '0.1.0') {
          throw new Error(`版本被动了：${JSON.stringify(entry.versions.map((one) => one.version))}`);
        }
        if (fake.state.commits !== 3) throw new Error(`提交次数不对（应只多一次索引提交）：${String(fake.state.commits)}`);
        const again = await runRelease({
          root: dir,
          home,
          args: ['--index', repo, '--refresh', '--target', 'market', '--yes', '--json'],
          exec: fake.exec,
          out: () => {},
          err: () => {},
        });
        if (again.refreshed !== false) throw new Error('元数据没变却又刷了一次');
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      } finally {
        rmSync(dir, { recursive: true, force: true });
        rmSync(repo, { recursive: true, force: true });
        rmSync(home, { recursive: true, force: true });
      }
    },
  },
  {
    title: 'release：市场里同名归原主，换署名发被拒且产物不动',
    async run(_ctx, report) {
      const title = 'release：市场里同名归原主，换署名发被拒且产物不动';
      const dir = probeOf({ manifest: packageOf({ author: '甲 <jia@example.com>' }) });
      const repo = mkdtempSync(join(tmpdir(), 'wb-rel-owner-'));
      const home = homeOf();
      const fake = fakeExec(dir);
      try {
        await runRelease({
          root: dir,
          home,
          args: ['--index', repo, '--yes', '--json'],
          exec: fake.exec,
          out: () => {},
          err: () => {},
        });
        const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
        manifest.version = '0.1.1';
        manifest.author = '乙 <yi@example.com>';
        writeFileSync(join(dir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
        const error = await failureOf(
          runRelease({
            root: dir,
            home,
            args: ['--index', repo, '--yes', '--json'],
            exec: fake.exec,
            out: () => {},
            err: () => {},
          }),
        );
        if (!(error instanceof ReleaseError)) throw new Error(`没拦住：${error?.message ?? error}`);
        if (!error.message.includes('已经有主')) throw new Error(`拒的理由不对：${error.message}`);
        const shipped = JSON.parse(readFileSync(join(repo, 'packages', '@demo', 'probe', 'package.json'), 'utf8'));
        if (shipped.version !== '0.1.0') throw new Error(`别人的产物被动了：${shipped.version}`);
        const index = readIndex(repo);
        const entry = index.plugins[0];
        if (entry.owner !== '甲 <jia@example.com>') throw new Error(`owner 被换了：${String(entry.owner)}`);
        if (entry.versions.length !== 1 || entry.versions[0].version !== '0.1.0') {
          throw new Error(`索引版本被动了：${JSON.stringify(entry.versions.map((one) => one.version))}`);
        }
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      } finally {
        rmSync(dir, { recursive: true, force: true });
        rmSync(repo, { recursive: true, force: true });
        rmSync(home, { recursive: true, force: true });
      }
    },
  },
  {
    title: 'release：原主只换了署名格式（姓名不变）还能发，owner 不动',
    async run(_ctx, report) {
      const title = 'release：原主只换了署名格式（姓名不变）还能发，owner 不动';
      const dir = probeOf({ manifest: packageOf({ author: '陈康' }) });
      const repo = mkdtempSync(join(tmpdir(), 'wb-rel-owner-format-'));
      const home = homeOf();
      const fake = fakeExec(dir);
      try {
        await runRelease({
          root: dir,
          home,
          args: ['--index', repo, '--yes', '--json'],
          exec: fake.exec,
          out: () => {},
          err: () => {},
        });
        const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
        manifest.version = '0.1.1';
        manifest.author = '陈康 <kang@example.com>';
        writeFileSync(join(dir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
        const result = await runRelease({
          root: dir,
          home,
          args: ['--index', repo, '--yes', '--json'],
          exec: fake.exec,
          out: () => {},
          err: () => {},
        });
        if (result.version !== '0.1.1') throw new Error(`版本不对：${String(result.version)}`);
        const index = readIndex(repo);
        const entry = index.plugins[0];
        if (entry.owner !== '陈康') throw new Error(`owner 跟着署名漂了：${String(entry.owner)}`);
        if (!entry.versions.some((one) => one.version === '0.1.1')) {
          throw new Error(`新版本没进索引：${JSON.stringify(entry.versions.map((one) => one.version))}`);
        }
        const shipped = JSON.parse(readFileSync(join(repo, 'packages', '@demo', 'probe', 'package.json'), 'utf8'));
        if (shipped.version !== '0.1.1') throw new Error(`产物没跟上：${shipped.version}`);
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      } finally {
        rmSync(dir, { recursive: true, force: true });
        rmSync(repo, { recursive: true, force: true });
        rmSync(home, { recursive: true, force: true });
      }
    },
  },
  {
    title: 'release：没有署名不许往市场里发，仓库一个字节都不写',
    async run(_ctx, report) {
      const title = 'release：没有署名不许往市场里发，仓库一个字节都不写';
      const dir = probeOf();
      const repo = mkdtempSync(join(tmpdir(), 'wb-rel-anon-'));
      const home = homeOf();
      const fake = fakeExec(dir);
      try {
        const error = await failureOf(
          runRelease({
            root: dir,
            home,
            args: ['--index', repo, '--yes', '--json'],
            exec: fake.exec,
            out: () => {},
            err: () => {},
          }),
        );
        if (!(error instanceof ReleaseError)) throw new Error(`没拦住：${error?.message ?? error}`);
        if (!error.message.includes('名字要有主人')) throw new Error(`拒的理由不对：${error.message}`);
        if (existsSync(join(repo, 'packages')) || indexExists(repo)) {
          throw new Error('没署名却往仓库里写了东西');
        }
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      } finally {
        rmSync(dir, { recursive: true, force: true });
        rmSync(repo, { recursive: true, force: true });
        rmSync(home, { recursive: true, force: true });
      }
    },
  },
  {
    title: 'release：别人的条目不能靠 --refresh 改署名',
    async run(_ctx, report) {
      const title = 'release：别人的条目不能靠 --refresh 改署名';
      const dir = probeOf({ manifest: packageOf({ author: '甲 <jia@example.com>' }) });
      const repo = mkdtempSync(join(tmpdir(), 'wb-rel-refresh-owner-'));
      const home = homeOf();
      const fake = fakeExec(dir);
      try {
        await runRelease({
          root: dir,
          home,
          args: ['--index', repo, '--yes', '--json'],
          exec: fake.exec,
          out: () => {},
          err: () => {},
        });
        const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
        manifest.author = '乙 <yi@example.com>';
        writeFileSync(join(dir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
        const before = fake.state.commits;
        const error = await failureOf(
          runRelease({
            root: dir,
            home,
            args: ['--index', repo, '--refresh', '--target', 'market', '--yes', '--json'],
            exec: fake.exec,
            out: () => {},
            err: () => {},
          }),
        );
        if (!(error instanceof ReleaseError)) throw new Error(`没拦住：${error?.message ?? error}`);
        if (!error.message.includes('已经有主')) throw new Error(`拒的理由不对：${error.message}`);
        const index = readIndex(repo);
        const entry = index.plugins[0];
        if (entry.owner !== '甲 <jia@example.com>') throw new Error(`owner 被换了：${String(entry.owner)}`);
        if (entry.author !== '甲 <jia@example.com>') throw new Error(`署名被换了：${String(entry.author)}`);
        if (fake.state.commits !== before) throw new Error(`被拒的刷新还提交了一次：${String(fake.state.commits)}`);
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      } finally {
        rmSync(dir, { recursive: true, force: true });
        rmSync(repo, { recursive: true, force: true });
        rmSync(home, { recursive: true, force: true });
      }
    },
  },
  {
    title: 'release：换一个包名但沿用同一个 unit 会被拒，旧产物不动',
    async run(_ctx, report) {
      const title = 'release：换一个包名但沿用同一个 unit 会被拒，旧产物不动';
      const dir = probeOf({ manifest: packageOf({ author: '甲 <jia@example.com>' }) });
      const repo = mkdtempSync(join(tmpdir(), 'wb-rel-unit-'));
      const home = homeOf();
      const fake = fakeExec(dir);
      try {
        await runRelease({
          root: dir,
          home,
          args: ['--index', repo, '--yes', '--json'],
          exec: fake.exec,
          out: () => {},
          err: () => {},
        });
        const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
        manifest.name = '@demo/other';
        manifest.version = '0.1.1';
        writeFileSync(join(dir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
        const error = await failureOf(
          runRelease({
            root: dir,
            home,
            args: ['--index', repo, '--yes', '--json'],
            exec: fake.exec,
            out: () => {},
            err: () => {},
          }),
        );
        if (!(error instanceof ReleaseError)) throw new Error(`没拦住：${error?.message ?? error}`);
        if (!error.message.includes('模块 id')) throw new Error(`拒的理由不对：${error.message}`);
        if (!existsSync(join(repo, 'packages', '@demo', 'probe', 'package.json'))) {
          throw new Error('旧产物被删了');
        }
        if (existsSync(join(repo, 'packages', '@demo', 'other'))) throw new Error('新包名也写了产物');
        const index = readIndex(repo);
        if (index.plugins.length !== 1 || index.plugins[0].name !== '@demo/probe') {
          throw new Error(`索引被动了：${JSON.stringify(index.plugins.map((one) => one.name))}`);
        }
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      } finally {
        rmSync(dir, { recursive: true, force: true });
        rmSync(repo, { recursive: true, force: true });
        rmSync(home, { recursive: true, force: true });
      }
    },
  },
];
