import type { Dictionaries, UnitClientFace, UnitManifest } from '@dsh-workbench/shared';

export const SAMPLE_UNIT_IDS = [
  'fixture-argocd',
  'fixture-cmdb',
  'fixture-demo',
  'fixture-board',
  'fixture-plain',
  'fixture-long',
  'fixture-crash',
  'fixture-kit',
] as const;

export type SampleUnitId = (typeof SAMPLE_UNIT_IDS)[number];

export const SAMPLE_TITLES: Readonly<Record<SampleUnitId, string>> = {
  'fixture-argocd': 'argocd',
  'fixture-cmdb': 'cmdb',
  'fixture-demo': '演示看板',
  'fixture-board': '看板',
  'fixture-plain': '无看板模块',
  'fixture-long': '一个名字特别特别长的模块用来验证省略号',
  'fixture-crash': '崩溃的卡片',
  'fixture-kit': '示例模块',
};

function messagesOf(unit: SampleUnitId): Dictionaries {
  const title = SAMPLE_TITLES[unit];
  return { zh: { [`${unit}.title`]: title }, en: { [`${unit}.title`]: title } };
}

function faceOf(unit: SampleUnitId): UnitClientFace {
  return {
    unit,
    card:
      unit === 'fixture-crash'
        ? () => {
            throw new Error('夹具：这张卡片故意渲染失败（看一张卡片崩溃不带走面板）');
          }
        : () => null,
    messages: messagesOf(unit),
  };
}

export const SAMPLE_UNITS: readonly UnitClientFace[] = SAMPLE_UNIT_IDS.map(faceOf);

export function manifestOf(unit: SampleUnitId): UnitManifest {
  return {
    id: unit,
    titleKey: `${unit}.title`,
    card: { order: 10 },
    tools: [],
    host: { inject: [] },
  };
}

interface RegistryLike {
  register(face: UnitClientFace): () => void;
}

let registry: RegistryLike | null = null;
let disposers: readonly (() => void)[] = [];
let pending: readonly string[] = [];

export function applySceneUnits(ids: readonly string[]): void {
  pending = ids;
  if (registry === null) return;
  for (const dispose of disposers) dispose();
  disposers = [];
  for (const id of ids) {
    const face = SAMPLE_UNITS.find((item) => item.unit === id);
    if (face === undefined) continue;
    disposers = [...disposers, registry.register(face)];
  }
}

export function registerDevFixtures(target: RegistryLike): void {
  registry = target;
  applySceneUnits(pending);
}
