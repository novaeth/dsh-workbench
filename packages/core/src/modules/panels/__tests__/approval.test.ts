import { describe, expect, it, vi } from 'vitest';
import {
  APPROVAL_DETAIL_LIMIT,
  APPROVAL_HEADLINE_LIMIT,
  APPROVAL_QUESTION_LIMIT,
  approvalFor,
  type ApprovalCall,
} from '@dsh-workbench/shared/host';
import { panelsApproval } from '../model/approval';
import { ALLOWED_WRITES, ASK_TOOLS, WRITE_CALLS, writers } from './approval-samples';
import {
  ALL_TOOLS,
  DIY_CLICK_TOOL,
  DIY_DEBUG_PAUSE_TOOL,
  DIY_DEBUG_RESUME_TOOL,
  DIY_DEBUG_START_TOOL,
  DIY_DEBUG_STOP_TOOL,
  DIY_DIALOG_TOOL,
  DIY_EVAL_TOOL,
  DIY_FILL_TOOL,
  DIY_FIND_TOOL,
  DIY_HOVER_TOOL,
  DIY_HTML_TOOL,
  DIY_INSTALL_TOOL,
  DIY_KEYS_TOOL,
  DIY_NETWORK_TOOL,
  DIY_PUBLISH_TOOL,
  DIY_SCREENSHOT_TOOL,
  DIY_SCROLL_TOOL,
  DIY_SHOW_TOOL,
  DIY_STATE_TOOL,
  DIY_TOOLS,
  DIY_TYPE_TOOL,
  DIY_WAIT_TOOL,
  MODULES_INSTALL_BUNDLE_TOOL,
  MODULES_INSTALL_TOOL,
  MODULES_UNINSTALL_PLUGIN_TOOL,
  MODULES_UNINSTALL_TOOL,
  MODULES_UPDATE_DEPENDENCY_TOOL,
  MODULES_UPDATE_PLUGIN_TOOL,
  MODULES_UPDATE_TOOL,
  MODULES_UPDATE_WORKBENCH_TOOL,
  PANELS_FOLLOW_TOOL,
  PANELS_HIDE_TOOL,
  PANELS_LIST_TOOL,
  PANELS_MOVE_TOOL,
  PANELS_RESET_TOOL,
  PANELS_SHOW_TOOL,
  DIY_RECORD_PREPARE_TOOL,
  LONG_TASKS_STOP_TOOL,
  MARKET_ENABLE_TOOL,
  MARKET_DISABLE_TOOL,
  READ_TOOLS,
  WRITE_TOOLS,
  panelsUnit,
} from '../unit';

async function zhOf(call: ApprovalCall): Promise<string> {
  const decision = await approvalFor(call, { writes: true, policy: panelsApproval });
  return decision?.kind === 'ask' ? decision.displayReason.zh : '';
}

