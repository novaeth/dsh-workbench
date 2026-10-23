import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { REPO, pkg } from '../lib.mjs';

const FACES = ['api', 'components', 'hooks', 'lib'];

const GUIDANCE_DIR = pkg('skills');

const KIT_DOC = join(GUIDANCE_DIR, 'workbench-module-diy', 'KIT.md');

const FROZEN = {
  api: [
    'CONTEXT_SOURCE', 'addContextChip', 'apiGet', 'apiPost', 'installContextChips', 'serializeChipRef',
  ],
  components: [
    'ActivityAction', 'ActivityBlock', 'ActivityLine', 'ApprovalDetail', 'ApprovalPlan', 'BlockerState',
    'Card', 'CardAnchor', 'CardBoundary', 'CardHead', 'CenteredState', 'ChoiceGroup', 'EmptyState',
    'Field', 'Form', 'FormActions', 'FormRow', 'FormRows', 'IconBrandMark', 'IconConversation',
    'IconModuleMark', 'IconNpm', 'IconOpencli', 'IconPanelScreen', 'Link', 'LongTaskRow', 'Note', 'Row',
    'Rows', 'SaveBar', 'SelectField', 'SettingsSection', 'SkeletonRows', 'Spinner', 'Stack', 'StateBlock',
    'TextField', 'Tip',
  ],
  hooks: [
    'busyView', 'heldPhase', 'readKeyOf', 'requestResource', 'resourceIdentity', 'subscribeFactRevision',
    'useApiResource', 'useCapabilityGate', 'useCapabilityMap', 'useCardSummary', 'useFactInvalidate',
    'useFactRevision', 'useHostWrite', 'useLongTask', 'useUnitBoard', 'useVisibleBusy',
  ],
  lib: [
    'MIN_BUSY_MS', 'blockerOfCapability', 'blockerOfError', 'cardIdOf', 'cx', 'defaultSelectFilter',
    'duplicateKeysOf', 'errorReasonOf', 'excerpt', 'filterSelectOptions', 'firstProblemOf',
    'formFirstProblemOf', 'formValuesOf', 'holdBusy', 'parseJsonLoose', 'parseLocalTimestamp', 'readText',
    'relativeTime', 'relativeTimeAgo', 'relativeTimeBucket', 'relativeTimeCompact', 'revealFirstProblem',
    'searchTextOf', 'selectCursorValue', 'selectEntries', 'shortenPath', 'stepSelectCursor', 'writeText',
  ],
};

const ADDITIONS = [
  { key: 'components.ConfirmBar', why: 'named' },
  { key: 'lib.longTaskIsLive', why: 'named' },

  { key: 'api.factOfRoute', why: 'named' },
];

function mdFilesUnder(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return mdFilesUnder(full);
    return entry.name.endsWith('.md') ? [full] : [];
  });
}

function sourceFilesUnder(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '__tests__') sourceFilesUnder(full, out);
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

