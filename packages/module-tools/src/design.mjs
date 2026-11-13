import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { callsProblemOf, describeRecipe, recipeProblemOf } from '@dsh-workbench/shared/host';

export const DESIGN_FILE = 'design.json';
export const DEVELOPING_FILE = 'DEVELOPING.md';
export const README_SOURCE_FILE = 'readme.json';
export const START_MARK = '<!-- dsh-wb:design:start -->';
export const END_MARK = '<!-- dsh-wb:design:end -->';

export const STATE_KEYS = ['idle', 'loading', 'ready', 'empty', 'unreadable'];
const STATE_LABELS = {
  idle: '待机（还没选东西）',
  loading: '加载',
  ready: '就绪',
  empty: '就绪但空',
  unreadable: '读不到',
};
const LETTERS = ['A', 'B', 'C', 'D', 'E'];
const PENDING = '（待填）';

const ROWS = {
  panel: { fields: ['cell', 'conclusion'], optional: ['link'] },
  config: {
    fields: ['persistence', 'key', 'watches', 'default', 'valuesFrom', 'wrongChoice'],
    choices: { persistence: ['prefs', 'view'] },
    mayBeEmpty: true,
  },
  capabilities: {
    fields: ['name', 'oneLine', 'shape', 'approval'],
    optional: ['approvalText'],
    mayBeEmpty: true,
  },
  linkage: { fields: ['who', 'when', 'whatChanges', 'userSees'] },
  acceptance: { fields: ['step'] },
};
const DATASOURCE_FIELDS = ['read', 'params', 'credentials', 'notLoggedIn', 'timeout'];
const WRITE_FIELDS = ['command', 'params', 'credentials', 'preview', 'readback', 'undo', 'failure'];

const SOURCE_TAGS = ['已证', '声明', '人证', '契约', '未定'];

function hasBareRequired(value) {
  let at = value.indexOf('必填');
  while (at !== -1) {
    const before = value[at - 1];
    if (before !== '非' && before !== '不') return true;
    at = value.indexOf('必填', at + 2);
  }
  return false;
}

function readsOf(design) {
  const list = design?.reads;
  if (Array.isArray(list) && list.length > 0) return list;
  const one = design?.datasource;
  return one === undefined || one === null || typeof one !== 'object' ? [] : [one];
}

function writesOf(design) {
  const list = design?.writes;
  if (Array.isArray(list) && list.length > 0) return list;
  const one = design?.write;
  return one === undefined || one === null || typeof one !== 'object' ? [] : [one];
}

function persistenceLabel(value) {
  const raw = text(value);
  if (raw === 'prefs') return '存起来（按工作区记，刷新还在）';
  if (raw === 'view') return '只在这次看的时候选（刷新回默认）';
  return cell(raw);
}

function recipeSummaryOf(recipe) {
  try {
    const described = describeRecipe(recipe);
    const auth =
      described.auth === undefined
        ? 'cookie'
        : `${described.auth.source} → ${described.auth.place}${described.auth.name === undefined ? '' : `（${described.auth.name}）`}`;
    return `${described.method} ${described.url} · ${auth}`;
  } catch (error) {
    return `（配方不合法：${error.message}）`;
  }
}

function callsSummaryOf(recipe, calls) {
  try {
    return Object.keys(calls)
      .map((name) => {
        const described = describeRecipe(recipe, calls[name]);
        return `${name}: ${described.url}`;
      })
      .join('；');
  } catch (error) {
    return `（批量不合法：${error.message}）`;
  }
}

function datasourceRowsOf(read) {
  return [
    '| 项 | 值（照抄，别转述） |',
    '|---|---|',
    `| 哪条读（命令 / URL） | ${cell(read?.read)} |`,
    ...(read?.recipe === undefined ? [] : [`| 调用形状（配方） | ${cell(recipeSummaryOf(read.recipe))} |`]),
    ...(read?.calls === undefined ? [] : [`| 一次打几条（批量） | ${cell(callsSummaryOf(read.recipe, read.calls))} |`]),
    `| 参数（缺省 / 范围 / 上限） | ${cell(read?.params)} |`,
    `| 凭据从哪来 | ${cell(read?.credentials)} |`,
    `| 没登录 / 凭据过期时是什么样 | ${cell(read?.notLoggedIn)} |`,
    `| 超时 / 连不上时是什么样 | ${cell(read?.timeout)} |`,
    `| 当初探明用的那次调用（原文） | ${soft(read?.probeCommand)} |`,
  ];
}

