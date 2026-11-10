import { describe, expect, it } from 'vitest';
import {
  DIY_STATE_TOOL,
  PANELS_SHOW_TOOL,
  TOOLBOX_LIST_TOOL,
  TOOLBOX_OPEN_TOOL,
} from '../unit';
import { absentScreenReason, offBoardReason, packClosedReason } from '../model/closed-tool';
import type { PackEntry } from '../model/toolbox';

const shellPack: PackEntry = {
  id: 'manage',
  label: { zh: '工作台管理', en: 'workbench admin' },
  hint: '面板 · 模块 · 市场 · 长任务',
  tools: ['workbench_panels_show'],
  alwaysOn: [],
  writes: 1,
  kind: 'shell',
};

const mcpPack: PackEntry = {
  id: 'mcp:chrome',
  label: { zh: 'chrome（MCP）', en: 'chrome (MCP)' },
  hint: 'dsh 的 MCP server',
  tools: ['mcp__chrome__list_pages'],
  alwaysOn: [],
  writes: 0,
  kind: 'mcp',
};

describe('收起的工具：理由要能让模型说出下一次调什么', () => {
  it('外壳包：点名包 id、开包工具、以及不确定时的目录', () => {
    const reason = packClosedReason('workbench_panels_show', shellPack);

    expect(reason).toContain('workbench_panels_show');
    expect(reason).toContain('manage');
    expect(reason).toContain(`${TOOLBOX_OPEN_TOOL}（targets: ["manage"]）`);
    expect(reason).toContain(TOOLBOX_LIST_TOOL);
  });

  it('MCP 包：包 id 就是 mcp:<server>，不用另写一套说法', () => {
    const reason = packClosedReason('mcp__chrome__list_pages', mcpPack);

    expect(reason).toContain(`${TOOLBOX_OPEN_TOOL}（targets: ["mcp:chrome"]）`);
  });

  it('没上板：先上板再开包，两条动作都给出来', () => {
    const reason = offBoardReason('workbench_off_y_list', 'off-y');

    expect(reason).toContain('off-y');
    expect(reason).toContain(PANELS_SHOW_TOOL);
    expect(reason).toContain(TOOLBOX_OPEN_TOOL);
  });

  it('能力缺失：说清"开包也救不了"，并给出这台 dsh 上的替代做法', () => {
    const reason = absentScreenReason('workbench_diy_debug_start');

    expect(reason).toContain('workbench_diy_debug_start');
    expect(reason).toContain('没探到页面调试能力');
    expect(reason).toContain(DIY_STATE_TOOL);
  });
});
