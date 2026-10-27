import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CHANGELOG_FILE } from '@dsh-workbench/shared/host';
import { createDiyRig } from './diy-harness';
import { registerChangelogTool } from '../model/diy-changelog';
import { DIY_CHANGELOG_TOOL } from '../unit';

const rig = createDiyRig();

interface Written {
  readonly ok: boolean;
  readonly version: string;
  readonly path: string;
  readonly text: string;
}

describe('workbench_diy_changelog', () => {
  it('注册入口交出的就是这一把工具', () => {
    const seen: { readonly name: string }[] = [];
    const registry = {
      register: (definition: { readonly name: string }) => {
        seen.push(definition);
        return () => {};
      },
    };
    const cleanups = registerChangelogTool({} as never, registry as never);
    expect(seen.map((one) => one.name)).toEqual([DIY_CHANGELOG_TOOL]);
    expect(cleanups).toHaveLength(1);
  });

  it('把这一版写进 CHANGELOG.md：v 前缀 + emoji 分类，文件不在就先建', async () => {
    const dir = rig.scaffold('demo');
    const { tool } = rig.harness();

    const out = (await tool(DIY_CHANGELOG_TOOL)?.execute(
      { unit: 'demo', note: '第一个版本' },
      rig.diyExec(),
    )) as Written;

    expect(out.ok).toBe(true);
    expect(out.version).toBe('0.0.0');
    const text = fs.readFileSync(path.join(dir, CHANGELOG_FILE), 'utf8');
    expect(text).toContain('## v0.0.0');
    expect(text).toContain('### ⚡ 改进');
    expect(text).toContain('- 第一个版本');
    expect(out.text).toContain('审批屏');
  });

  it('指定版本与分类就按那个写', async () => {
    const dir = rig.scaffold('demo');
    const { tool } = rig.harness();

    await tool(DIY_CHANGELOG_TOOL)?.execute(
      { unit: 'demo', version: 'v0.2.0', type: 'fixed', note: '修了一条' },
      rig.diyExec(),
    );

    const text = fs.readFileSync(path.join(dir, CHANGELOG_FILE), 'utf8');
    expect(text).toContain('## v0.2.0');
    expect(text).toContain('### 🐛 修复');
  });

  it('缺 note / 认不出的 unit / 认不出的分类都当场说清', async () => {
    rig.scaffold('demo');
    const { tool } = rig.harness();

    await expect(tool(DIY_CHANGELOG_TOOL)?.execute({ unit: 'demo' }, rig.diyExec())).rejects.toThrow(/note/);
    await expect(tool(DIY_CHANGELOG_TOOL)?.execute({ unit: 'nope', note: 'x' }, rig.diyExec())).rejects.toThrow(
      /没有单元 id/,
    );
    await expect(
      tool(DIY_CHANGELOG_TOOL)?.execute({ unit: 'demo', note: 'x', type: 'bogus' }, rig.diyExec()),
    ).rejects.toThrow(/type 只认/);
  });
});