describe('改面板的五个动作各自一把工具，每把都要问', () => {
  it('五句话各不相同、说的都是这件事', async () => {
    const five = await Promise.all([
      zhOf({ name: PANELS_SHOW_TOOL, arguments: { id: 'issues' } }),
      zhOf({ name: PANELS_HIDE_TOOL, arguments: { id: 'issues' } }),
      zhOf({ name: PANELS_MOVE_TOOL, arguments: { id: 'issues' } }),
      zhOf({ name: PANELS_RESET_TOOL, arguments: {} }),
      zhOf({ name: PANELS_FOLLOW_TOOL, arguments: { id: 'issues' } }),
    ]);

    expect(five[0]).toContain('加到当前项目的面板');
    expect(five[1]).toContain('收起');
    expect(five[2]).toContain('最前面');
    expect(five[3]).toContain('清空');
    expect(five[4]).toContain('跟随机器级默认板');
    expect(new Set(five).size).toBe(5);
    for (const zh of five) {
      expect(zh).toContain('允许吗');
      expect(zh).not.toContain('（');
    }
  });

  it('★ 机器级默认板那一份说成"机器级默认板"，不说"当前项目的面板"（同一把工具、两个落点）', async () => {
    const machine = await zhOf({ name: PANELS_SHOW_TOOL, arguments: { id: 'issues', scope: 'machine' } });
    const clear = await zhOf({ name: PANELS_RESET_TOOL, arguments: { scope: 'machine' } });
    const local = await zhOf({ name: PANELS_SHOW_TOOL, arguments: { id: 'issues' } });

    expect(machine).toContain('机器级默认板');
    expect(machine).not.toContain('当前项目的面板');
    expect(clear).toContain('机器级默认板');
    expect(local).toContain('当前项目的面板');
  });

  it('★ follow 不是"加到面板上"：它把那一行改回跟随机器级默认板', async () => {
    const one = await zhOf({ name: PANELS_FOLLOW_TOOL, arguments: { id: 'issues' } });
    const all = await zhOf({ name: PANELS_FOLLOW_TOOL, arguments: {} });

    expect(one).toContain('issues');
    expect(one).toContain('跟随机器级默认板');
    expect(one).not.toContain('加到');
    expect(all).toContain('跟随机器级默认板');
    expect(all).not.toContain('issues');
  });

  it('★ 问句那半写明"哪份板"（兜底句只说目标）：hide 的兜底句短，问句带上落点', async () => {
    const hide = panelsApproval({ name: PANELS_HIDE_TOOL, arguments: { id: 'issues' } });
    const fallback = panelsApproval({ name: PANELS_HIDE_TOOL, arguments: { id: 'issues', scope: 'machine' } });

    expect(hide?.kind === 'ask' ? hide.question.zh : '').toContain('当前项目的面板');
    expect(fallback?.kind === 'ask' ? fallback.question.zh : '').toContain('机器级默认板');
  });

  it('目标模块：能拿到就说名字，拿不到就说"面板"', async () => {
    expect(await zhOf({ name: PANELS_SHOW_TOOL, arguments: { id: 'issues' } })).toContain('issues');
    expect(await zhOf({ name: PANELS_SHOW_TOOL, arguments: {} })).toContain('当前项目的面板');
  });
});

describe('装 / 升 / 卸模块与插件：八把写工具，各自说清目标', () => {
  it('安装 / 升降供给 / 卸载说清动词与目标，reason 里带工具名（审计那半）', async () => {
    const install = await approvalFor(
      { name: MODULES_INSTALL_TOOL, arguments: { id: 'issues' } },
      { writes: true, policy: panelsApproval },
    );
    const update = await zhOf({ name: MODULES_UPDATE_TOOL, arguments: { id: 'issues' } });
    const uninstall = await zhOf({ name: MODULES_UNINSTALL_TOOL, arguments: { id: 'issues' } });

    expect(install?.kind).toBe('ask');
    expect(install?.kind === 'ask' ? install.reason : '').toContain(MODULES_INSTALL_TOOL);
    expect(install?.kind === 'ask' ? install.reason : '').not.toContain(update);
    expect(update).toContain('升');
    expect(update).toContain('issues');
    expect(uninstall).toContain('卸载');
    expect(uninstall).toContain('issues');
  });

  it('升级共用依赖是另一句话（改的是这台机器上装的东西）', async () => {
    const upgrade = await zhOf({ name: MODULES_UPDATE_DEPENDENCY_TOOL, arguments: { id: 'shared' } });

    expect(upgrade).toContain('共用依赖');
    expect(upgrade).toContain('shared');
  });

  it('★ 更新工作台自己是另一句话：说清动的是它自己（别退到"一个模块"）', async () => {
    const update = await zhOf({ name: MODULES_UPDATE_WORKBENCH_TOOL, arguments: {} });

    expect(update).toContain('工作台');
    expect(update).toContain('新版');
    expect(update).not.toContain('重启');
    expect(update).not.toContain('一个模块');
    expect(panelsApproval({ name: MODULES_UPDATE_WORKBENCH_TOOL, arguments: {} })?.kind).toBe('ask');
  });

  it('★ install-bundle 点名那份 spec（别退到"一个模块"）', async () => {
    const zh = await zhOf({
      name: MODULES_INSTALL_BUNDLE_TOOL,
      arguments: { spec: '@scope/mod@1.2.3' },
    });

    expect(zh).toContain('@scope/mod@1.2.3');
    expect(zh).toContain('装');
    expect(zh).not.toContain('一个模块');
  });

  it('★ 动用户自己装的 opencli 插件：点名那个插件、说清是更新还是卸载（别退到"一个模块"）', async () => {
    const update = await zhOf({
      name: MODULES_UPDATE_PLUGIN_TOOL,
      arguments: { plugin: 'opencli-plugin-inventory' },
    });
    const uninstall = await zhOf({
      name: MODULES_UNINSTALL_PLUGIN_TOOL,
      arguments: { plugin: 'inventory' },
    });

    expect(update).toContain('更新');
    expect(update).toContain('插件');
    expect(update).toContain('opencli-plugin-inventory');
    expect(uninstall).toContain('卸载');
    expect(uninstall).toContain('inventory');
    expect(update).not.toContain('一个模块');
    expect(uninstall).not.toContain('一个模块');
  });
});

