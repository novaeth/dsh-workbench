import { describe, expect, it } from 'vitest';
import type { SupplySource, UnitManifest } from '@dsh-workbench/shared';
import { extensionNeedOf, needStateOf } from '@dsh-workbench/shared/testing';
import type { CapabilityMap } from '@/shared/hooks/use-capabilities';
import { liveManifests, marketRows, sharedRows } from '../market-rows';

function unit(id: string, plugin?: string, sources?: readonly SupplySource[]): UnitManifest {
  return {
    id,
    titleKey: `${id}.mine`, card: { order: 10 },
    tools: [],
    host: { inject: [] },
    ...(plugin === undefined
      ? {}
      : { needs: [extensionNeedOf(plugin, { commands: ['x'], ...(sources === undefined ? {} : { sources }) })] }),
  };
}

function capability(
  id: string,
  status: string,
  provision?: CapabilityMap[string]['needs'][number]['provision'],
): CapabilityMap {
  const mapped: CapabilityMap[string]['status'] =
    status === 'outdated' ? 'outdated' : status === 'missing' ? 'missing' : (status as CapabilityMap[string]['status']);
  const needs =
    mapped === 'ok' || mapped === 'unchecked'
      ? []
      : [
          needStateOf(extensionNeedOf('demo', { commands: ['x'] }), mapped === 'outdated' ? 'outdated' : 'missing', {
            ...(provision === undefined ? {} : { provision }),
          }),
        ];
  return { [id]: { unit: id, status: mapped, needs, detail: '假探测' } };
}


describe('liveManifests：卸掉之后不该再摆在页面上', () => {
  const both = { ...capability('issues', 'ok'), ...capability('builds', 'unchecked') };

  it('★ 花名册里还在、本机名单里没有、探测也说不出话 → 这行不再出现，它牵出来的共用依赖也一起没了', () => {
    const manifests = [unit('issues', 'demo'), unit('builds', 'inventory')];
    const live = liveManifests(manifests, both, new Set(['issues']));

    expect(live.map((item) => item.id)).toEqual(['issues']);
    expect(marketRows(live, both).map((row) => row.id)).toEqual(['issues']);
    expect(sharedRows(live, both).map((row) => row.id)).toEqual(['extension:demo']);
    expect(sharedRows(manifests, both).map((row) => row.id)).toEqual(['extension:demo', 'extension:inventory']);
  });

  it('本机名单里有它（只是这轮探测没结论）→ 留着', () => {
    const manifests = [unit('issues', 'demo'), unit('builds', 'inventory')];

    expect(liveManifests(manifests, both, new Set(['issues', 'builds'])).map((item) => item.id)).toEqual([
      'issues',
      'builds',
    ]);
  });

  it('它还能给「安装」→ 留着（那是"未装、装得了"的正常行，不是幽灵）', () => {
    const manifests = [unit('issues', 'demo')];
    const installable = capability('issues', 'missing', 'ready');

    expect(liveManifests(manifests, installable, new Set()).map((item) => item.id)).toEqual(['issues']);
  });

  it('探测有结论而且它也给不出动作（没声明怎么装）→ 留着，那行本来就是要说的那件事', () => {
    const manifests = [unit('issues', 'demo')];

    expect(
      liveManifests(manifests, capability('issues', 'missing', 'not-declared'), new Set()).map(
        (item) => item.id,
      ),
    ).toEqual(['issues']);
  });

  it('★ 本机名单还没读到 / 还没探完 → 一个都不动（读失败就当不知道，别把真模块藏了）', () => {
    const manifests = [unit('issues', 'demo')];

    expect(liveManifests(manifests, capability('issues', 'unchecked'), null)).toEqual(manifests);
    expect(liveManifests(manifests, null, new Set())).toEqual(manifests);
  });
});
