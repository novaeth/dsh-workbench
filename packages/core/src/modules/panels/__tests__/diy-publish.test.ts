import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { marketSourceKey } from '@dsh-workbench/shared/host';
import type { MarketSourceConfig } from '@/kernel/contract/market-index';
import { panelsApprovalFor } from '../model/approval';
import { PUBLISH_TIMEOUT_MS, registerPublishTool } from '../model/diy-publish';
import { inferredAuthorOf, publishPreviewOf } from '@/shared/api/host/diy-publish-preview';
import { DIY_PUBLISH_TOOL } from '../unit';
import { createDiyRig } from './diy-harness';

const rig = createDiyRig();

function withBin(): void {
  const bin = path.join(rig.WORKSHOP(), 'node_modules', '.bin');
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'dsh-wb-module'), '');
}

describe('workbench_diy_publish · 预览', () => {
  it('从模块自述里读出发什么、发到哪；没有模块就回 null', () => {
    const dir = rig.scaffold('demo');
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    manifest.publishConfig = { registry: 'https://npm.demo.test/' };
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest));
    const previous = process.env.DSH_WORKBENCH_HOME;
    process.env.DSH_WORKBENCH_HOME = path.join(rig.root(), 'workbench');
    try {
      expect(publishPreviewOf(rig.WORKSHOP(), 'demo')).toEqual({
        name: '@dsh-workbench/module-demo',
        version: '0.0.0',
        registry: 'https://npm.demo.test/',
        changelog: { version: '0.0.0', missing: true },
      });
      expect(publishPreviewOf(rig.WORKSHOP(), 'nope')).toBeNull();
      expect(publishPreviewOf(null, 'demo')).toBeNull();
    } finally {
      if (previous === undefined) delete process.env.DSH_WORKBENCH_HOME;
      else process.env.DSH_WORKBENCH_HOME = previous;
    }
  });

  it('模块写了 author 就带进预览：对象形式给「姓名 <邮箱>」，没写就没有这一格', () => {
    const dir = rig.scaffold('demo');
    const write = (author: unknown): void => {
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as Record<string, unknown>;
      manifest['author'] = author;
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest));
    };
    const previous = process.env.DSH_WORKBENCH_HOME;
    process.env.DSH_WORKBENCH_HOME = path.join(rig.root(), 'workbench');
    try {
      write({ name: '陈康', email: 'kang@example.com' });
      expect(publishPreviewOf(rig.WORKSHOP(), 'demo')?.author).toBe('陈康 <kang@example.com>');
      write('陈康');
      expect(publishPreviewOf(rig.WORKSHOP(), 'demo')?.author).toBe('陈康');
      const unsigned = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as Record<string, unknown>;
      delete unsigned['author'];
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(unsigned));
      expect(publishPreviewOf(rig.WORKSHOP(), 'demo')?.author).toBeUndefined();
    } finally {
      if (previous === undefined) delete process.env.DSH_WORKBENCH_HOME;
      else process.env.DSH_WORKBENCH_HOME = previous;
    }
  });

  it('工具带了 author 时预览按这次的署名来：盖过模块里写的，空白当没传', () => {
    const dir = rig.scaffold('demo');
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as Record<string, unknown>;
    manifest['author'] = '陈康';
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest));
    const previous = process.env.DSH_WORKBENCH_HOME;
    process.env.DSH_WORKBENCH_HOME = path.join(rig.root(), 'workbench');
    try {
      expect(publishPreviewOf(rig.WORKSHOP(), 'demo', { author: 'Ada <ada@example.com>' })?.author).toBe(
        'Ada <ada@example.com>',
      );
      expect(publishPreviewOf(rig.WORKSHOP(), 'demo')?.author).toBe('陈康');
      expect(publishPreviewOf(rig.WORKSHOP(), 'demo', { author: '   ' })?.author).toBe('陈康');
    } finally {
      if (previous === undefined) delete process.env.DSH_WORKBENCH_HOME;
      else process.env.DSH_WORKBENCH_HOME = previous;
    }
  });

  it('带了 changelogNote 就预览「将要写进去的那一段」；这一版已有就预览已落盘那段', () => {
    const dir = rig.scaffold('demo');
    const previous = process.env.DSH_WORKBENCH_HOME;
    process.env.DSH_WORKBENCH_HOME = path.join(rig.root(), 'workbench');
    try {
      const fresh = publishPreviewOf(rig.WORKSHOP(), 'demo', { changelog: '一条', changelogType: 'fixed' });
      expect(fresh?.changelog?.version).toBe('0.0.0');
      expect(fresh?.changelog?.pending).toBe(true);
      expect(fresh?.changelog?.text).toContain('### 🐛 修复');
      expect(fresh?.changelog?.text).toContain('- 一条');
      fs.writeFileSync(
        path.join(dir, 'CHANGELOG.md'),
        '# 更新日志\n\n## v0.0.0\n\n`2026-10-26`\n\n### ✨ 新增\n\n- 已落盘的那条\n',
      );
      const kept = publishPreviewOf(rig.WORKSHOP(), 'demo', { changelog: '一条', changelogType: 'fixed' });
      expect(kept?.changelog?.pending).toBeUndefined();
      expect(kept?.changelog?.text).toContain('已落盘的那条');
      expect(kept?.changelog?.text).not.toContain('- 一条');
    } finally {
      if (previous === undefined) delete process.env.DSH_WORKBENCH_HOME;
      else process.env.DSH_WORKBENCH_HOME = previous;
    }
  });

  it('可写 git 索引源被选中时，预览带上仓库 / 分支 / 产物与索引文件', () => {
    rig.scaffold('demo');
    const previous = process.env.DSH_WORKBENCH_HOME;
    process.env.DSH_WORKBENCH_HOME = path.join(rig.root(), 'workbench');
    try {
      const dir = path.join(rig.root(), 'workbench', 'market-index');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'sources.json'),
        JSON.stringify({
          sources: [
            {
              id: 'team',
              label: '团队市场',
              kind: 'git',
              url: 'https://git.example.com/wb/market.git',
              ref: 'main',
              policy: 'artifacts-in-repo',
            },
          ],
          selected: 'team',
        }),
      );
      expect(publishPreviewOf(rig.WORKSHOP(), 'demo')).toEqual({
        name: '@dsh-workbench/module-demo',
        version: '0.0.0',
        market: {
          url: 'https://git.example.com/wb/market.git',
          ref: 'main',
          indexPath: 'market.json',
          artifactPath: 'packages/@dsh-workbench/module-demo',
          files: ['package.json'],
        },
        claim: { state: 'new' },
        changelog: { version: '0.0.0', missing: true },
      });
    } finally {
      if (previous === undefined) delete process.env.DSH_WORKBENCH_HOME;
      else process.env.DSH_WORKBENCH_HOME = previous;
    }
  });

  it('索引里已有当前版本 → 预览预测下一版（0.0.0 → 0.0.1）', () => {
    rig.scaffold('demo');
    const previous = process.env.DSH_WORKBENCH_HOME;
    process.env.DSH_WORKBENCH_HOME = path.join(rig.root(), 'workbench');
    try {
      const source: MarketSourceConfig = {
        id: 'team',
        label: '团队市场',
        kind: 'git',
        url: 'https://git.example.com/wb/market.git',
        ref: 'main',
        policy: 'artifacts-in-repo',
      };
      const worktree = path.join(rig.root(), 'workbench', 'market-index', marketSourceKey(source), 'worktree');
      fs.mkdirSync(worktree, { recursive: true });
      fs.writeFileSync(
        path.join(worktree, 'market.json'),
        JSON.stringify({
          format: 1,
          plugins: [
            {
              name: '@dsh-workbench/module-demo',
              versions: [{ version: '0.0.0', source: { type: 'npm' } }],
            },
          ],
        }),
      );
      fs.writeFileSync(
        path.join(rig.root(), 'workbench', 'market-index', 'sources.json'),
        JSON.stringify({ sources: [source], selected: 'team' }),
      );
      expect(publishPreviewOf(rig.WORKSHOP(), 'demo')?.market?.nextVersion).toBe('0.0.1');
    } finally {
      if (previous === undefined) delete process.env.DSH_WORKBENCH_HOME;
      else process.env.DSH_WORKBENCH_HOME = previous;
    }
  });
});