describe('工坊那一族一律不问（用户 2026-10-16 的决定：闭环里不回头找他点头）', () => {
  it('★★ 整族都回 allow：装、上板、点、敲、刷新…一把都不弹审批屏', () => {
    for (const name of DIY_TOOLS.filter((one) => one !== DIY_PUBLISH_TOOL)) {
      expect(panelsApproval({ name, arguments: { unit: 'demo' } }), name).toEqual({ kind: 'allow' });
      expect(panelsApproval({ name, arguments: {} }), name).toEqual({ kind: 'allow' });
    }
  });

  it('★★ 发布不跟整族 allow 走：要一次审批，说清发的是工作台模块', () => {
    const verdict = panelsApproval({ name: DIY_PUBLISH_TOOL, arguments: { unit: 'demo', target: 'team' } });
    expect(verdict?.kind).toBe('ask');
    if (verdict?.kind !== 'ask') return;
    expect(verdict.question.zh).toContain('工作台模块');
    expect(verdict.question.zh).toContain('团队源');
    expect(verdict.question.zh.endsWith('，允许吗？')).toBe(true);
    expect(verdict.fallback.zh).toContain('不发源码');
  });

  it('★★ 调试那四把不跟"整族 allow"走：开始与继续要点头，暂停与收工不问（ADR-0055）', () => {
    const start = panelsApproval({ name: DIY_DEBUG_START_TOOL, arguments: { unit: 'demo' } });
    expect(start?.kind).toBe('ask');
    expect(start?.kind === 'ask' ? start.question.zh : '').toContain('这个工作区的那块板');
    expect(start?.kind === 'ask' ? start.question.zh : '').toContain('留在那一屏');
    expect(start?.kind === 'ask' ? start.reason : '').toContain(DIY_DEBUG_START_TOOL);

    const resume = panelsApproval({ name: DIY_DEBUG_RESUME_TOOL, arguments: {} });
    expect(resume?.kind).toBe('ask');
    expect(resume?.kind === 'ask' ? resume.question.zh : '').toContain('请回到那一屏');

    expect(panelsApproval({ name: DIY_DEBUG_PAUSE_TOOL, arguments: {} })).toEqual({ kind: 'allow' });
    expect(panelsApproval({ name: DIY_DEBUG_STOP_TOOL, arguments: {} })).toEqual({ kind: 'allow' });
  });

  it('★★ 装与上板虽然清单里写着 writes:true，外壳那一层拿到的是"不用问"', async () => {
    for (const name of [DIY_INSTALL_TOOL, DIY_SHOW_TOOL]) {
      expect(panelsUnit.tools.find((tool) => tool.name === name)?.writes, name).toBe(true);
      const decision = await approvalFor(
        { name, arguments: { unit: 'demo' } },
        { writes: true, policy: panelsApproval },
      );
      expect(decision, name).toBeUndefined();
    }
  });

  it('★ 页面动作那批按"不写用户数据"报清单（writes:false），因此连策略都不用过', () => {
    for (const name of [
      DIY_STATE_TOOL,
      DIY_HTML_TOOL,
      DIY_FIND_TOOL,
      DIY_CLICK_TOOL,
      DIY_HOVER_TOOL,
      DIY_TYPE_TOOL,
      DIY_FILL_TOOL,
      DIY_KEYS_TOOL,
      DIY_SCROLL_TOOL,
      DIY_WAIT_TOOL,
      DIY_EVAL_TOOL,
      DIY_SCREENSHOT_TOOL,
      DIY_NETWORK_TOOL,
      DIY_DIALOG_TOOL,
    ]) {
      expect(panelsUnit.tools.find((tool) => tool.name === name)?.writes, name).toBe(false);
    }
  });
});

