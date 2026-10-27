import { describe, expect, it } from 'vitest';
import { aggregate, extensionStateOf, pluginUpdateCommand } from '../index.js';
import { extensionNeedOf, libNeedOf, needStateOf } from '@dsh-workbench/shared/testing';

const DEMO = extensionNeedOf('inventory', { commands: ['envs'] });
const WORKFLOW = libNeedOf('opencli-workflow', {
  version: '1.1.23',
  purpose: '发布编排',
  sources: [{ kind: 'npm', registryEnv: 'X', registryDefault: 'https://r.invalid/' }],
});

describe('aggregate：交叉依赖并进结论', () => {
  const libMissing = needStateOf(WORKFLOW, 'missing', {
    command: 'npm i --prefix ... opencli-workflow@1.1.23',
    provision: 'ready',
    detail: '共用依赖 opencli-workflow 没装',
  });
  const libUnsatisfied = needStateOf(WORKFLOW, 'unsatisfied', {
    installed: '1.1.20',
    command: 'npm i --prefix ... opencli-workflow@1.1.23',
    detail: '装的是 1.1.20，声明要 1.1.23',
  });
  const libBehind = needStateOf(WORKFLOW, 'ok', {
    installed: '1.1.22',
    latest: '1.1.23',
    command: 'npm i --prefix ... opencli-workflow@1.1.23',
  });
  const libOk = needStateOf(WORKFLOW, 'ok', { installed: '1.1.23' });
  const extensionOk = needStateOf(DEMO, 'ok');

  it('库缺了 → unit missing，那条 need 带安装命令', () => {
    const out = aggregate('inventory', [DEMO, WORKFLOW], [extensionOk, libMissing]);

    expect(out.status).toBe('missing');
    expect(out.needs.find((need) => need.kind === 'lib')?.command).toContain('opencli-workflow@1.1.23');
    expect(out.detail).toContain('opencli-workflow');
  });

  it('★ 库有新版（命令都齐）→ 结论仍是 **ok**（能不能用不受影响；升级归市场的共用依赖行）', () => {
    const out = aggregate('inventory', [DEMO, WORKFLOW], [extensionOk, libBehind]);

    expect(out.status).toBe('ok');
    expect(out.needs.find((need) => need.kind === 'lib')?.latest).toBe('1.1.23');
  });

  it('★ 库在、但装的不是声明要的那一支 → **没装好**（与"没装"同一档），排障区说清差在哪', () => {
    const out = aggregate('inventory', [DEMO, WORKFLOW], [extensionOk, libUnsatisfied]);

    expect(out.status).toBe('missing');
    const state = out.needs.find((need) => need.kind === 'lib');
    expect(state?.detail).toContain('1.1.20');
    expect(state?.detail).toContain('1.1.23');
  });

  it('库都在 → 不影响结论（ok）', () => {
    const out = aggregate('inventory', [DEMO, WORKFLOW], [extensionOk, libOk]);

    expect(out.status).toBe('ok');
    expect(out.needs).toHaveLength(2);
  });

  it('没声明库 → 结论里只有 extension 那条 need', () => {
    const out = aggregate('issues', [DEMO], [extensionOk]);

    expect(out.needs.map((need) => need.kind)).toEqual(['extension']);
  });

  it('required: false 缺了 → degraded，而不是 missing', () => {
    const optional = libNeedOf('optional-lib', { required: false });
    const out = aggregate('inventory', [optional], [needStateOf(optional, 'missing')]);

    expect(out.status).toBe('degraded');
  });
});

describe('extensionStateOf：升级命令一律带引号', () => {
  it('缺命令 → plugin update <名字>（引号是命令的一部分）', () => {
    const state = extensionStateOf({
      need: DEMO,
      hit: { commands: [] },
      command: 'opencli',
      sources: [],
    });

    expect(state.status).toBe('outdated');
    expect(state.command).toBe(pluginUpdateCommand('inventory'));
    expect(state.command).toBe("'opencli' plugin update 'inventory'");
  });
});
