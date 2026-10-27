import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  MarketIndexError,
  indexEntryOf,
  initializeMarketRepo,
  mergeIndexText,
  resolveIndexPlan,
  sanitizeManifest,
  updateMarketIndex,
} from '../../../src/market-index.mjs';

const COMMIT = 'a'.repeat(40);

const MANIFEST = {
  name: '@demo/market-probe',
  title: { zh: '探针', en: 'Probe' },
  version: '0.1.0',
  description: 'probe',
  private: true,
  keywords: ['probe', 'workbench'],
  author: { name: 'demo' },
  homepage: 'https://example.com/probe',
  engines: { dsh: '^0.2.1' },
  scripts: { prepack: 'dsh-wb-module build', test: 'vitest run' },
  dependencies: { '@demo/shared': 'workspace:*', left: '1.0.0' },
  devDependencies: { '@demo/tools': 'workspace:*' },
  dsh: {
    workbench: {
      unit: 'probe',
      card: { order: 90 },
      market: { category: '工具', labels: ['探针', '测试'] },
    },
  },
};

const FILES = ['client.js', 'cordis.patch.yml', 'README.md', 'dist/host.js'];

function ok(stdout = '') {
  return { status: 0, stdout, stderr: '' };
}

function fail(stderr = '') {
  return { status: 1, stdout: '', stderr };
}

function fakeExec(results = {}) {
  const calls = [];
  const pushes = [...(results.pushes ?? [])];
  const exec = (command, argv, options = {}) => {
    calls.push({ command, argv, options });
    if (command !== 'git') return ok();
    const base = argv[0] === '-C' ? 2 : -1;
    const verb = base === 2 ? argv[2] : argv[0];
    const rest = base === 2 ? argv.slice(3) : argv.slice(1);
    if (verb === 'remote' && rest[0] === 'get-url') return ok(`${results.url ?? 'https://github.com/demo/market.git'}\n`);
    if (verb === 'status') return results.status ?? ok('');
    if (verb === 'rev-parse' && rest[0] === '--verify') return results.hasHead === false ? fail('fatal: Needed a single revision') : ok(`${results.commit ?? COMMIT}\n`);
    if (verb === 'rev-parse' && rest[0] === '--abbrev-ref') return ok('main\n');
    if (verb === 'rev-parse' && rest[0] === 'HEAD') return ok(`${results.commit ?? COMMIT}\n`);
    if (verb === 'push') return pushes.length === 0 ? (results.push ?? ok()) : pushes.shift();
    if (verb === 'ls-remote') return ok(`${results.remoteHead ?? results.commit ?? COMMIT}\trefs/heads/main\n`);
    if (verb === 'fetch') return ok();
    if (verb === 'reset') return ok();
    return ok();
  };
  return { exec, calls, pushes };
}

function moduleDir(manifest = MANIFEST) {
  const dir = mkdtempSync(join(tmpdir(), 'wb-market-unit-'));
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  for (const file of FILES) {
    const target = join(dir, file);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, 'x');
  }
  return dir;
}

function marketDir(text) {
  const dir = mkdtempSync(join(tmpdir(), 'wb-market-repo-'));
  if (text !== undefined) writeFileSync(join(dir, 'market.json'), text);
  return dir;
}

function indexTextOf(dir) {
  return readFileSync(join(dir, 'market.json'), 'utf8');
}

function entryOfText(text, name = MANIFEST.name) {
  const parsed = JSON.parse(text);
  return parsed.plugins.find((one) => one.name === name);
}