describe('读工具一格都不许问（它们不在写工具那半边）', () => {
  it('★ 读工具就是清单里没写 writes 的那些：策略对它们没意见，外壳也不会来问', async () => {
    expect([...READ_TOOLS].sort()).toEqual(
      [...ALL_TOOLS].filter((name) => !(WRITE_TOOLS as readonly string[]).includes(name)).sort(),
    );
    for (const name of READ_TOOLS) {
      expect(panelsUnit.tools.find((tool) => tool.name === name)?.writes, name).toBe(false);
      const verdict = panelsApproval({ name, arguments: { unit: 'demo', keyword: 'x' } });
      expect(verdict, name).toEqual(
        (DIY_TOOLS as readonly string[]).includes(name) ? { kind: 'allow' } : undefined,
      );
      const detailOf = vi.fn();
      expect(await approvalFor({ name, arguments: {} }, { writes: false, policy: panelsApproval, detailOf })).toBeUndefined();
      expect(detailOf).not.toHaveBeenCalled();
    }
  });

  it('★ 万一读工具被误标成写：当场 deny 并点名 needsApproval（fail closed，不静默放行）', async () => {
    const decision = await approvalFor(
      { name: PANELS_LIST_TOOL, arguments: {} },
      { writes: true, policy: panelsApproval },
    );

    expect(decision?.kind).toBe('deny');
    expect(decision?.kind === 'deny' ? decision.reason : '').toContain('needsApproval');
  });

  it('不是自己的工具 → 没意见（交给外壳的 fail closed 或别家套件）', async () => {
    expect(panelsApproval({ name: 'workbench_inventory_build', arguments: {} })).toBeUndefined();
    expect(panelsApproval({ arguments: {} })).toBeUndefined();
  });
});

describe('清单里的写工具都在自己的策略后面（漏了不报错，所以在这儿钉住）', () => {
  it('★ 每把写工具都有一通"真的写"的样例，而且样例表不多不少（新写工具漏了就红）', () => {
    expect(writers.map((tool) => tool.name).sort()).toEqual(Object.keys(WRITE_CALLS).sort());
    expect([...WRITE_TOOLS].sort()).toEqual(Object.keys(WRITE_CALLS).sort());
    expect(writers).toHaveLength(24);
  });

  it('★ 工坊之外的那通真写都要问（外壳按清单的 writes 把它交给策略）', () => {
    const ungated: string[] = [];
    for (const tool of writers) {
      if (ALLOWED_WRITES.has(tool.name)) continue;
      const verdict = panelsApproval({ name: tool.name, arguments: WRITE_CALLS[tool.name] });
      if (verdict?.kind !== 'ask') ungated.push(tool.name);
    }
    expect(ungated).toEqual([]);
  });

  it('★ 每把写工具都归策略管：要点头的必问、免问的必 allow；读工具连那一格都不进', () => {
    for (const name of WRITE_TOOLS) {
      const kind = panelsApproval({ name, arguments: WRITE_CALLS[name] })?.kind;
      expect(kind, name).toBe(ALLOWED_WRITES.has(name) ? 'allow' : 'ask');
    }
    for (const name of READ_TOOLS) {
      const verdict = panelsApproval({ name, arguments: {} });
      expect(verdict, name).toEqual(
        (DIY_TOOLS as readonly string[]).includes(name) ? { kind: 'allow' } : undefined,
      );
    }
  });
});