export function codeTextOf(markdown) {
  const parts = [];
  for (const match of markdown.matchAll(/```[^\n]*\n([\s\S]*?)```/g)) parts.push(match[1]);
  for (const match of markdown.matchAll(/`([^`\n]+)`/g)) parts.push(match[1]);
  return parts.join('\n');
}

export function guidanceCodeText() {
  return mdFilesUnder(GUIDANCE_DIR)
    .map((file) => codeTextOf(readFileSync(file, 'utf8')))
    .join('\n');
}

export function realModuleSources() {
  const packages = join(REPO, 'packages');
  if (!existsSync(packages)) return [];
  return readdirSync(packages, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('module-'))
    .flatMap((entry) => sourceFilesUnder(join(packages, entry.name, 'src')));
}

export function moduleKitUsage() {
  const used = new Set();
  for (const file of realModuleSources()) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/kit\.([a-z]+)\.([A-Za-z0-9_$]+)/g)) {
      used.add(`${match[1]}.${match[2]}`);
    }
    for (const match of text.matchAll(/\{([^{}]*)\}\s*=\s*kit\.([a-z]+)/g)) {
      for (const raw of match[1].split(',')) {
        const name = raw.split(':')[0].trim();
        if (name !== '') used.add(`${match[2]}.${name}`);
      }
    }
  }
  return used;
}

export function tableMembersOf(markdown) {
  const members = [];
  for (const line of markdown.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const cells = trimmed.replace(/^\|/, '').replace(/\|$/, '').split('|').map((one) => one.trim());
    if (cells.length < 2) continue;
    for (const match of cells[1].matchAll(/`([A-Za-z_$][\w$]*)`/g)) members.push(match[1]);
  }
  return members;
}

const TABLE_PROSE = new Set(['hint', 'release']);

export function tableViolations({ members, kitNames, prose }) {
  const bad = [];
  for (const name of [...new Set(members)].sort()) {
    if (kitNames.has(name) || prose.has(name)) continue;
    bad.push(`速查表里点了 ${name}，但这份 kit 面上没有它（要么改指引、要么把它加回 kit 面）`);
  }
  return bad;
}

export function kitPairsOf(kit) {
  const pairs = new Set();
  for (const face of FACES) {
    const bucket = kit?.[face];
    if (bucket === undefined || bucket === null) continue;
    for (const name of Object.keys(bucket)) pairs.add(`${face}.${name}`);
  }
  return pairs;
}

export function kitRefsInGuidance() {
  const refs = [];
  for (const file of mdFilesUnder(GUIDANCE_DIR)) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/kit\.([a-z]+)(?:\.([A-Za-z0-9_$]+))?/g)) {
      refs.push({ face: match[1], name: match[2] ?? '', file: relative(GUIDANCE_DIR, file) });
    }
  }
  return refs;
}

export function curationViolations({ pairs, frozen, additions, guidance, moduleUsage }) {
  const bad = [];
  const frozenKeys = new Set(FACES.flatMap((face) => (frozen[face] ?? []).map((name) => `${face}.${name}`)));
  const additionsByKey = new Map(additions.map((one) => [one.key, one]));
  for (const key of [...pairs].sort()) {
    if (frozenKeys.has(key) || additionsByKey.has(key)) continue;
    bad.push(`新增成员 ${key}：要么在随包指引里点名它、要么让某个真实模块用上、要么在 ADDITIONS 里写一条豁免`);
  }
  for (const key of [...frozenKeys].sort()) {
    if (!pairs.has(key)) bad.push(`冻结名单里的 ${key} 已经不在 kit 面上了 —— 收缩是好事，把它从 FROZEN 里划掉`);
  }
  for (const one of additions) {
    if (!pairs.has(one.key)) {
      bad.push(`ADDITIONS 里的 ${one.key} 已经不在 kit 面上了 —— 划掉它`);
      continue;
    }
    if (one.why === 'parked') {
      if (String(one.note ?? '').trim().length < 8) bad.push(`${one.key} 的豁免没写理由（parked 的 note 必填）`);
      continue;
    }

    if (one.why === 'named' && !new RegExp(`(?<![\\w$])${one.key.split('.')[1]}(?![\\w$])`).test(guidance)) {
      bad.push(`${one.key} 声称被指引点名，但随包指引里找不到它`);
    }
    if (one.why === 'used' && !moduleUsage.has(one.key)) {
      bad.push(`${one.key} 声称被真实模块用过，但本地模块源码里没有 kit.${one.key} 的取用`);
    }
    if (one.why !== 'named' && one.why !== 'used') bad.push(`${one.key} 的 why 只能是 named / used / parked`);
  }
  return bad;
}

export function guidanceViolations({ kit, refs }) {
  const bad = [];
  for (const ref of refs) {
    const bucket = kit?.[ref.face];
    if (bucket === undefined || bucket === null) {
      bad.push(`${ref.file} 里写了 kit.${ref.face}，没有这个桶`);
      continue;
    }
    if (ref.name !== '' && !(ref.name in bucket)) {
      bad.push(`${ref.file} 里写了 kit.${ref.face}.${ref.name}，这个桶里没有它`);
    }
  }
  return bad;
}

const CURATION_TITLE =
  '★ 策展闸：kit 面不许悄悄长大（新增成员要么被随包指引点名、要么被真实模块用过、要么显式豁免）';

export const checks = [
  {
    title: CURATION_TITLE,
    run(ctx, report) {
      if (ctx.kit === undefined) {
        report(CURATION_TITLE, false, 'kit 对象没拿到（上面「客户端导出 kit」那条先红了）');
        return;
      }
      const pairs = kitPairsOf(ctx.kit);
      const frozenCount = FACES.reduce((sum, face) => sum + (FROZEN[face] ?? []).length, 0);
      const bad = curationViolations({
        pairs,
        frozen: FROZEN,
        additions: ADDITIONS,
        guidance: guidanceCodeText(),
        moduleUsage: moduleKitUsage(),
      });
      report(
        CURATION_TITLE,
        bad.length === 0,
        `${pairs.size} 个成员（冻结 ${frozenCount} + 新增 ${ADDITIONS.length}）：${bad.join('；') || '全部有来路'}`,
      );
    },
  },
  {
    title: '★ 指引一致闸：随包指引里写的 kit.<桶>.<名> 必须与真实 kit 面一致',
    run(ctx, report) {
      const title = '★ 指引一致闸：随包指引里写的 kit.<桶>.<名> 必须与真实 kit 面一致';
      if (ctx.kit === undefined) {
        report(title, false, 'kit 对象没拿到（上面那条先红了）');
        return;
      }
      const refs = kitRefsInGuidance();
      const bad = guidanceViolations({ kit: ctx.kit, refs });

      report(
        title,
        refs.length >= 5 && bad.length === 0,
        `${refs.length} 处引用：${bad.join('；') || '都在真桶里'}`,
      );
    },
  },
  {
    title: '★ 指引推荐表不许点名 kit 面上没有的件（KIT.md 速查表第二列）',
    run(ctx, report) {
      const title = '★ 指引推荐表不许点名 kit 面上没有的件（KIT.md 速查表第二列）';
      if (ctx.kit === undefined) {
        report(title, false, 'kit 对象没拿到（上面那条先红了）');
        return;
      }
      const members = tableMembersOf(readFileSync(KIT_DOC, 'utf8'));
      const kitNames = new Set([...kitPairsOf(ctx.kit)].map((pair) => pair.split('.')[1]));
      const bad = tableViolations({ members, kitNames, prose: TABLE_PROSE });
      report(
        title,
        members.length >= 15 && bad.length === 0,
        `${new Set(members).size} 处推荐：${bad.join('；') || '都在 kit 面上'}`,
      );
    },
  },
  {
    title: '★ 两道闸自己有负例（塞没人用也没点名的成员、名单腐烂、桶写错 ⇒ 当场红）',
    run(ctx, report) {
      const title = '★ 两道闸自己有负例（塞没人用也没点名的成员、名单腐烂、桶写错 ⇒ 当场红）';
      const frozen = { api: [], components: [], hooks: [], lib: ['excerpt'] };
      const base = { frozen, additions: [], guidance: '', moduleUsage: new Set() };
      const one = (input) => curationViolations({ ...base, pairs: new Set(['lib.excerpt']), ...input }).length;
      const cases = [
        ['新成员没人用也没被点名 ⇒ 红', one({ pairs: new Set(['lib.excerpt', 'lib.brandNew']) }) === 1],
        ['冻结名单烂了（成员没了）⇒ 红', one({ frozen: { ...frozen, lib: ['excerpt', 'gone'] } }) === 1],
        ['声称被点名、指引里却没有 ⇒ 红', one({ additions: [{ key: 'lib.excerpt', why: 'named' }] }) === 1],
        ['声称被用过、模块里却没有 ⇒ 红', one({ additions: [{ key: 'lib.excerpt', why: 'used' }] }) === 1],
        ['豁免没写理由 ⇒ 红', one({ additions: [{ key: 'lib.excerpt', why: 'parked', note: '' }] }) === 1],
        ['正例：冻结面上原样 ⇒ 不红', one({}) === 0],
        [
          '推荐表里点了 kit 面上没有的件 ⇒ 红',
          tableViolations({ members: ['Card', 'longTaskDot'], kitNames: new Set(['Card']), prose: new Set() }).length === 1,
        ],
        [
          '推荐表里提到属性名（在白名单里）⇒ 不红',
          tableViolations({ members: ['hint'], kitNames: new Set(), prose: new Set(['hint']) }).length === 0,
        ],
      ];
      const kit = { components: { Card: 1 }, lib: { excerpt: 1 } };
      const refs = [
        ['正例：桶与名都对 ⇒ 不红', guidanceViolations({ kit, refs: [{ face: 'lib', name: 'excerpt', file: 'x.md' }] }).length === 0],
        [
          '负例：把成员写到别的桶 ⇒ 红（S2 那个 bug 的形状）',
          guidanceViolations({ kit, refs: [{ face: 'components', name: 'excerpt', file: 'x.md' }] }).length === 1,
        ],
        ['负例：桶根本不存在 ⇒ 红', guidanceViolations({ kit, refs: [{ face: 'nope', name: '', file: 'x.md' }] }).length === 1],
      ];
      const failures = [...cases, ...refs].filter(([, ok]) => !ok).map(([name]) => name);
      report(title, failures.length === 0, failures.length === 0 ? `${cases.length + refs.length} 条负例都对` : failures.join('；'));
    },
  },
];
