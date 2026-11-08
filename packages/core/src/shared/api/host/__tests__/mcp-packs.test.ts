import { describe, expect, it } from 'vitest';
import type { DshPromptAssembly } from '@dsh-workbench/shared';
import { createMcpPacks, mcpServerOf } from '../mcp-packs';

const assembly = (...names: string[]): DshPromptAssembly => ({
  tools: names.map((name) => ({ name })),
});

describe('MCP 工具收成外部包', () => {
  it('名字按 mcp__<server>__<tool> 认；不是 MCP 的不碰', () => {
    expect(mcpServerOf('mcp__chrome__navigate_page')).toBe('chrome');
    expect(mcpServerOf('mcp__chrome-devtools__list_pages')).toBe('chrome-devtools');
    expect(mcpServerOf('workbench_panels_list')).toBeUndefined();
    expect(mcpServerOf('mcp__broken')).toBeUndefined();
  });

  it('★ 见过一次就登记：同名去重，多个 server 分开，新名字才报 changed', () => {
    const packs = createMcpPacks();

    expect(packs.observe(assembly('mcp__chrome__a', 'mcp__chrome__b', 'workbench_panels_list'))).toBe(true);
    expect(packs.observe(assembly('mcp__chrome__a'))).toBe(false);
    expect(packs.observe(assembly('mcp__other__c'))).toBe(true);

    expect(packs.servers()).toEqual([
      { name: 'chrome', tools: ['mcp__chrome__a', 'mcp__chrome__b'] },
      { name: 'other', tools: ['mcp__other__c'] },
    ]);
  });

  it('★ 没收进上下文：包没开就把它的工具全 deny；开了就一个都不 deny', () => {
    const packs = createMcpPacks();
    packs.observe(assembly('mcp__chrome__a', 'mcp__chrome__b', 'mcp__other__c'));

    expect(packs.deniedFor(() => false)).toEqual(['mcp__chrome__a', 'mcp__chrome__b', 'mcp__other__c']);
    expect(packs.deniedFor((pack) => pack === 'mcp:chrome')).toEqual(['mcp__other__c']);
    expect(packs.deniedFor(() => true)).toEqual([]);
  });

  it('还没见过任何 MCP 工具时：没东西可 deny', () => {
    expect(createMcpPacks().deniedFor(() => false)).toEqual([]);
  });
});