describe('文案口径：说清是工作台的动作、目标是哪个模块 / 插件，一句到底', () => {
  const NOUNS: Readonly<Record<string, string>> = {
    [PANELS_SHOW_TOOL]: '模块',
    [PANELS_HIDE_TOOL]: '模块',
    [PANELS_MOVE_TOOL]: '模块',
    [PANELS_RESET_TOOL]: '面板',
    [PANELS_FOLLOW_TOOL]: '模块这一行',
    [MODULES_INSTALL_TOOL]: '模块',
    [MODULES_UPDATE_TOOL]: '模块',
    [MODULES_UNINSTALL_TOOL]: '模块',
    [MODULES_INSTALL_BUNDLE_TOOL]: '模块',
    [MODULES_UPDATE_DEPENDENCY_TOOL]: '共用依赖',
    [MODULES_UPDATE_PLUGIN_TOOL]: '插件',
    [MODULES_UNINSTALL_PLUGIN_TOOL]: '插件',
    [MODULES_UPDATE_WORKBENCH_TOOL]: '工作台本身',
    [DIY_RECORD_PREPARE_TOOL]: '录制',
    [DIY_PUBLISH_TOOL]: '模块',
    [DIY_DEBUG_START_TOOL]: '调试',
    [DIY_DEBUG_RESUME_TOOL]: '调试',
    [LONG_TASKS_STOP_TOOL]: '长任务',
    [MARKET_ENABLE_TOOL]: '索引源',
    [MARKET_DISABLE_TOOL]: '索引源',
  };

  const SCENARIOS: readonly { readonly call: ApprovalCall; readonly noun: string }[] = [
    ...ASK_TOOLS.map((name) => ({
      call: { name, arguments: WRITE_CALLS[name] },
      noun: NOUNS[name] ?? '（名词表里缺这一族）',
    })),
    { call: { name: PANELS_FOLLOW_TOOL, arguments: {} }, noun: '面板' },
    { call: { name: PANELS_SHOW_TOOL, arguments: { id: 'inventory', scope: 'machine' } }, noun: '模块' },
    { call: { name: PANELS_HIDE_TOOL, arguments: { id: 'inventory', scope: 'machine' } }, noun: '模块' },
    { call: { name: PANELS_RESET_TOOL, arguments: { scope: 'machine' } }, noun: '机器级默认板' },
  ];

  it('★ 每把要问的写工具都在名词表里 —— 场景不再手写，是从清单本身长出来的', () => {
    expect(Object.keys(NOUNS).sort()).toEqual([...ASK_TOOLS].sort());
  });

  it('★ 上屏那一句（装配后）：一行、≤预算、含目标名词、不带解释性括号；问句式要点名"工作台"，陈述式要以"申请"开头', async () => {
    for (const { call, noun } of SCENARIOS) {
      const decision = await approvalFor(call, { writes: true, policy: panelsApproval });
      expect(decision?.kind, JSON.stringify(call.arguments)).toBe('ask');
      if (decision?.kind !== 'ask') continue;
      const { en, zh } = decision.displayReason;
      const asks = zh.endsWith('，允许吗？');

      expect(zh.includes('\n'), zh).toBe(false);
      expect(zh.length, `${zh.length} 字：${zh}`).toBeLessThanOrEqual(APPROVAL_HEADLINE_LIMIT);
      expect(en.length, `${en.length} 字符：${en}`).toBeLessThanOrEqual(APPROVAL_HEADLINE_LIMIT * 3);
      expect(zh.includes(noun), `${noun} · ${zh}`).toBe(true);
      expect(zh.includes('（'), zh).toBe(false);
      expect(zh.includes('('), zh).toBe(false);
      expect(en.includes('('), en).toBe(false);
      expect(zh.includes('**'), zh).toBe(false);

      if (asks) {
        expect(zh.includes('工作台'), zh).toBe(true);
        expect(en.toLowerCase().includes('workbench'), en).toBe(true);
        expect(en.endsWith(' Allow?'), en).toBe(true);
      } else {
        expect(zh.startsWith('申请'), zh).toBe(true);
        expect(en.startsWith('Request'), en).toBe(true);
      }
    }
  });

  const reshaped = (call: ApprovalCall, value: string): ApprovalCall => {
    const args = { ...((call.arguments ?? {}) as Record<string, unknown>) };
    for (const key of ['id', 'plugin', 'unit', 'doing', 'spec']) {
      if (typeof args[key] === 'string') args[key] = value;
    }
    return { ...call, arguments: args };
  };

  it('★ 短值那一轮（头行本来就该是一句短句）：问句 / 兜底句 ≤40 字、明细 ≤20 字 —— 跟模块那半边同一张表', () => {
    for (const { call } of SCENARIOS) {
      const verdict = panelsApproval(reshaped(call, 'demo'));
      if (verdict?.kind !== 'ask') continue;
      for (const [key, line] of [
        ['question', verdict.question],
        ['fallback', verdict.fallback],
      ] as const) {
        expect(line.zh.length, `${key}.zh（${line.zh.length} 字）：${line.zh}`).toBeLessThanOrEqual(
          APPROVAL_QUESTION_LIMIT,
        );
        expect(line.zh.includes('\n'), line.zh).toBe(false);
      }
      expect(APPROVAL_DETAIL_LIMIT, '明细的预算与 module-tools 的 HEAD_BUDGETS.detail 必须同数').toBe(20);
    }
  });

  it('★ 外壳自己的族不写宿主明细：事实归详情座（ApprovalPlan），标题永远只有一句', () => {
    for (const { call } of SCENARIOS) {
      const verdict = panelsApproval(call);
      if (verdict?.kind !== 'ask') continue;
      for (const [key, line] of [
        ['question', verdict.question],
        ['fallback', verdict.fallback],
      ] as const) {
        expect(line.zh.length, `${key}.zh（${line.zh.length} 字）：${line.zh}`).toBeLessThanOrEqual(
          APPROVAL_HEADLINE_LIMIT,
        );
        expect(line.zh.includes('\n'), line.zh).toBe(false);
      }
    }
  });

  it('★ 参数表里没有 approval_note 那一格的外壳工具：agent 塞了也不上屏', async () => {
    const decision = await approvalFor(
      {
        name: DIY_RECORD_PREPARE_TOOL,
        arguments: {
          unit: 'demo',
          url: 'https://inventory.example.com/env',
          doing: '发布',
          approval_note: '去掉静态噪音后再录一次，做对照',
        },
      },
      { writes: true, policy: panelsApproval },
    );

    expect(decision?.kind === 'ask' ? decision.displayReason.zh : '').toBe('申请录制调试');
  });

  it('★ 数据再长也不许把标题顶爆：把 id / 插件名 / 单元换成 20 字长名，仍是一行、仍在装配上限内', async () => {
    for (const { call } of SCENARIOS) {
      const decision = await approvalFor(reshaped(call, 'x'.repeat(20)), {
        writes: true,
        policy: panelsApproval,
      });
      if (decision?.kind !== 'ask') continue;
      const { zh } = decision.displayReason;

      expect(zh.includes('\n'), zh).toBe(false);
      expect(zh.length, `${zh.length} 字：${zh}`).toBeLessThanOrEqual(APPROVAL_HEADLINE_LIMIT);
    }
  });

  it('★ 目标带 id 时，id 用半角方括号夹在"工作台"和名词之间', () => {
    const zh = (call: ApprovalCall): string => {
      const verdict = panelsApproval(call);
      return verdict?.kind === 'ask' ? verdict.fallback.zh : '';
    };

    expect(zh({ name: MODULES_INSTALL_TOOL, arguments: { id: 'inventory' } })).toContain('工作台 [inventory] 模块');
    expect(zh({ name: MODULES_UPDATE_PLUGIN_TOOL, arguments: { plugin: 'inventory' } })).toContain(
      '工作台 [inventory] 插件',
    );
    expect(zh({ name: PANELS_FOLLOW_TOOL, arguments: { id: 'inventory' } })).toContain('工作台 [inventory] 模块这一行');
  });

  it('★ 升级工具与安装工具的话不一样（升 ≠ 装）', () => {
    const install = panelsApproval({ name: MODULES_INSTALL_TOOL, arguments: { id: 'inventory' } });
    const update = panelsApproval({ name: MODULES_UPDATE_TOOL, arguments: { id: 'inventory' } });

    expect(install?.kind === 'ask' ? install.question.zh : '').toContain('装');
    expect(update?.kind === 'ask' ? update.question.zh : '').toContain('升');
  });
});