function writeRowsOf(write) {
  return [
    '| 项 | 值（照抄，别转述） |',
    '|---|---|',
    `| 哪条写（命令 / URL + 方法） | ${cell(write?.command)} |`,
    ...(write?.recipe === undefined ? [] : [`| 调用形状（配方） | ${cell(recipeSummaryOf(write.recipe))} |`]),
    `| 参数（必填 / 取值枚举 / 上限） | ${cell(write?.params)} |`,
    `| 凭据从哪来 | ${cell(write?.credentials)} |`,
    `| 有没有预览档（没有就写"没有，一次就是真的"） | ${cell(write?.preview)} |`,
    `| 写完之后怎么回读确认（哪条读 / 出参哪个字段） | ${cell(write?.readback)} |`,
    `| 配对的那个撤销 / 删除（没有就写"没有配对，一次就是真的"） | ${cell(write?.undo)} |`,
    `| 失败长什么样（含"可能已经写了"） | ${cell(write?.failure)} |`,
    `| 当初探明 / 预览用的那次调用（原文） | ${soft(write?.probeCommand)} |`,
  ];
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function pending(value) {
  return text(value) === '' || text(value) === PENDING;
}

function asRows(value) {
  return Array.isArray(value) ? value : [];
}

export function readDesign(root) {
  const file = join(root, DESIGN_FILE);
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`✖ ${DESIGN_FILE} 不是合法 JSON：${error.message}`);
    process.exit(1);
  }
}

export function acceptanceOf(root) {
  const design = readDesign(root);
  const rows = asRows(design?.acceptance);
  return {
    total: rows.length,
    checked: rows.filter((one) => one?.checked === true).length,
    acceptedAt: typeof design?.acceptedAt === 'string' ? design.acceptedAt : undefined,
  };
}

function skeleton(manifest = {}) {
  return {
    unit: text(manifest?.dsh?.workbench?.unit) || text(manifest.name).replace(/^.*\/module-/, ''),
    name: text(manifest.name),
    oneLine: text(manifest.description),
    panel: [{ cell: '', conclusion: '', link: '' }],
    states: STATE_KEYS.map((key) => ({ key, sees: '', canDo: '', agentCan: '' })),
    config: [],
    capabilities: [],
    linkage: [{ who: '', when: '', whatChanges: '', userSees: '' }],
    datasource: {
      read: '',
      params: '',
      credentials: '',
      notLoggedIn: '',
      timeout: '',
      probeCommand: '',
    },
    writes: [],
    acceptance: [{ step: '' }],
  };
}

export function writeDesign(root, value) {
  writeFileSync(join(root, DESIGN_FILE), `${JSON.stringify(value, null, 2)}\n`);
}

function need(cells, value, path) {
  if (pending(value)) cells.push(path);
}

