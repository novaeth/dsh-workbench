import { describe, expect, it } from 'vitest';
import { zh, type Translate } from '@dsh-workbench/shared';
import { AddModulePreview, AddModuleResult } from '../AddModuleStages';
import { ADD_MODULE_MOCKS, stateOfMock } from './add-module-states';
import type { AddModuleState } from '../use-add-module';

const t = ((key: string, params?: Readonly<Record<string, string>>) => {
  let text = (zh as Record<string, string>)[key] ?? key;
  for (const [name, value] of Object.entries(params ?? {})) text = text.replace(`{${name}}`, value);
  return text;
}) as unknown as Translate;

const TERMS = {
  plugin: zh['runtime.plugin'],
  pluginOf: zh['runtime.pluginOf'],
  pluginThing: zh['runtime.pluginThing'],
  pluginArea: zh['runtime.pluginArea'],
};

const PREVIEW_TEXT = t('panels.market.add.pluginPreview', TERMS);

const BASE = { choices: [] } as unknown as AddModuleState;

function stateOf(id: string): AddModuleState {
  const mock = ADD_MODULE_MOCKS.find((one) => one.id === id);
  if (mock === undefined) throw new Error(`夹具里没有 ${id}`);
  return stateOfMock(BASE, mock);
}

function texts(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return out;
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    for (const item of node) texts(item, out);
    return out;
  }
  const props = (node as { props?: { children?: unknown } }).props;
  if (props !== undefined) texts(props.children, out);
  return out;
}

describe('添加模块浮层那两屏（插件态）', () => {
  it('★ 插件态在 preview 相位就画出来：说清是 opencli 插件、装完不用重启，插件名一并写上', () => {
    const shown = texts(AddModulePreview({ t, state: stateOf('preview-plugin') })).join('|');

    expect(shown).toContain('acme-plugin-dashboards');
    expect(shown).toContain('1.0.16');
    expect(shown).toContain(PREVIEW_TEXT);
    expect(shown).toContain('dashboards');
  });

  it('模块态的预览照旧（简介在，插件那句话不在）', () => {
    const shown = texts(AddModulePreview({ t, state: stateOf('preview') })).join('|');

    expect(shown).toContain('最小样本模块');
    expect(shown).not.toContain(PREVIEW_TEXT);
  });

  it('★ git 来源的预览：标题是包名，不再拿整串地址当名字；仓库 / 提交 / 路径各一行，且不写「默认安装源」', () => {
    const shown = texts(AddModulePreview({ t, state: stateOf('preview-git') })).join('|');

    expect(shown).toContain('@acme/module-wallet-details');
    expect(shown).toContain('仓库：git.example.com/acme/dsh-workbench-market');
    expect(shown).toContain('提交：e87c7a1');
    expect(shown).toContain('目录：artifacts/@acme/module-wallet-details');
    expect(shown).not.toContain('默认安装源');
    expect(shown).not.toContain('git+ssh://');
  });

  it('★ 指向分支时那行不能写「提交」：分支或标签就是分支或标签', () => {
    const base = stateOf('preview-git');
    const preview = {
      ...base.preview!,
      source: { kind: 'git' as const, repo: 'git.example.com/acme/market', ref: 'main', refKind: 'branch' as const },
    };
    const shown = texts(AddModulePreview({ t, state: { ...base, preview } })).join('|');

    expect(shown).toContain('分支或标签：main');
    expect(shown).not.toContain('提交：main');
  });

  it('模块声明了 origins：预览里把会读的站摆出来', () => {
    const state = stateOf('preview');
    const preview = state.preview!;
    const shown = texts(
      AddModulePreview({
        t,
        state: { ...state, preview: { ...preview, origins: ['https://oa.example.com'] } },
      }),
    ).join('|');
    expect(shown).toContain('将访问以下站点：https://oa.example.com');
  });

  it('★ 装完的插件那一屏只说已安装，不劝人重启（插件不需要重启）', () => {
    const shown = texts(AddModuleResult({ t, state: stateOf('done-plugin') })).join('|');

    expect(shown).toContain(`已安装：${zh['runtime.plugin']}`);
    expect(shown).not.toContain(zh['panels.market.add.doneRestart']);
    expect(shown).not.toContain(zh['panels.market.add.restart']);
  });

  it('要重启的模块照旧说重启（这条口径没被放松）', () => {
    const shown = texts(AddModuleResult({ t, state: stateOf('done-restart') })).join('|');

    expect(shown).toContain(zh['panels.market.add.doneRestart']);
  });
});
