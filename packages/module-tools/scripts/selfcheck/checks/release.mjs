import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NeedsUser, ReleaseError, runRelease } from '../../../src/release.mjs';

const FILES = [
  { path: 'client.js', size: 10 },
  { path: 'cordis.patch.yml', size: 10 },
  { path: 'dist/host.js', size: 10 },
  { path: 'package.json', size: 10 },
  { path: 'README.md', size: 10 },
];

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

function probeOf({ checked = true, manifest = packageOf() } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'wb-rel-'));
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(dir, 'design.json'), `${JSON.stringify(designOf(checked), null, 2)}\n`);
  writeFileSync(join(dir, 'cordis.patch.yml'), '- id: probe\n');
  return dir;
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
      const verb = argv[0] === '-C' ? argv[2] : argv[0];
      const rest = argv[0] === '-C' ? argv.slice(3) : argv.slice(1);
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
        return plan.push === undefined ? ok() : plan.push;
      }
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
];
