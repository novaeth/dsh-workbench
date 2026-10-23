import { createElement as h } from 'react';
import type {
  BoardModule,
  BoardModuleProps,
  Dictionaries,
  UnitManifest,
  UnitOwnedClientFace,
} from '@dsh-workbench/shared';
import { Card, Row, Rows } from '@dsh-workbench/shared';
import { toBoardModule } from './registry';

export const FIXTURE_UNIT_ID = 'wb-fixture';
export const CRASH_UNIT_ID = 'wb-fixture-crash';

const KEY = {
  cardTitle: `${FIXTURE_UNIT_ID}.cardTitle`,
  cardMeta: `${FIXTURE_UNIT_ID}.cardMeta`,
  rowKey: `${FIXTURE_UNIT_ID}.rowKey`,
  rowValue: `${FIXTURE_UNIT_ID}.rowValue`,
} as const;

const messages: Dictionaries = {
  zh: {
    [KEY.cardTitle]: '示例模块',
    [KEY.cardMeta]: '夹具',
    [KEY.rowKey]: '示例',
    [KEY.rowValue]: '第 {n} 行',
  },
  en: {
    [KEY.cardTitle]: 'Sample module',
    [KEY.cardMeta]: 'Fixture',
    [KEY.rowKey]: 'Sample',
    [KEY.rowValue]: 'Row {n}',
  },
};

const manifest: UnitManifest = {
  id: FIXTURE_UNIT_ID,
  card: { titleKey: KEY.cardTitle, order: 900 },
  tools: [],
  host: { inject: [] },
};

function FixtureCard({ t, onRefresh }: BoardModuleProps) {
  return (
    <Card
      t={t}
      title={t(KEY.cardTitle)}
      meta={t(KEY.cardMeta)}
      refreshing={false}
      onRefresh={onRefresh}
    >
      <Rows>
        {[1, 2, 3].map((n) => (
          <Row key={String(n)} label={t(KEY.rowKey)} value={t(KEY.rowValue, { n: String(n) })} />
        ))}
      </Rows>
    </Card>
  );
}

export const FIXTURE_FACE: UnitOwnedClientFace = {
  unit: FIXTURE_UNIT_ID,
  manifest,
  messages,
  card: FixtureCard,
};

const CRASH_KEY = { cardTitle: `${CRASH_UNIT_ID}.cardTitle`, cardMeta: `${CRASH_UNIT_ID}.cardMeta` } as const;

const crashMessages: Dictionaries = {
  zh: {
    [CRASH_KEY.cardTitle]: '崩溃的卡片',
    [CRASH_KEY.cardMeta]: '夹具：渲染时抛错',
  },
  en: {
    [CRASH_KEY.cardTitle]: 'Crashing card',
    [CRASH_KEY.cardMeta]: 'Fixture: throws while rendering',
  },
};

const crashManifest: UnitManifest = {
  id: CRASH_UNIT_ID,
  card: { titleKey: CRASH_KEY.cardTitle, order: 899 },
  tools: [],
  host: { inject: [] },
};

function CrashingCard(): never {
  throw new Error('夹具：这张卡片按 wbCrash=1 故意渲染失败（守「一张卡片崩溃不带走面板」）');
}

export const CRASH_FACE: UnitOwnedClientFace = {
  unit: CRASH_UNIT_ID,
  manifest: crashManifest,
  messages: crashMessages,
  card: CrashingCard,
};

const SAMPLE_ROSTER: readonly UnitManifest[] = [manifest];

function hasCard(roster: readonly UnitManifest[]): boolean {
  return roster.some((item) => item.card !== null);
}

export function fixtureRoster(roster: readonly UnitManifest[]): readonly UnitManifest[] {
  return hasCard(roster) ? roster : SAMPLE_ROSTER;
}

function boardModuleOf(face: UnitOwnedClientFace): readonly BoardModule[] {
  const module = toBoardModule(face, face.manifest);
  return module === undefined ? [] : [module];
}

export function fixtureSeed(
  roster: readonly UnitManifest[],
  all: readonly BoardModule[],
  crash = false,
): readonly BoardModule[] {
  const base = hasCard(roster) ? all : boardModuleOf(FIXTURE_FACE);
  return crash ? [...boardModuleOf(CRASH_FACE), ...base] : base;
}
