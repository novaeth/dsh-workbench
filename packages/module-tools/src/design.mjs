import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { callsProblemOf, describeRecipe, recipeProblemOf } from '@dsh-workbench/shared/host';

export const DESIGN_FILE = 'design.json';
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

function regionOf(readme) {
  const start = readme.indexOf(START_MARK);
  const end = readme.indexOf(END_MARK);
  if (start === -1 || end === -1 || end < start) return undefined;
  return { start, end };
}

export function applyToReadme(root, markdown) {
  const file = join(root, 'README.md');
  const block = `${START_MARK}\n${markdown}\n${END_MARK}`;
  if (!existsSync(file)) {
    writeFileSync(file, `# ${text(manifestOf(root).name) || '模块'}\n\n${block}\n`);
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

  const readme = existsSync(join(root, 'README.md')) ? readFileSync(join(root, 'README.md'), 'utf8') : '';
  const at = regionOf(readme);
  const fresh = at === undefined ? false : readme.slice(at.start, at.end) === `${START_MARK}\n${renderDesign(design)}\n`;

  console.log(`design.json：面板 ${rows('panel')} 行 · 状态 ${STATE_KEYS.length} 态 · 配置 ${rows('config')} 项 · 能力 ${rows('capabilities')} 条 · 联动 ${rows('linkage')} 行 · 验收 ${accepted}/${acceptance.length}`);
  for (const one of warnings) console.log(`⚠ ${one}`);
  if (cells.length > 0) {
    console.error(`✖ 还空着 ${cells.length} 格（"空着的格就是还没定的事"，别带着空格往下做）：`);
    for (const one of cells) console.error(`  · ${one}`);
  }
  if (!fresh) {
    console.error('✖ README 里那一段落后于 design.json（或者没有标记）—— 跑 dsh-wb-module design render');
  }
  if (cells.length === 0 && fresh) {
    console.log(`✔ 三张表填全了，README 也是最新的${accepted === acceptance.length ? '，验收也打完了' : `；验收还差 ${acceptance.length - accepted} 条（自己在真卡片上逐条走通后跑 design accept）`}`);
  }
  process.exit(cells.length === 0 && fresh ? 0 : 1);
}

export async function design({ root, args = [] }) {
  const action = args[0] ?? 'check';

  if (action === 'init') {
    if (existsSync(join(root, DESIGN_FILE))) {
      console.error(`✖ ${DESIGN_FILE} 已经在了；要重来先删掉它`);
      process.exit(1);
    }
    const design0 = skeleton(manifestOf(root));
    writeDesign(root, design0);
    const how = applyToReadme(root, renderDesign(design0));
    console.log(`✔ 写好 ${DESIGN_FILE}（三张表 + 状态矩阵 + 数据源记录 + 验收清单的空骨架）`);
    console.log(`  README 的那一段：${how === 'created' ? '新建' : how === 'inserted' ? '插进「需求底稿」那一节' : '已更新'}`);
    console.log('  接着把每一格填成"用户看得见的东西"，然后 dsh-wb-module design check');
    return;
  }

  if (action === 'render') {
    const design0 = readDesign(root);
    if (design0 === undefined) {
      console.error(`✖ 没有 ${DESIGN_FILE} —— 先跑 dsh-wb-module design init`);
      process.exit(1);
    }
    const how = applyToReadme(root, renderDesign(design0));
    console.log(`✔ README 的那一段：${how === 'same' ? '本来就是最新的' : how === 'updated' ? '更新了' : how === 'inserted' ? '插进「需求底稿」那一节' : '建了 README'}`);
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
    applyToReadme(root, renderDesign(design0));
    console.log(`✔ ${acceptance.length} 条验收全部打勾（只在真的在真卡片上逐条走通过之后再跑这条）`);
    return;
  }

  if (action === 'check') {
    checkDesign(root);
    return;
  }

  console.error(`不认识的 design 动作：${action}（可用：init / check / render / accept）`);
  process.exit(2);
}