export function emptyCells(design) {
  const cells = [];
  for (const field of ['unit', 'name', 'oneLine']) need(cells, design?.[field], field);

  for (const [key, rule] of Object.entries(ROWS)) {
    const rows = asRows(design?.[key]);
    if (rows.length === 0) {
      if (rule.mayBeEmpty !== true) cells.push(`${key}（一行都没有）`);
      continue;
    }
    rows.forEach((row, index) => {
      for (const field of rule.fields) need(cells, row?.[field], `${key}[${index}].${field}`);
      for (const [field, allowed] of Object.entries(rule.choices ?? {})) {
        const raw = text(row?.[field]);
        if (raw !== '' && !allowed.includes(raw)) {
          cells.push(`${key}[${index}].${field}（只认 ${allowed.join(' / ')}，收到「${raw}」）`);
        }
      }
    });
  }

  const states = asRows(design?.states);
  const noCapabilities = asRows(design?.capabilities).length === 0;
  for (const [index, key] of STATE_KEYS.entries()) {
    const row = states.find((one) => text(one?.key) === key);
    if (row === undefined) {
      cells.push(`states[${index}]（缺 ${key} 这一态）`);
      continue;
    }

    if (text(row.na) !== '') continue;
    for (const field of ['sees', 'canDo']) need(cells, row[field], `states.${key}.${field}`);

    if (!noCapabilities) need(cells, row.agentCan, `states.${key}.agentCan`);
  }

  const reads = readsOf(design);
  if (reads.length === 0) cells.push('数据源（一条读都没写：datasource 或 reads 至少要有一条）');
  reads.forEach((read, index) => {
    const label = reads.length === 1 ? 'datasource' : `reads[${index}]`;
    for (const field of DATASOURCE_FIELDS) need(cells, read?.[field], `${label}.${field}`);

    const recipe = read?.recipe;
    const custom = read?.custom;
    if (recipe !== undefined && custom !== undefined) {
      cells.push(`${label}.recipe（recipe 与 custom 只能二选一）`);
    }
    if (recipe !== undefined) {
      const problem = recipeProblemOf(recipe);
      if (problem !== undefined) cells.push(`${label}.recipe（${problem}）`);
    }
    if (read?.calls !== undefined) {
      if (recipe === undefined) cells.push(`${label}.calls（calls 要有 recipe）`);
      else {
        const problem = callsProblemOf(recipe, read.calls);
        if (problem !== undefined) cells.push(`${label}.calls（${problem}）`);
      }
    }
    if (custom !== undefined && text(custom?.why) === '') cells.push(`${label}.custom.why`);

    const key = text(read?.key);
    if (key !== '' && !/^[a-z][A-Za-z0-9]*$/.test(key)) cells.push(`${label}.key（lowerCamelCase）`);
  });

  const writes = writesOf(design);
  writes.forEach((write, index) => {
    const label = writes.length === 1 ? 'write' : `writes[${index}]`;
    for (const field of WRITE_FIELDS) need(cells, write?.[field], `${label}.${field}`);

    const params = text(write?.params);
    if (!pending(params) && hasBareRequired(params) && !SOURCE_TAGS.some((tag) => params.includes(tag))) {
      cells.push(`${label}.params.source`);
    }

    const recipe = write?.recipe;
    const custom = write?.custom;
    if (recipe !== undefined && custom !== undefined) {
      cells.push(`${label}.recipe（recipe 与 custom 只能二选一）`);
    }
    if (recipe !== undefined) {
      const problem = recipeProblemOf(recipe);
      if (problem !== undefined) cells.push(`${label}.recipe（${problem}）`);
    }
    if (custom !== undefined && text(custom?.why) === '') cells.push(`${label}.custom.why`);

    const key = text(write?.key);
    if (key !== '' && !/^[a-z][A-Za-z0-9]*$/.test(key)) cells.push(`${label}.key（lowerCamelCase）`);
  });

  const keys = new Set();
  const seen = new Map();
  for (const [readIndex, read] of reads.entries()) {
    const key = text(read?.key);
    if (key === '') continue;
    if (keys.has(key)) cells.push(`数据源 key 重复：${key}（${seen.get(key)} 与 读 ${String(readIndex + 1)}）`);
    else seen.set(key, `读 ${String(readIndex + 1)}`);
    keys.add(key);
  }
  for (const [writeIndex, write] of writes.entries()) {
    const key = text(write?.key);
    if (key === '') continue;
    if (keys.has(key)) cells.push(`数据源 key 重复：${key}（${seen.get(key)} 与 写 ${String(writeIndex + 1)}）`);
    else seen.set(key, `写 ${String(writeIndex + 1)}`);
    keys.add(key);
  }

  return cells;
}

function cell(value) {
  const raw = text(value);
  return raw === '' ? PENDING : raw.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
}

function soft(value) {
  const raw = text(value);
  return raw === '' || raw === PENDING ? '—' : cell(raw);
}

