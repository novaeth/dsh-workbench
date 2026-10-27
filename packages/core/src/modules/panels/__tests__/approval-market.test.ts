import { describe, expect, it } from 'vitest';
import type { MarketSourceConfig } from '@dsh-workbench/shared/contract/protocol/market-index';
import type { MarketSourcesStore } from '@/shared/api/host/market-sources-store';
import { panelsApproval, panelsApprovalFor } from '../model/approval';
import { MARKET_DISABLE_TOOL, MARKET_ENABLE_TOOL } from '../unit';

const gitSource = {
  id: 'team',
  label: '团队',
  kind: 'git' as const,
  url: 'https://git.example/wb/market.git',
};

function storeOf(sources: readonly MarketSourceConfig[], selected: string | null): MarketSourcesStore {
  const payload = { sources, selected };
  return {
    read: () => payload,
    apply: async () => payload,
  } as unknown as MarketSourcesStore;
}

function callOf(args: Record<string, unknown>) {
  return { name: MARKET_ENABLE_TOOL, arguments: args };
}

describe('索引源设为可发布：审批屏点名是哪个仓库', () => {
  it('★ 没印章的 git 源：问，并带上名字与地址', () => {
    const policy = panelsApprovalFor(undefined, undefined, undefined, storeOf([gitSource], 'team'));

    const verdict = policy(callOf({}));

    expect(verdict?.kind).toBe('ask');
    expect(JSON.stringify(verdict)).toContain('团队');
    expect(JSON.stringify(verdict)).toContain('https://git.example/wb/market.git');
    expect(JSON.stringify(verdict)).toContain('不碰仓库');
  });

  it('已经是可发布：不问（这一步什么都不会写）', () => {
    const enabled = { ...gitSource, policy: 'artifacts-in-repo' as const };
    const policy = panelsApprovalFor(undefined, undefined, undefined, storeOf([enabled], 'team'));

    expect(policy(callOf({}))).toEqual({ kind: 'allow' });
  });

  it('http 源：直接拒，理由给 agent 看', () => {
    const http = { ...gitSource, kind: 'http' as const, url: 'https://r.example/market.json' };
    const policy = panelsApprovalFor(undefined, undefined, undefined, storeOf([http], 'team'));
    expect(policy(callOf({}))).toEqual({ kind: 'deny', reason: expect.stringContaining('只能读') });
  });

  it('显式 catalog-only 也能翻回可发布：照样问一次', () => {
    const catalog = { ...gitSource, policy: 'catalog-only' as const };
    const policy = panelsApprovalFor(undefined, undefined, undefined, storeOf([catalog], 'team'));
    expect(policy(callOf({}))?.kind).toBe('ask');
  });

  it('有 store 但没选中任何源：直接拒，不弹审批', () => {
    const policy = panelsApprovalFor(undefined, undefined, undefined, storeOf([], null));
    expect(policy(callOf({}))).toEqual({ kind: 'deny', reason: expect.stringContaining('还没有选中的索引源') });
  });

  it('没有 store 可查：退回问「当前选中的索引源」，不冒认某个仓库', () => {
    expect(panelsApproval(callOf({}))?.kind).toBe('ask');
  });
});

describe('索引源改回只读：也要问一句（可发布的才问）', () => {
  const disableOf = (args: Record<string, unknown>) => ({ name: MARKET_DISABLE_TOOL, arguments: args });

  it('★ 可发布的 git 源：问，并带上名字、地址与"不碰仓库"', () => {
    const enabled = { ...gitSource, policy: 'artifacts-in-repo' as const };
    const policy = panelsApprovalFor(undefined, undefined, undefined, storeOf([enabled], 'team'));

    const verdict = policy(disableOf({}));

    expect(verdict?.kind).toBe('ask');
    expect(JSON.stringify(verdict)).toContain('团队');
    expect(JSON.stringify(verdict)).toContain('https://git.example/wb/market.git');
    expect(JSON.stringify(verdict)).toContain('不碰仓库');
  });

  it('已经只读：不问（这一步什么都不会写）', () => {
    const catalog = { ...gitSource, policy: 'catalog-only' as const };
    const policy = panelsApprovalFor(undefined, undefined, undefined, storeOf([catalog], 'team'));
    expect(policy(disableOf({}))).toEqual({ kind: 'allow' });
  });

  it('http 源：不问（它本来就不能当发布目的地）', () => {
    const http = { ...gitSource, kind: 'http' as const, url: 'https://r.example/market.json' };
    const policy = panelsApprovalFor(undefined, undefined, undefined, storeOf([http], 'team'));
    expect(policy(disableOf({}))).toEqual({ kind: 'allow' });
  });

  it('有 store 但没这个源：直接拒，不弹审批', () => {
    const policy = panelsApprovalFor(undefined, undefined, undefined, storeOf([gitSource], 'team'));
    expect(policy(disableOf({ id: 'nope' }))).toEqual({ kind: 'deny', reason: expect.stringContaining('没有这个索引源') });
  });

  it('没有 store 可查：退回问「当前选中的索引源」', () => {
    expect(panelsApproval(disableOf({}))?.kind).toBe('ask');
  });
});