describe('workbench_diy_publish · 没写作者时推断署名', () => {
  const SOURCE: MarketSourceConfig = {
    id: 'team',
    label: '团队市场',
    kind: 'git',
    url: 'https://git.example.com/wb/market.git',
    ref: 'main',
    policy: 'artifacts-in-repo',
  };

  function setAuthor(dir: string, author: unknown): void {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as Record<string, unknown>;
    manifest['author'] = author;
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest));
  }

  function withHome<T>(run: () => T): T {
    const previous = process.env.DSH_WORKBENCH_HOME;
    process.env.DSH_WORKBENCH_HOME = path.join(rig.root(), 'workbench');
    try {
      return run();
    } finally {
      if (previous === undefined) delete process.env.DSH_WORKBENCH_HOME;
      else process.env.DSH_WORKBENCH_HOME = previous;
    }
  }

  function marketWithAuthor(author: string): void {
    const worktree = path.join(rig.root(), 'workbench', 'market-index', marketSourceKey(SOURCE), 'worktree');
    fs.mkdirSync(worktree, { recursive: true });
    fs.writeFileSync(
      path.join(worktree, 'market.json'),
      JSON.stringify({
        format: 1,
        plugins: [
          {
            name: '@dsh-workbench/module-demo',
            author,
            versions: [{ version: '0.0.0', source: { type: 'npm' } }],
          },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(rig.root(), 'workbench', 'market-index', 'sources.json'),
      JSON.stringify({ sources: [SOURCE], selected: 'team' }),
    );
  }

  it('★ 市集里这个模块上次的 author 排第一（盖过同工坊）', async () => {
    rig.scaffold('demo');
    setAuthor(rig.scaffold('other'), 'Ada <ada@example.com>');
    marketWithAuthor('陈康 <kang@example.com>');

    expect(await withHome(() => inferredAuthorOf(rig.WORKSHOP(), 'demo', undefined))).toBe(
      '陈康 <kang@example.com>',
    );
  });

  it('★ 市集没有这个模块：用同工坊里唯一的那个作者', async () => {
    rig.scaffold('demo');
    setAuthor(rig.scaffold('other'), '陈康 <kang@example.com>');

    expect(await withHome(() => inferredAuthorOf(rig.WORKSHOP(), 'demo', undefined))).toBe(
      '陈康 <kang@example.com>',
    );
  });

  it('★ 同工坊作者不唯一：退回本机 git 身份', async () => {
    rig.scaffold('demo');
    setAuthor(rig.scaffold('one'), '甲 <a@example.com>');
    setAuthor(rig.scaffold('two'), '乙 <b@example.com>');
    const outputs = ['陈康\n', 'kang@example.com\n'];
    let index = 0;
    const shell = {
      resolve: (request: unknown) => request,
      async execute() {
        const text = outputs[index] ?? '';
        index += 1;
        return {
          result: async () => ({
            exitCode: 0,
            timedOut: false,
            aborted: false,
            stdout: { text, truncated: false },
            stderr: { text: '', truncated: false },
          }),
        };
      },
    };

    expect(await withHome(() => inferredAuthorOf(rig.WORKSHOP(), 'demo', shell as never))).toBe(
      '陈康 <kang@example.com>',
    );
  });
});

describe('workbench_diy_publish · 推断的署名就是发布用的署名', () => {
  const PUBLISHED = JSON.stringify({
    ok: true,
    target: 'team',
    name: '@dsh-workbench/module-demo',
    version: '0.1.0',
    registry: 'https://npm.demo.test/',
    install: 'dsh plugin --profile workbench add @dsh-workbench/module-demo@0.1.0',
  });

  it('★ 模块没写作者：推断出来的署名直接当 --author 发', async () => {
    rig.scaffold('demo');
    withBin();
    const { tool, commands } = rig.harness({
      authorHint: async () => '陈康 <kang@example.com>',
      probe: [{ stdout: PUBLISHED }],
    });

    await tool(DIY_PUBLISH_TOOL)?.execute({ unit: 'demo', target: 'team' }, rig.diyExec());

    expect(commands[0]).toContain("'--author' '陈康 <kang@example.com>'");
  });

  it('★ 模块写了作者：不推断，交给 release 用模块里那个', async () => {
    rig.scaffold('demo');
    withBin();
    let inferred = 0;
    const { tool, commands } = rig.harness({
      preview: () => ({ name: '@dsh-workbench/module-demo', version: '0.0.0', author: '陈康' }),
      authorHint: async () => {
        inferred += 1;
        return 'Ada';
      },
      probe: [{ stdout: PUBLISHED }],
    });

    await tool(DIY_PUBLISH_TOOL)?.execute({ unit: 'demo', target: 'team' }, rig.diyExec());

    expect(inferred).toBe(0);
    expect(commands[0]).not.toContain("'--author'");
  });

  it('★ 用户点名了作者：参数赢过推断', async () => {
    rig.scaffold('demo');
    withBin();
    let inferred = 0;
    const { tool, commands } = rig.harness({
      authorHint: async () => {
        inferred += 1;
        return '陈康 <kang@example.com>';
      },
      probe: [{ stdout: PUBLISHED }],
    });

    await tool(DIY_PUBLISH_TOOL)?.execute(
      { unit: 'demo', target: 'team', author: 'Ada <ada@example.com>' },
      rig.diyExec(),
    );

    expect(inferred).toBe(0);
    expect(commands[0]).toContain("'--author' 'Ada <ada@example.com>'");
  });
});

  it('changelogNote / changelogType 原样传给 release，结果里说清写没写', async () => {
    rig.scaffold('demo');
    withBin();
    const { tool, commands } = rig.harness({
      probe: [
        {
          stdout: JSON.stringify({
            ok: true,
            target: 'team',
            name: '@dsh-workbench/module-demo',
            version: '0.1.0',
            registry: 'https://npm.demo.test/',
            install: 'dsh plugin --profile workbench add @dsh-workbench/module-demo@0.1.0',
            changelog: { version: '0.1.0', action: 'written' },
          }),
        },
      ],
    });

    const result = (await tool(DIY_PUBLISH_TOOL)?.execute(
      { unit: 'demo', target: 'team', changelogNote: '这一版修了一条\n还加了一条', changelogType: 'fixed' },
      rig.diyExec(),
    )) as { text: string };

    expect(commands[0]).toContain("'--changelog-note'");
    expect(commands[0]).toContain('这一版修了一条');
    expect(commands[0]).toContain("'--changelog-type' 'fixed'");
    expect(result.text).toContain('更新日志：已写进 CHANGELOG.md 的 0.1.0');
  });

  it('这一版已有更新日志：release 回 kept，结果里说没动', async () => {
    rig.scaffold('demo');
    withBin();
    const { tool } = rig.harness({
      probe: [
        {
          stdout: JSON.stringify({
            ok: true,
            target: 'team',
            name: '@dsh-workbench/module-demo',
            version: '0.1.0',
            registry: 'https://npm.demo.test/',
            install: 'dsh plugin --profile workbench add @dsh-workbench/module-demo@0.1.0',
            changelog: { version: '0.1.0', action: 'kept' },
          }),
        },
      ],
    });

    const result = (await tool(DIY_PUBLISH_TOOL)?.execute({ unit: 'demo', target: 'team' }, rig.diyExec())) as {
      text: string;
    };

    expect(result.text).toContain('更新日志：这一版已有（0.1.0），没动');
  });

describe('workbench_diy_publish · 审批', () => {
  it('发布不跟工坊整族 allow 走：要一次审批，reason 里点名包与版本', () => {
    const policy = panelsApprovalFor(undefined, undefined, () => ({
      name: '@demo/probe',
      version: '0.1.0',
      registry: 'https://npm.demo.test/',
    }));
    const verdict = policy({ name: DIY_PUBLISH_TOOL, arguments: { unit: 'demo' } });

    expect(verdict?.kind).toBe('ask');
    expect(verdict?.kind === 'ask' ? verdict.reason : '').toContain('@demo/probe@0.1.0');
    expect(verdict?.kind === 'ask' ? verdict.question.zh : '').toContain('工作台模块 [demo]');
    expect(verdict?.kind === 'ask' ? verdict.question.zh : '').toContain('团队源');
  });

  it('四种出口说的是四件事：团队源 / 公开 npm / 安装包 / git 源码也推', () => {
    const policy = panelsApprovalFor(undefined, undefined, () => ({
      name: '@demo/probe',
      version: '0.1.0',
      registry: 'https://npm.demo.test/',
    }));
    const question = (target: string): string => {
      const verdict = policy({ name: DIY_PUBLISH_TOOL, arguments: { unit: 'demo', target } });
      return verdict?.kind === 'ask' ? verdict.question.zh : '';
    };
    expect(question('team')).toContain('团队源');
    expect(question('public')).toContain('任何人');
    expect(question('tarball')).toContain('安装包');
    expect(question('git')).toContain('源码也会一起推送');
    for (const target of ['team', 'public', 'tarball', 'git']) {
      const line = question(target);
      expect(line.length).toBeLessThanOrEqual(40);
      expect(line.endsWith('，允许吗？')).toBe(true);
    }
  });

  it('配了可写索引源时默认发市场，标题点名仓库地址', () => {
    const policy = panelsApprovalFor(undefined, undefined, () => ({
      name: '@demo/probe',
      version: '0.1.0',
      market: {
        url: 'https://git.example.com/wb/market.git',
        ref: 'main',
        indexPath: 'market.json',
        artifactPath: 'packages/demo',
        files: ['package.json'],
      },
    }));
    const verdict = policy({ name: DIY_PUBLISH_TOOL, arguments: { unit: 'demo' } });

    expect(verdict?.kind).toBe('ask');
    if (verdict?.kind !== 'ask') return;
    expect(verdict.question.zh).toContain('市场仓库');
    expect(verdict.reason).toContain('@demo/probe@0.1.0');
    expect(verdict.reason).toContain('https://git.example.com/wb/market.git');
  });

  it('只刷元数据（refresh）：问一次，说的是「不升版本、不重发产物」', () => {
    const policy = panelsApprovalFor(undefined, undefined, () => ({
      name: '@demo/probe',
      version: '0.1.0',
      market: {
        url: 'https://git.example.com/wb/market.git',
        ref: 'main',
        indexPath: 'market.json',
        artifactPath: 'packages/demo',
        files: ['package.json'],
      },
    }));
    const verdict = policy({ name: DIY_PUBLISH_TOOL, arguments: { unit: 'demo', refresh: true } });

    expect(verdict?.kind).toBe('ask');
    if (verdict?.kind !== 'ask') return;
    expect(verdict.question.zh).toContain('只刷新');
    expect(verdict.question.zh).toContain('不升版本');
    expect(verdict.reason).toContain('（元数据）');
  });

  it('★ 这一版没有更新日志又没带 changelogNote：不弹审批屏，直接拒给 agent 改法', () => {
    const policy = panelsApprovalFor(undefined, undefined, () => ({
      name: '@demo/probe',
      version: '0.1.0',
      changelog: { version: '0.1.0', missing: true },
    }));
    const verdict = policy({ name: DIY_PUBLISH_TOOL, arguments: { unit: 'demo' } });

    expect(verdict?.kind).toBe('deny');
    expect(verdict?.kind === 'deny' ? verdict.reason : '').toContain('changelogNote');
  });

  it('带了更新日志、或这一版已有，就照常问一次；只刷元数据不查更新日志', () => {
    const missing = panelsApprovalFor(undefined, undefined, () => ({
      name: '@demo/probe',
      version: '0.1.0',
      changelog: { version: '0.1.0', missing: true },
    }));
    expect(missing({ name: DIY_PUBLISH_TOOL, arguments: { unit: 'demo', changelogNote: '一条' } })?.kind).toBe('ask');
    expect(missing({ name: DIY_PUBLISH_TOOL, arguments: { unit: 'demo', refresh: true } })?.kind).toBe('ask');

    const has = panelsApprovalFor(undefined, undefined, () => ({
      name: '@demo/probe',
      version: '0.1.0',
      changelog: { version: '0.1.0', text: '- 一条' },
    }));
    expect(has({ name: DIY_PUBLISH_TOOL, arguments: { unit: 'demo' } })?.kind).toBe('ask');
  });

  it('只核验（verify）不问：它不发任何东西', () => {
    const policy = panelsApprovalFor(undefined, undefined, () => null);
    expect(policy({ name: DIY_PUBLISH_TOOL, arguments: { unit: 'demo', target: 'team', verify: true } })).toEqual({
      kind: 'allow',
    });
  });

  it('市场里同名归别人：审批直接拒，不让人点同意', () => {
    const policy = panelsApprovalFor(undefined, undefined, () => ({
      name: '@demo/probe',
      version: '0.1.0',
      market: {
        url: 'https://git.example.com/wb/market.git',
        ref: 'main',
        indexPath: 'market.json',
        artifactPath: 'packages/demo',
        files: ['package.json'],
      },
      claim: { state: 'conflict', owner: '甲 <a@example.com>' },
    }));
    const verdict = policy({ name: DIY_PUBLISH_TOOL, arguments: { unit: 'demo' } });

    expect(verdict?.kind).toBe('deny');
    expect(verdict?.kind === 'deny' ? verdict.reason : '').toContain('已经有主');
    expect(verdict?.kind === 'deny' ? verdict.reason : '').toContain('甲 <a@example.com>');
  });

  it('参数带了这个署名：认领按这次的署名判，不拿模块里那个', () => {
    const policy = panelsApprovalFor(undefined, undefined, (_unit, author) => ({
      name: '@demo/probe',
      version: '0.1.0',
      market: {
        url: 'https://git.example.com/wb/market.git',
        ref: 'main',
        indexPath: 'market.json',
        artifactPath: 'packages/demo',
        files: ['package.json'],
      },
      claim:
        author === '乙' ? { state: 'conflict', owner: '甲 <a@example.com>' } : { state: 'owned', owner: '甲 <a@example.com>' },
    }));
    expect(policy({ name: DIY_PUBLISH_TOOL, arguments: { unit: 'demo' } })?.kind).toBe('ask');
    expect(policy({ name: DIY_PUBLISH_TOOL, arguments: { unit: 'demo', author: '乙' } })?.kind).toBe('deny');
  });

  it('点名了别的索引源：审批不拦，交给 release 判', () => {
    const policy = panelsApprovalFor(undefined, undefined, () => ({
      name: '@demo/probe',
      version: '0.1.0',
      market: {
        url: 'https://git.example.com/wb/market.git',
        ref: 'main',
        indexPath: 'market.json',
        artifactPath: 'packages/demo',
        files: ['package.json'],
      },
      claim: { state: 'conflict', owner: '甲 <a@example.com>' },
    }));
    expect(policy({ name: DIY_PUBLISH_TOOL, arguments: { unit: 'demo', source: 'other' } })?.kind).toBe('ask');
  });
});

describe('workbench_diy_publish · 注册', () => {
  it('注册出发布这一把，超时按 30 分钟算', () => {
    const seen: string[] = [];
    const tools = {
      register: (definition: { readonly name: string }) => {
        seen.push(definition.name);
        return () => {};
      },
    };
    registerPublishTool({} as never, tools as never, {
      resolve: () => {
        throw new Error('注册时不该解析模块');
      },
      previewOf: () => null,
      inferredAuthorOf: async () => undefined,
    });
    expect(seen).toEqual([DIY_PUBLISH_TOOL]);
    expect(PUBLISH_TIMEOUT_MS).toBe(30 * 60 * 1000);
  });
});

describe('workbench_diy_publish · 真发', () => {
  it('调工具链的 release --json --yes，把安装命令交回给用户', async () => {
    const dir = rig.scaffold('demo');
    withBin();
    const { tool, commands } = rig.harness({
      probe: [
        {
          stdout: JSON.stringify({
            ok: true,
            target: 'team',
            name: '@dsh-workbench/module-demo',
            version: '0.1.0',
            registry: 'https://npm.demo.test/',
            install: 'dsh plugin --profile workbench add @dsh-workbench/module-demo@0.1.0',
          }),
        },
      ],
    });

    const result = (await tool(DIY_PUBLISH_TOOL)?.execute({ unit: 'demo' }, rig.diyExec())) as { text: string };

    expect(result.text).toContain('已发布 @dsh-workbench/module-demo@0.1.0');
    expect(result.text).toContain('dsh plugin --profile workbench add');
    expect(commands[0]).toContain('release');
    expect(commands[0]).toContain('--json');
    expect(commands[0]).toContain('--yes');
    expect(commands[0]).toContain(dir);
  });

  it('refresh=true 只跑 --refresh，回来是「元数据刷新了 / 没动」', async () => {
    rig.scaffold('demo');
    withBin();
    const { tool, commands } = rig.harness({
      probe: [
        {
          stdout: JSON.stringify({
            ok: true,
            target: 'market',
            refresh: true,
            refreshed: true,
            name: '@dsh-workbench/module-demo',
            version: '0.2.0',
            market: { url: 'https://git.example.com/wb/market.git', branch: 'main', commit: 'abc' },
          }),
        },
      ],
    });

    const result = (await tool(DIY_PUBLISH_TOOL)?.execute(
      { unit: 'demo', refresh: true, target: 'market' },
      rig.diyExec(),
    )) as { text: string };

    expect(result.text).toContain('已刷新 @dsh-workbench/module-demo 的市集元数据');
    expect(result.text).toContain('版本 0.2.0 不变');
    expect(commands[0]).toContain("'--refresh'");
    expect(commands[0]).not.toContain("'--version'");
  });

  it('target / version 原样传给工具链；tarball 回来的是文件与安装路径', async () => {
    rig.scaffold('demo');
    withBin();
    const { tool, commands } = rig.harness({
      probe: [
        {
          stdout: JSON.stringify({
            ok: true,
            target: 'tarball',
            name: '@dsh-workbench/module-demo',
            version: '0.2.0',
            file: '/tmp/module-demo-0.2.0.tgz',
            install: 'dsh plugin --profile workbench add /tmp/module-demo-0.2.0.tgz',
          }),
        },
      ],
    });

    const result = (await tool(DIY_PUBLISH_TOOL)?.execute(
      { unit: 'demo', target: 'tarball', version: 'minor' },
      rig.diyExec(),
    )) as { text: string };

    expect(result.text).toContain('安装包在 /tmp/module-demo-0.2.0.tgz');
    expect(result.text).toContain('本机装：');
    expect(commands[0]).toContain("'--target' 'tarball'");
    expect(commands[0]).toContain("'--version' 'minor'");
  });

  it('verify 只跑核验：命令带 --verify、不带 --yes，回来是"已核过"', async () => {
    rig.scaffold('demo');
    withBin();
    const { tool, commands } = rig.harness({
      probe: [
        {
          stdout: JSON.stringify({
            ok: true,
            verified: true,
            target: 'team',
            name: '@dsh-workbench/module-demo',
            version: '0.1.0',
            registry: 'https://npm.demo.test/',
            install: 'dsh plugin --profile workbench add @dsh-workbench/module-demo@0.1.0',
          }),
        },
      ],
    });

    const result = (await tool(DIY_PUBLISH_TOOL)?.execute(
      { unit: 'demo', target: 'team', verify: true },
      rig.diyExec(),
    )) as { text: string };

    expect(result.text).toContain('已核过 @dsh-workbench/module-demo@0.1.0');
    expect(commands[0]).toContain("'--verify'");
    expect(commands[0]).not.toContain("'--yes'");
  });

  it('中断时回可续跑结果（exit 4），不抛；resume=true 会把 --resume 传给工具链', async () => {
    rig.scaffold('demo');
    withBin();
    const { tool, commands } = rig.harness({
      probe: [
        {
          exitCode: 4,
          stdout: JSON.stringify({
            ok: false,
            resumable: true,
            text: '发布中断在第 index 步：索引推不上去',
            resume: { phase: 'index', target: 'market', version: '0.1.0' },
          }),
        },
      ],
    });
    const result = (await tool(DIY_PUBLISH_TOOL)?.execute({ unit: 'demo', resume: true }, rig.diyExec())) as {
      text: string;
    };
    expect(result.text).toContain('中断在第 index 步');
    expect(result.text).toContain('resume=true');
    expect(commands[0]).toContain("'--resume'");
  });

  it('需要用户接管时回正常结果，不抛异常：把一句话和确切命令交回 agent', async () => {
    rig.scaffold('demo');
    withBin();
    const { tool } = rig.harness({
      probe: [
        {
          exitCode: 3,
          stdout: JSON.stringify({
            ok: false,
            target: 'team',
            needsUser: {
              step: 'login',
              text: '团队源还没登录。请在终端跑下面这条，走完登录/验证器再跟我说「好了」，我接着发。',
              command: 'npm login --registry https://npm.demo.test/',
            },
          }),
        },
      ],
    });

    const result = (await tool(DIY_PUBLISH_TOOL)?.execute({ unit: 'demo', target: 'team' }, rig.diyExec())) as {
      text: string;
    };

    expect(result.text).toContain('还差一步');
    expect(result.text).toContain('npm login --registry https://npm.demo.test/');
    expect(result.text).toContain('好了');
  });

  it('发布没走通时把工具链最后几行原样带回来（验收没打完是常见那条）', async () => {
    rig.scaffold('demo');
    withBin();
    const { tool } = rig.harness({ probe: [{ exitCode: 1, stderr: '✖ 验收还差 1 条（0/1）—— 用户说“没问题”之前不发' }] });

    await expect(tool(DIY_PUBLISH_TOOL)?.execute({ unit: 'demo' }, rig.diyExec())).rejects.toThrow(/验收还差 1 条/);
  });
});