function tableOf(header, rows) {
  const columns = header.split(' | ');
  const divider = `|${columns.map(() => '---').join('|')}|`;
  return [`| ${header} |`, divider, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
}

export function designWarningsOf(design) {
  const reads = readsOf(design);
  const writes = writesOf(design);
  const warnings = [];
  reads.forEach((read, index) => {
    if (read?.custom === undefined) return;
    const label = reads.length === 1 ? 'datasource' : `reads[${index}]`;
    const why = text(read.custom?.why);
    warnings.push(`${label}.custom（${why === '' ? '没写 why' : why}）—— 配方盖不住的读，理由要留在底稿里`);
  });
  writes.forEach((write, index) => {
    if (write?.custom === undefined) return;
    const label = writes.length === 1 ? 'write' : `writes[${index}]`;
    const why = text(write.custom?.why);
    warnings.push(`${label}.custom（${why === '' ? '没写 why' : why}）—— 配方盖不住的写，理由要留在底稿里`);
  });
  return warnings;
}

export function renderDesign(design) {
  const panel = asRows(design?.panel);
  const config = asRows(design?.config);
  const capabilities = asRows(design?.capabilities);
  const linkage = asRows(design?.linkage);
  const acceptance = asRows(design?.acceptance);
  const states = asRows(design?.states);
  const reads = readsOf(design);
  const writes = writesOf(design);

  const stateRows = STATE_KEYS.map((key, index) => {
    const row = states.find((one) => text(one?.key) === key) ?? {};
    const na = text(row.na);
    if (na !== '') {
      return [LETTERS[index], STATE_LABELS[key], `（这份模块不适用）${na}`, '—', '—'];
    }
    return [
      LETTERS[index],
      STATE_LABELS[key],
      cell(row.sees),
      cell(row.canDo),
      capabilities.length === 0 ? soft(row.agentCan) : cell(row.agentCan),
    ];
  });

  const acceptanceRows =
    acceptance.length === 0
      ? ['- [ ] （待填）']
      : acceptance.map((one) => `- [${one?.checked === true ? 'x' : ' '}] ${cell(one?.step)}`);

  return [
    '### 表 1 面板：他看什么、他能自己配什么',
    '',
    tableOf('这一格 | 一眼能得出什么结论 | 点一下可以去哪', panel.length === 0
      ? [['（待填）', PENDING, PENDING]]
      : panel.map((one) => [cell(one?.cell), cell(one?.conclusion), soft(one?.link)])),
    '',
    tableOf(
      '存不存（刷新还在吗） | 能自己配的 | 管什么 | 默认是什么 | 可选值从哪来 | 选错了会怎样',
      config.length === 0 ? [['（没有可配项）', '—', '—', '—', '—', '—']] : config.map((one) => [
        persistenceLabel(one?.persistence),
        cell(one?.key),
        cell(one?.watches),
        cell(one?.default),
        cell(one?.valuesFrom),
        cell(one?.wrongChoice),
      ]),
    ),
    '',
    '状态矩阵（每种状态：他看到什么 / 他能做什么 / agent 能接着做什么）——',
    '图号对着「卡片画哪五态」那一节：',
    '',
    tableOf('# | 状态 | 他看到什么 | 他能做什么 | agent 能接着做什么', stateRows),
    '',
    '### 表 2 agent：他能替用户做什么、哪几件要点头',
    '',
    tableOf(
      '能力 | 一句话 | 传什么 / 拿回什么（贴真实调用与返回） | 要点头吗 | 点头时他看到的"会发生什么"',
      capabilities.length === 0
        ? [['（这份模块故意没有能力）', '—', '—', '—', '—']]
        : capabilities.map((one) => [
            cell(one?.name),
            cell(one?.oneLine),
            cell(one?.shape),
            cell(one?.approval),
            soft(one?.approvalText),
          ]),
    ),
    '',
    '### 表 3 联动：agent 动完，这个模块哪一格变',
    '',
    tableOf('谁在动 | 面板什么时候变 | 哪一格变（投影 + 最窄那个参数） | 用户看到什么', linkage.length === 0
      ? [['（待填）', PENDING, PENDING, PENDING]]
      : linkage.map((one) => [cell(one?.who), cell(one?.when), cell(one?.whatChanges), cell(one?.userSees)])),
    '',
    '### 数据源探明记录',
    '',
    ...(reads.length <= 1
      ? [...datasourceRowsOf(reads[0]), '']
      : reads.flatMap((one, index) => [`#### 读 ${String(index + 1)}`, '', ...datasourceRowsOf(one), ''])),
    ...(writes.length === 0
      ? []
      : [
          '### 写通道探明记录',
          '',
          ...(writes.length <= 1
            ? [...writeRowsOf(writes[0]), '']
            : writes.flatMap((one, index) => [`#### 写 ${String(index + 1)}`, '', ...writeRowsOf(one), ''])),
        ]),
    '### 验收（自己在真卡片上逐条走通后打勾：`dsh-wb-module design accept`）',
    '',
    ...acceptanceRows,
    '',
    `> 这一段由 \`${DESIGN_FILE}\` 生成（\`dsh-wb-module design render\`），别手改。`,
  ].join('\n');
}

function bodyLinesOf(value) {
  if (Array.isArray(value)) {
    return value.flatMap((one) => {
      const line = text(one);
      return line === '' ? [] : [`- ${line}`];
    });
  }
  const line = text(value);
  return line === '' ? [] : [line];
}

function sectionOf(heading, value) {
  const lines = bodyLinesOf(value);
  return lines.length === 0 ? [] : [`## ${heading}`, '', ...lines, ''];
}

function shotsOf(source) {
  const listed = Array.isArray(source?.shots) ? source.shots : [];
  const single = text(source?.ascii) === '' ? [] : [{ caption: '', ascii: source.ascii }];
  return [...single, ...listed].flatMap((one) => {
    const drawing = typeof one?.ascii === 'string' ? one.ascii.replace(/\s+$/, '') : '';
    if (drawing.trim() === '') return [];
    return [{ caption: text(one?.caption), drawing }];
  });
}

export function renderUserReadme(source) {
  const title = text(source?.title) || '模块';
  const summary = text(source?.summary);
  const faq = asRows(source?.faq);
  const install = text(source?.install) === ''
    ? '在市场「已安装」里装或卸。装完在当前项目的面板里勾选这个模块，卡片才会出现；卸掉后卡片消失。'
    : source?.install;
  const shots = shotsOf(source);
  const shotsHeading = text(source?.shotsTitle) || '长这样';
  const shotLines = shots.length === 0
    ? []
    : [
        `## ${shotsHeading}`,
        '',
        ...shots.flatMap((one) => [
          ...(one.caption === '' ? [] : [`**${one.caption}**`, '']),
          '```text',
          one.drawing,
          '```',
          '',
        ]),
      ];
  const faqLines = faq.length === 0
    ? []
    : [
        '## 常见问题',
        '',
        ...faq.flatMap((one) => [`### ${text(one?.q)}`, '', text(one?.a), '']),
      ];

  return [
    `# ${title}`,
    '',
    summary,
    '',
    ...shotLines,
    ...sectionOf('你会看到什么', source?.see),
    ...sectionOf('你能做什么', source?.do),
    ...sectionOf('agent 能替你做什么', source?.agent),
    ...sectionOf('数据从哪来', source?.data),
    ...sectionOf('装和卸', install),
    ...sectionOf('出问题先看', source?.trouble),
    ...faqLines,
  ].join('\n');
}

export function readUserSource(root) {
  const file = join(root, README_SOURCE_FILE);
  if (!existsSync(file)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return typeof parsed === 'object' && parsed !== null ? parsed : undefined;
  } catch (error) {
    console.error(`✖ ${README_SOURCE_FILE} 不是合法 JSON：${error.message}`);
    process.exit(1);
  }
}

export function writeUserSource(root, value) {
  writeFileSync(join(root, README_SOURCE_FILE), `${JSON.stringify(value, null, 2)}\n`);
}

function manifestTitleOf(manifest) {
  const title = manifest?.dsh?.workbench?.title;
  if (typeof title === 'string' && title.trim() !== '') return title.trim();
  if (title !== null && typeof title === 'object') {
    const zh = text(title.zh);
    if (zh !== '') return zh;
    const en = text(title.en);
    if (en !== '') return en;
  }
  return text(manifest?.name);
}

export function userSourceSkeleton(manifest, design) {
  return {
    title: manifestTitleOf(manifest) || text(design?.name) || '模块',
    summary: text(design?.oneLine) || text(manifest?.description),
    shotsTitle: '',
    shots: [
      {
        caption: '（可选：图注，比如「卡片」「设置面」「审批」）',
        ascii: '（待填：一张卡片布局草图，用界面真实文案，按屏幕从上到下的顺序画）',
      },
    ],
    see: ['（待填：用户在卡片上看到的第一样东西）'],
    do: ['（待填：用户自己能点的一个按钮或能改的一项设置）'],
    agent: ['（待填：agent 能替用户做的一件事；写之前要不要批准）'],
    data: ['（待填：数据从哪来、用谁的登录、读还是写）'],
    install: '',
    trouble: ['（待填：出问题时用户看到什么、下一步点哪）'],
    faq: [],
  };
}

const USER_COPY_FIELDS = ['title', 'summary', 'see', 'do', 'agent', 'data', 'trouble'];
const USER_COPY_FORBIDDEN = [
  ['反引号 / 代码片段', /`/],
  ['代码块', /```/],
  ['源码路径', /\bsrc\//],
  ['设计底稿文件名', /\bdesign\.json\b/],
  ['文案底稿文件名', /\breadme\.json\b/],
  ['工具链命令', /\bdsh-wb-module\b/],
  ['运行时名', /\bopencli\b/],
  ['内部错误码', /\bauth-required\b|\bcli-[a-z-]+\b/],
  ['客户端实现名', /\bapproval\.render\b/],
  ['平台内部字段', /\bglobal_key\b/],
];

const BULLET_LIMIT = 70;

function copyTextsOf(value) {
  if (Array.isArray(value)) return value.map(text).filter((one) => one !== '');
  const one = text(value);
  return one === '' ? [] : [one];
}

export function userCopyProblemsOf(source) {
  const problems = [];
  if (source === undefined) return [`没有 ${README_SOURCE_FILE} —— 先跑 dsh-wb-module design init 或 design migrate`];
  for (const field of USER_COPY_FIELDS) {
    const values = copyTextsOf(source?.[field]);
    if (values.length === 0) problems.push(`${field} 是空的 —— README 的「${field}」还没有用户文案`);
    for (const value of values) {
      if (value.includes('（待填')) problems.push(`${field} 还留着「（待填）」`);
      if (Array.isArray(source?.[field]) && value.length > BULLET_LIMIT) {
        problems.push(`${field} 有一条 ${String(value.length)} 字 —— 超过 ${String(BULLET_LIMIT)} 字就拆成两条，或者把细节放进图里`);
      }
    }
  }
  const shots = asRows(source?.shots);
  if (shots.length === 0) problems.push('shots 是空的 —— 至少画一张卡片布局图');
  for (const [index, one] of shots.entries()) {
    if (text(one?.ascii).includes('（待填')) problems.push(`shots[${index}] 还留着「（待填）」`);
  }
  for (const field of ['title', 'summary', 'see', 'do', 'agent', 'data', 'install', 'trouble']) {
    for (const value of copyTextsOf(source?.[field])) {
      for (const [label, pattern] of USER_COPY_FORBIDDEN) {
        if (pattern.test(value)) problems.push(`${field} 里有${label} —— 这段只给终端用户看`);
      }
    }
  }
  for (const [index, one] of asRows(source?.faq).entries()) {
    if (text(one?.q) === '') problems.push(`faq[${index}].q 是空的`);
    if (text(one?.a) === '') problems.push(`faq[${index}].a 是空的`);
    for (const [label, pattern] of USER_COPY_FORBIDDEN) {
      if (pattern.test(text(one?.q)) || pattern.test(text(one?.a))) {
        problems.push(`faq[${index}] 里有${label} —— 这段只给终端用户看`);
      }
    }
  }
  return problems;
}

function regionOf(readme) {
  const start = readme.indexOf(START_MARK);
  const end = readme.indexOf(END_MARK);
  if (start === -1 || end === -1 || end < start) return undefined;
  return { start, end };
}

export function applyToDeveloping(root, markdown) {
  const file = join(root, DEVELOPING_FILE);
  const block = `${START_MARK}\n${markdown}\n${END_MARK}`;
  if (!existsSync(file)) {
    writeFileSync(file, `# ${text(manifestOf(root).name) || '模块'} · 作者文档\n\n${block}\n`);
    return 'created';
  }
  const text0 = readFileSync(file, 'utf8');
  const at = regionOf(text0);
  if (at !== undefined) {
    const next = `${text0.slice(0, at.start)}${block}${text0.slice(at.end + END_MARK.length)}`;
    if (next === text0) return 'same';
    writeFileSync(file, next);
    return 'updated';
  }
  const heading = text0.indexOf('## 需求底稿');
  const insertAt = (() => {
    if (heading === -1) return text0.length;
    const after = text0.indexOf('\n## ', heading + 1);
    return after === -1 ? text0.length : after + 1;
  })();
  const before = text0.slice(0, insertAt).replace(/\s*$/, '');
  const after = text0.slice(insertAt);
  writeFileSync(file, `${before}\n\n${block}\n${after === '' ? '' : `\n${after}`}`);
  return 'inserted';
}

export function writeUserReadme(root, source) {
  const file = join(root, 'README.md');
  const next = renderUserReadme(source);
  const before = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (before === next) return 'same';
  writeFileSync(file, next);
  return before === '' ? 'created' : 'updated';
}

function manifestOf(root) {
  try {
    return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  } catch {
    return {};
  }
}

function checkDesign(root) {
  const design = readDesign(root);
  if (design === undefined) {
    console.error(`✖ 没有 ${DESIGN_FILE} —— 先跑 dsh-wb-module design init`);
    process.exit(1);
  }
  const cells = emptyCells(design);
  const warnings = designWarningsOf(design);
  const rows = (key) => asRows(design[key]).length;
  const acceptance = asRows(design.acceptance);
  const accepted = acceptance.filter((one) => one?.checked === true).length;

  const developing = existsSync(join(root, DEVELOPING_FILE)) ? readFileSync(join(root, DEVELOPING_FILE), 'utf8') : '';
  const at = regionOf(developing);
  const fresh = at === undefined ? false : developing.slice(at.start, at.end) === `${START_MARK}\n${renderDesign(design)}\n`;
  const source = readUserSource(root);
  const copyProblems = userCopyProblemsOf(source);
  const user = existsSync(join(root, 'README.md')) ? readFileSync(join(root, 'README.md'), 'utf8') : '';
  const userFresh = source !== undefined && user === renderUserReadme(source);

  console.log(`design.json：面板 ${rows('panel')} 行 · 状态 ${STATE_KEYS.length} 态 · 配置 ${rows('config')} 项 · 能力 ${rows('capabilities')} 条 · 联动 ${rows('linkage')} 行 · 验收 ${accepted}/${acceptance.length}`);
  for (const one of warnings) console.log(`⚠ ${one}`);
  if (cells.length > 0) {
    console.error(`✖ 还空着 ${cells.length} 格（"空着的格就是还没定的事"，别带着空格往下做）：`);
    for (const one of cells) console.error(`  · ${one}`);
  }
  if (developing === '') {
    console.error(`✖ 没有 ${DEVELOPING_FILE} —— 旧模块先跑 dsh-wb-module design migrate；新模块跑 design init`);
  } else if (!fresh) {
    console.error(`✖ ${DEVELOPING_FILE} 里那一段落后于 design.json（或者没有标记）—— 跑 dsh-wb-module design render`);
  }
  if (copyProblems.length > 0) {
    console.error(`✖ ${README_SOURCE_FILE} 还不能生成终端用户 README：`);
    for (const one of copyProblems) console.error(`  · ${one}`);
  }
  if (!userFresh) {
    console.error(`✖ README.md 落后于 ${README_SOURCE_FILE}（或还没生成用户说明）—— 跑 dsh-wb-module design render`);
  }
  if (cells.length === 0 && fresh && copyProblems.length === 0 && userFresh) {
    console.log(`✔ 三张表填全了，README 与 ${DEVELOPING_FILE} 都是最新的${accepted === acceptance.length ? '，验收也打完了' : `；验收还差 ${acceptance.length - accepted} 条（自己在真卡片上逐条走通后跑 design accept）`}`);
  }
  process.exit(cells.length === 0 && fresh && copyProblems.length === 0 && userFresh ? 0 : 1);
}

export async function design({ root, args = [] }) {
  const action = args[0] ?? 'check';

  if (action === 'init') {
    if (existsSync(join(root, DESIGN_FILE))) {
      console.error(`✖ ${DESIGN_FILE} 已经在了；要重来先删掉它`);
      process.exit(1);
    }
    const manifest = manifestOf(root);
    const design0 = skeleton(manifest);
    writeDesign(root, design0);
    const source = readUserSource(root) ?? userSourceSkeleton(manifest, design0);
    writeUserSource(root, source);
    const how = applyToDeveloping(root, renderDesign(design0));
    writeUserReadme(root, source);
    console.log(`✔ 写好 ${DESIGN_FILE} 与 ${README_SOURCE_FILE}（工程底稿 + 用户文案骨架）`);
    console.log(`  ${DEVELOPING_FILE} 的那一段：${how === 'created' ? '新建' : how === 'inserted' ? '插进「需求底稿」那一节' : '已更新'}`);
    console.log('  接着把两边的空格填成"用户看得见的东西"，然后 dsh-wb-module design check');
    return;
  }

  if (action === 'render') {
    const design0 = readDesign(root);
    if (design0 === undefined) {
      console.error(`✖ 没有 ${DESIGN_FILE} —— 先跑 dsh-wb-module design init`);
      process.exit(1);
    }
    if (!existsSync(join(root, DEVELOPING_FILE))) {
      console.error(`✖ 没有 ${DEVELOPING_FILE} —— 旧模块先跑 dsh-wb-module design migrate；新模块跑 design init`);
      process.exit(1);
    }
    const source = readUserSource(root);
    if (source === undefined) {
      console.error(`✖ 没有 ${README_SOURCE_FILE} —— 旧模块先跑 dsh-wb-module design migrate；新模块跑 design init`);
      process.exit(1);
    }
    const how = applyToDeveloping(root, renderDesign(design0));
    const user = writeUserReadme(root, source);
    console.log(`✔ ${DEVELOPING_FILE} 的那一段：${how === 'same' ? '本来就是最新的' : how === 'updated' ? '更新了' : how === 'inserted' ? '插进「需求底稿」那一节' : '已更新'}`);
    console.log(`  README.md：${user === 'same' ? '本来就是最新的' : user === 'created' ? '新建' : '重生成'}`);
    return;
  }

  if (action === 'accept') {
    const design0 = readDesign(root);
    if (design0 === undefined) {
      console.error(`✖ 没有 ${DESIGN_FILE} —— 先跑 dsh-wb-module design init`);
      process.exit(1);
    }
    const acceptance = asRows(design0.acceptance);
    if (acceptance.length === 0) {
      console.error('✖ 验收清单是空的 —— 先写清"打开哪 → 看什么 → 点什么 → 应该看到什么"');
      process.exit(1);
    }
    design0.acceptance = acceptance.map((one) => ({ ...one, checked: true }));
    design0.acceptedAt = new Date().toISOString();
    writeDesign(root, design0);
    applyToDeveloping(root, renderDesign(design0));
    const source = readUserSource(root);
    if (source !== undefined) writeUserReadme(root, source);
    console.log(`✔ ${acceptance.length} 条验收全部打勾（只在真的在真卡片上逐条走通过之后再跑这条）`);
    return;
  }

  if (action === 'migrate') {
    const design0 = readDesign(root);
    if (design0 === undefined) {
      console.error(`✖ 没有 ${DESIGN_FILE} —— 先跑 dsh-wb-module design init`);
      process.exit(1);
    }
    if (existsSync(join(root, DEVELOPING_FILE))) {
      console.error(`✖ ${DEVELOPING_FILE} 已经在了；拆过的模块不用再 migrate`);
      process.exit(1);
    }
    const readmeFile = join(root, 'README.md');
    if (existsSync(readmeFile)) {
      copyFileSync(readmeFile, join(root, DEVELOPING_FILE));
      console.log(`✔ 旧 README 已保存为 ${DEVELOPING_FILE}`);
    }
    const source = readUserSource(root) ?? userSourceSkeleton(manifestOf(root), design0);
    writeUserSource(root, source);
    const how = applyToDeveloping(root, renderDesign(design0));
    const user = writeUserReadme(root, source);
    console.log(`✔ ${DEVELOPING_FILE} 的那一段：${how === 'same' ? '本来就是最新的' : how === 'updated' ? '更新了' : '已更新'}`);
    console.log(`✔ ${README_SOURCE_FILE} 与 README.md 已生成（${user === 'created' ? '新建' : '重生成'}）`);
    console.log(`  接着把 ${README_SOURCE_FILE} 里的（待填）按终端用户视角填完，再 dsh-wb-module design check`);
    return;
  }

  if (action === 'check') {
    checkDesign(root);
    return;
  }

  console.error(`不认识的 design 动作：${action}（可用：init / migrate / check / render / accept）`);
  process.exit(2);
}
