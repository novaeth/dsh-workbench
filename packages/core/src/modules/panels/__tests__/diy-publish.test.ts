import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { panelsApprovalFor } from '../model/approval';
import { publishPreviewOf } from '@/shared/api/host/diy-publish-preview';
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

    expect(publishPreviewOf(rig.WORKSHOP(), 'demo')).toEqual({
      name: '@dsh-workbench/module-demo',
      version: '0.0.0',
      registry: 'https://npm.demo.test/',
    });
    expect(publishPreviewOf(rig.WORKSHOP(), 'nope')).toBeNull();
    expect(publishPreviewOf(null, 'demo')).toBeNull();
  });
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

  it('只核验（verify）不问：它不发任何东西', () => {
    const policy = panelsApprovalFor(undefined, undefined, () => null);
    expect(policy({ name: DIY_PUBLISH_TOOL, arguments: { unit: 'demo', target: 'team', verify: true } })).toEqual({
      kind: 'allow',
    });
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