export const checks = [
  {
    title: 'market-index：条目按 format 1 生成、同包再发一版只 upsert',
    async run(_ctx, report) {
      const title = 'market-index：条目按 format 1 生成、同包再发一版只 upsert';
      try {
        const first = indexEntryOf({
          manifest: MANIFEST,
          version: '0.1.0',
          source: { type: 'npm', registry: 'https://npm.demo.test/' },
          at: 1760000000000,
        });
        const merged = mergeIndexText('', first);
        if (!merged.ok) throw new Error(`空索引合不过：${JSON.stringify(merged.problems)}`);
        const second = indexEntryOf({
          manifest: MANIFEST,
          version: '0.2.0',
          source: { type: 'npm', registry: 'https://npm.demo.test/' },
          at: 1760000100000,
        });
        const again = mergeIndexText(merged.text, second);
        if (!again.ok) throw new Error(`第二版合不过：${JSON.stringify(again.problems)}`);
        const entry = entryOfText(again.text);
        if (entry.versions.length !== 2) throw new Error(`版本数不对：${entry.versions.length}`);
        if (entry.versions[0].version !== '0.2.0') throw new Error('版本没按降序排');
        if (entry.metadata?.workbench !== true) throw new Error('缺 workbench 身份标记');
        if (entry.metadata?.category !== '工具') throw new Error('分类没从 manifest 的 market 读');
        if (entry.metadata?.labels?.join(',') !== '探针,测试') throw new Error('标签没从 manifest 的 market 读');
        if (entry.metadata?.sortKeys?.order !== 90) throw new Error('缺 sortKeys.order');
        if (entry.versions[0].publishTimestamp !== 1760000100) throw new Error('时间戳不是 Unix 秒');
        if (entry.versions[0].engines?.dsh !== '^0.2.1') throw new Error('缺 engines.dsh');
        if (entry.title?.zh !== '探针' || entry.title?.en !== 'Probe') throw new Error('条目没带模块自报的标题');
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      }
    },
  },
  {
    title: 'market-index：没写 market 元数据就不编分类与标签（身份标记另算）',
    async run(_ctx, report) {
      const title = 'market-index：没写 market 元数据就不编分类与标签（身份标记另算）';
      try {
        const { market: _market, ...workbench } = MANIFEST.dsh.workbench;
        const manifest = { ...MANIFEST, dsh: { workbench } };
        const entry = indexEntryOf({
          manifest,
          version: '0.1.0',
          source: { type: 'npm' },
          at: 1760000000000,
        });
        if (entry.metadata?.labels !== undefined) throw new Error(`凭空多出标签：${JSON.stringify(entry.metadata.labels)}`);
        if (entry.metadata?.category !== undefined) throw new Error(`凭空多出分类：${JSON.stringify(entry.metadata.category)}`);
        if (entry.metadata?.workbench !== true) throw new Error('缺 workbench 身份标记');
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      }
    },
  },
  {
    title: 'market-index：没写标题就不编（市集退回包名，不拿 description 冒充）',
    async run(_ctx, report) {
      const title = 'market-index：没写标题就不编（市集退回包名，不拿 description 冒充）';
      try {
        const { title: _title, ...bare } = MANIFEST;
        const entry = indexEntryOf({
          manifest: bare,
          version: '0.1.0',
          source: { type: 'npm' },
          at: 1760000000000,
        });
        if (entry.title !== undefined) throw new Error(`凭空多出标题：${JSON.stringify(entry.title)}`);
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      }
    },
  },
  {
    title: 'market-index：入库的 package.json 去掉 workspace:* 依赖与 scripts、保留 private',
    async run(_ctx, report) {
      const title = 'market-index：入库的 package.json 去掉 workspace:* 依赖与 scripts、保留 private';
      try {
        const clean = sanitizeManifest(MANIFEST);
        if (clean.dependencies['@demo/shared'] !== undefined) throw new Error('workspace 依赖没去掉');
        if (clean.dependencies.left !== '1.0.0') throw new Error('普通依赖被误删');
        if (clean.devDependencies !== undefined) throw new Error('空的 devDependencies 没删');
        if (clean.scripts !== undefined) throw new Error('scripts 没删（git 装会被 pnpm 拦）');
        if (clean.private !== true) throw new Error('private 被摘了');
        if (MANIFEST.dependencies['@demo/shared'] !== 'workspace:*') throw new Error('把入参改了');
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      }
    },
  },
  {
    title: 'market-index：catalog-only 只写索引条目、source 用 npm',
    async run(_ctx, report) {
      const title = 'market-index：catalog-only 只写索引条目、source 用 npm';
      const root = moduleDir();
      const repo = marketDir();
      try {
        const plan = resolveIndexPlan({ args: ['--index', repo], home: tmpdir(), exec: fakeExec().exec });
        if (plan?.policy !== 'artifacts-in-repo') throw new Error(`目录默认策略不对：${plan?.policy}`);
        plan.policy = 'catalog-only';
        const fake = fakeExec();
        const market = updateMarketIndex({
          plan,
          root,
          manifest: MANIFEST,
          unit: 'probe',
          version: '0.1.0',
          publish: { registry: 'https://npm.demo.test/' },
          exec: fake.exec,
          home: tmpdir(),
          now: () => 1760000000000,
        });
        if (market.updated !== true) throw new Error(`没更新：${market.reason}`);
        if (existsSync(join(repo, 'packages'))) throw new Error('catalog-only 不该拷产物');
        const entry = entryOfText(indexTextOf(repo));
        if (entry.versions[0].source.type !== 'npm') throw new Error('source 不是 npm');
        if (entry.versions[0].source.registry !== 'https://npm.demo.test/') throw new Error('registry 没写');
        if (!fake.calls.some((one) => one.argv.includes('push'))) throw new Error('没 push 索引');
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      } finally {
        rmSync(root, { recursive: true, force: true });
        rmSync(repo, { recursive: true, force: true });
      }
    },
  },
  {
    title: 'market-index：artifacts-in-repo 拷产物 + 两步 commit，source 用 git SHA',
    async run(_ctx, report) {
      const title = 'market-index：artifacts-in-repo 拷产物 + 两步 commit，source 用 git SHA';
      const root = moduleDir();
      const repo = marketDir('{"format":1,"plugins":[]}\n');
      try {
        const fake = fakeExec();
        const plan = resolveIndexPlan({ args: ['--index', repo], home: tmpdir(), exec: fake.exec });
        const market = updateMarketIndex({
          plan,
          root,
          manifest: MANIFEST,
          unit: 'probe',
          version: '0.1.0',
          publish: {},
          exec: fake.exec,
          home: tmpdir(),
          now: () => 1760000000000,
        });
        if (market.updated !== true) throw new Error(`没更新：${market.reason}`);
        const dir = join(repo, 'packages', '@demo', 'market-probe');
        for (const file of ['dist/host.js', 'client.js', 'cordis.patch.yml', 'README.md', 'package.json']) {
          if (!existsSync(join(dir, file))) throw new Error(`产物缺 ${file}`);
        }
        const packed = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
        if (packed.dependencies?.['@demo/shared'] !== undefined) throw new Error('入库 manifest 还带 workspace 依赖');
        if (packed.scripts !== undefined) throw new Error('入库 manifest 还带 scripts');
        if (packed.private !== true) throw new Error('入库 manifest 丢了 private');
        const entry = entryOfText(indexTextOf(repo));
        if (entry.versions[0].source.type !== 'git') throw new Error('source 不是 git');
        if (entry.versions[0].source.commit !== COMMIT) throw new Error('commit 不是 40 位 SHA');
        if (entry.versions[0].source.path !== 'packages/@demo/market-probe') throw new Error('path 不对');
        if (entry.metadata?.unit !== 'probe') throw new Error(`unit 没写进条目：${JSON.stringify(entry.metadata)}`);
        const commits = fake.calls.filter((one) => one.argv.includes('commit')).length;
        if (commits !== 2) throw new Error(`应该两个 commit，实际 ${commits}`);
        if (fake.calls.filter((one) => one.argv.includes('push')).length !== 2) throw new Error('应该推两次');
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      } finally {
        rmSync(root, { recursive: true, force: true });
        rmSync(repo, { recursive: true, force: true });
      }
    },
  },
  {
    title: 'market-index：索引推不上去如实说"没更新"，不抛、不回滚已发的包',
    async run(_ctx, report) {
      const title = 'market-index：索引推不上去如实说"没更新"，不抛、不回滚已发的包';
      const root = moduleDir();
      const repo = marketDir();
      try {
        const fake = fakeExec({ pushes: [fail('protected branch hook declined'), fail('protected branch hook declined')] });
        const plan = resolveIndexPlan({ args: ['--index', repo, '--index-policy', 'catalog-only'], home: tmpdir(), exec: fake.exec });
        const market = updateMarketIndex({
          plan,
          root,
          manifest: MANIFEST,
          unit: 'probe',
          version: '0.1.0',
          publish: { registry: 'https://npm.demo.test/' },
          exec: fake.exec,
          home: tmpdir(),
          now: () => 1760000000000,
        });
        if (market.updated !== false) throw new Error('推失败却报成功');
        if (typeof market.reason !== 'string' || !market.reason.includes('索引没更新')) {
          throw new Error(`没说清索引没更新：${market.reason}`);
        }
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      } finally {
        rmSync(root, { recursive: true, force: true });
        rmSync(repo, { recursive: true, force: true });
      }
    },
  },
  {
    title: 'market-index：远端分支没对上 → 报没更新（两个 commit 必须都推上去）',
    async run(_ctx, report) {
      const title = 'market-index：远端分支没对上 → 报没更新（两个 commit 必须都推上去）';
      const root = moduleDir();
      const repo = marketDir('{"format":1,"plugins":[]}\n');
      try {
        const fake = fakeExec({ remoteHead: 'd'.repeat(40) });
        const plan = resolveIndexPlan({ args: ['--index', repo], home: tmpdir(), exec: fake.exec });
        const market = updateMarketIndex({
          plan,
          root,
          manifest: MANIFEST,
          unit: 'probe',
          version: '0.1.0',
          publish: {},
          exec: fake.exec,
          home: tmpdir(),
          now: () => 1760000000000,
        });
        if (market.updated !== false) throw new Error('远端没对上却报成功');
        if (!String(market.reason).includes('没都推上去')) throw new Error(`没说清两个 commit：${market.reason}`);
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      } finally {
        rmSync(root, { recursive: true, force: true });
        rmSync(repo, { recursive: true, force: true });
      }
    },
  },
  {
    title: 'market-index：--index none 不更新；没配源时 auto 静默跳过',
    async run(_ctx, report) {
      const title = 'market-index：--index none 不更新；没配源时 auto 静默跳过';
      try {
        const none = resolveIndexPlan({ args: ['--index', 'none'], home: tmpdir(), exec: fakeExec().exec });
        if (none !== undefined) throw new Error('none 还给了计划');
        const auto = resolveIndexPlan({ args: [], home: mkdtempSync(join(tmpdir(), 'wb-market-home-')), exec: fakeExec().exec });
        if (auto !== undefined) throw new Error('没配源还给了计划');
        let error;
        try {
          resolveIndexPlan({ args: ['--index', 'not a url'], home: tmpdir(), exec: fakeExec().exec });
        } catch (thrown) {
          error = thrown;
        }
        if (!(error instanceof MarketIndexError) || error.step !== 'index-write') throw new Error('非法 --index 没拦住');
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      }
    },
  },
  {
    title: 'market-index：没写 policy 的源兜成只读，且能分清「没设过」与「显式写的 catalog-only」',
    async run(_ctx, report) {
      const title = 'market-index：没写 policy 的源兜成只读，且能分清「没设过」与「显式写的 catalog-only」';
      const home = mkdtempSync(join(tmpdir(), 'wb-market-policy-'));
      const dir = join(home, 'workbench', 'market-index');
      const base = { id: 'team', label: '团队', kind: 'git', url: 'https://github.com/demo/market.git' };
      try {
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'sources.json'), JSON.stringify({ selected: 'team', sources: [base] }));
        const fallback = resolveIndexPlan({ args: [], home, exec: fakeExec().exec });
        if (fallback?.policy !== 'catalog-only') throw new Error(`没印章没兜成只读：${fallback?.policy}`);
        if (fallback?.policyStated !== false) throw new Error('把兜底当成了显式写的 policy');
        if (fallback?.origin !== 'sources') throw new Error(`来源不对：${fallback?.origin}`);
        if (fallback?.sourceId !== 'team') throw new Error(`没带出源 id：${fallback?.sourceId}`);
        writeFileSync(
          join(dir, 'sources.json'),
          JSON.stringify({ selected: 'team', sources: [{ ...base, policy: 'catalog-only' }] }),
        );
        const stated = resolveIndexPlan({ args: [], home, exec: fakeExec().exec });
        if (stated?.policyStated !== true) throw new Error('显式写的 policy 没认出来');
        const flagged = resolveIndexPlan({ args: ['--index-policy', 'artifacts-in-repo'], home, exec: fakeExec().exec });
        if (flagged?.policy !== 'artifacts-in-repo' || flagged?.policyStated !== true) throw new Error('命令行 policy 没优先');
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      } finally {
        rmSync(home, { recursive: true, force: true });
      }
    },
  },
  {
    title: 'market-index：发布源与当前选中解耦（唯一可发布直接用；多源要指定；--index-source 优先）',
    async run(_ctx, report) {
      const title = 'market-index：发布源与当前选中解耦（唯一可发布直接用；多源要指定；--index-source 优先）';
      const home = mkdtempSync(join(tmpdir(), 'wb-market-source-'));
      const dir = join(home, 'workbench', 'market-index');
      const read = { id: 'read', label: '只读', kind: 'git', url: 'https://github.com/demo/read.git', policy: 'catalog-only' };
      const team = { id: 'team', label: '团队', kind: 'git', url: 'https://github.com/demo/team.git', policy: 'artifacts-in-repo' };
      const pub = { id: 'pub', label: '公开', kind: 'git', url: 'https://github.com/demo/pub.git', policy: 'artifacts-in-repo' };
      try {
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'sources.json'), JSON.stringify({ selected: 'read', sources: [read, team] }));
        const auto = resolveIndexPlan({ args: [], home, exec: fakeExec().exec });
        if (auto?.sourceId !== 'team') throw new Error(`唯一可发布源没被用上：${auto?.sourceId}`);
        if (auto?.policy !== 'artifacts-in-repo') throw new Error(`policy 不对：${auto?.policy}`);

        const asked = resolveIndexPlan({ args: ['--index-source', 'read'], home, exec: fakeExec().exec });
        if (asked?.sourceId !== 'read') throw new Error(`--index-source 没生效：${asked?.sourceId}`);
        if (asked?.policy !== 'catalog-only') throw new Error(`指定的只读源 policy 不对：${asked?.policy}`);

        writeFileSync(join(dir, 'sources.json'), JSON.stringify({ selected: 'read', sources: [read, team, pub] }));
        let ambiguous = '';
        try {
          resolveIndexPlan({ args: [], home, exec: fakeExec().exec });
        } catch (error) {
          ambiguous = error instanceof MarketIndexError ? error.message : String(error);
        }
        if (!ambiguous.includes('多个可发布') || !ambiguous.includes('team') || !ambiguous.includes('pub')) {
          throw new Error(`多源没拦住：${ambiguous}`);
        }
        const picked = resolveIndexPlan({ args: ['--index-source', 'pub'], home, exec: fakeExec().exec });
        if (picked?.sourceId !== 'pub') throw new Error(`指定多源里的一个没生效：${picked?.sourceId}`);

        let missing = '';
        try {
          resolveIndexPlan({ args: ['--index-source', 'nope'], home, exec: fakeExec().exec });
        } catch (error) {
          missing = error instanceof MarketIndexError ? error.message : String(error);
        }
        if (!missing.includes('没有这个索引源')) throw new Error(`不存在的源没拦住：${missing}`);
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      } finally {
        rmSync(home, { recursive: true, force: true });
      }
    },
  },
  {
    title: 'market-init：空仓库建分支、写 market.json + README、推首个 commit',
    async run(_ctx, report) {
      const title = 'market-init：空仓库建分支、写 market.json + README、推首个 commit';
      const dir = mkdtempSync(join(tmpdir(), 'wb-market-init-'));
      mkdirSync(join(dir, '.git'));
      try {
        const fake = fakeExec({ hasHead: false, url: 'https://github.com/demo/market.git' });
        const result = initializeMarketRepo({ exec: fake.exec, home: tmpdir(), dir });
        if (result.changed !== true) throw new Error('没建索引');
        if (result.firstBranch !== true) throw new Error('没标出首个分支');
        if (result.branch !== 'main') throw new Error(`空仓库没按 main 建：${result.branch}`);
        if (!existsSync(join(dir, 'market.json'))) throw new Error('缺 market.json');
        if (!existsSync(join(dir, 'README.md'))) throw new Error('缺 README.md');
        const readme = readFileSync(join(dir, 'README.md'), 'utf8');
        if (!readme.includes('# 模块市场索引')) throw new Error('README 内容不对');
        if (!fake.calls.some((one) => one.argv.includes('checkout') && one.argv.includes('main'))) {
          throw new Error('没建 main 分支');
        }
        if (fake.calls.filter((one) => one.argv.includes('push')).length !== 1) throw new Error('应该推一次');
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  },
  {
    title: 'market-init：已有内容只补缺、不覆盖 README、无改动不推',
    async run(_ctx, report) {
      const title = 'market-init：已有内容只补缺、不覆盖 README、无改动不推';
      const dir = mkdtempSync(join(tmpdir(), 'wb-market-init-'));
      mkdirSync(join(dir, '.git'));
      writeFileSync(join(dir, 'market.json'), '{"format":1,"plugins":[]}\n');
      writeFileSync(join(dir, 'README.md'), 'custom readme\n');
      try {
        const fake = fakeExec({ hasHead: true, url: 'https://github.com/demo/market.git' });
        const result = initializeMarketRepo({ exec: fake.exec, home: tmpdir(), dir });
        if (result.changed !== false) throw new Error('已有内容还报写');
        if (result.created.length !== 0) throw new Error('created 不为空');
        if (readFileSync(join(dir, 'README.md'), 'utf8') !== 'custom readme\n') throw new Error('README 被覆盖');
        if (fake.calls.some((one) => one.argv.includes('push'))) throw new Error('没改动还推');
        if (result.commit !== COMMIT) throw new Error('没回当前 HEAD');
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  },
  {
    title: 'market-init：空仓库 + 非 github 主机、没给 --ref → 明说要分支',
    async run(_ctx, report) {
      const title = 'market-init：空仓库 + 非 github 主机、没给 --ref → 明说要分支';
      const dir = mkdtempSync(join(tmpdir(), 'wb-market-init-'));
      mkdirSync(join(dir, '.git'));
      try {
        const fake = fakeExec({ hasHead: false, url: 'https://git.example.com/team/market.git' });
        let error;
        try {
          initializeMarketRepo({ exec: fake.exec, home: tmpdir(), dir });
        } catch (thrown) {
          error = thrown;
        }
        if (!(error instanceof MarketIndexError) || !String(error.message).includes('--ref')) {
          throw new Error('没要 --ref');
        }
        if (existsSync(join(dir, 'market.json'))) throw new Error('报错前就写了文件');
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  },
  {
    title: 'market-index：别的条目占着同一个 unit 就不发，产物也不写',
    async run(_ctx, report) {
      const title = 'market-index：别的条目占着同一个 unit 就不发，产物也不写';
      const root = moduleDir();
      const repo = marketDir(
        `${JSON.stringify({
          format: 1,
          plugins: [
            {
              name: '@demo/other',
              owner: 'other',
              metadata: { workbench: true, unit: 'probe' },
              versions: [{ version: '0.1.0', source: { type: 'npm' } }],
            },
          ],
        })}\n`,
      );
      const before = indexTextOf(repo);
      try {
        const fake = fakeExec();
        const plan = resolveIndexPlan({ args: ['--index', repo], home: tmpdir(), exec: fake.exec });
        const market = updateMarketIndex({
          plan,
          root,
          manifest: MANIFEST,
          unit: 'probe',
          version: '0.1.0',
          publish: {},
          exec: fake.exec,
          home: tmpdir(),
          now: () => 1760000000000,
        });
        if (market.updated !== false) throw new Error('居然发了');
        if (market.code !== 'market-owner') throw new Error(`code 不对：${String(market.code)}`);
        if (!String(market.reason).includes('模块 id')) throw new Error(`理由不对：${String(market.reason)}`);
        if (existsSync(join(repo, 'packages', '@demo', 'market-probe'))) throw new Error('被拒了还写了产物');
        if (indexTextOf(repo) !== before) throw new Error('被拒了还改了索引');
        report(title, true);
      } catch (error) {
        report(title, false, error.message.slice(0, 200));
      } finally {
        rmSync(root, { recursive: true, force: true });
        rmSync(repo, { recursive: true, force: true });
      }
    },
  },
];
