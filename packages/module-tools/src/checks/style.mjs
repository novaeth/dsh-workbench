import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DSW_PREFIX, dshHome, nearestTokens, readTokens } from '@dsh-workbench/shared/host';
import { shellRulesIn } from '../css-shell.mjs';
import { discoverModulePackages } from '../discover.mjs';
import { auditFontSizes, fontScaleNotes, fontScaleOf } from '../font-scale.mjs';

const BARE_ANCHOR = /(?<![\w$])(?:h\(\s*['"]a['"]|jsx\(\s*['"]a['"]|<a(?=[\s>/]))/g;

const BARE_CONTROLS = [
  { tag: 'button', what: '按钮', use: 'dsh 的 Button（variant / size），或 kit 的 SaveBar / BlockerState' },
  { tag: 'input', what: '单行输入', use: 'kit 的 TextField' },
  { tag: 'select', what: '下拉', use: 'kit 的 SelectField（搜索 / 分组 / 空态 / 加载态都自带）' },
];
const NATIVE_ONLY_INPUT = /type\s*[:=]\s*['"](?:hidden|file)['"]/;

const CONTROL_EXEMPT = new Set([]);

const FORM_LABEL_ELEMENT = /<(span|label|div)\b[^>]*className\s*=\s*(?:\{[^}]*\}|"[^"]*")[^>]*>/;
const LABEL_CLASS = /label/i;
const I18N_LABEL_KEY = /['"][^'"]*\.(?:field|label)(?:['".])/;
const FORM_CONTROL = /<(SelectField|TextField|ChoiceGroup|Input)\b/;
const FORM_LAYER = /<(FormRows?|Field)\b/;

const NOT_A_FORM = /card|list|item|issue|env|dot|sub|chip|badge|tag|tab|nav|menu/i;
const ZERO_LENGTH = /^(?:0|0px|0rem|0em|0%|none|auto)$/i;

const ACTION_AREA_CLASS = /wb-formActions/;

const BARE_FORM = /(?:h\(\s*['"]form['"]|jsx\(\s*['"]form['"]|<form(?=[\s>/]))/g;

const FORM_SLOT_CLASS = /(?<![-\w])(?:wb-formRows?(?![\w-])|wb-field(?![\w-]))/;

function isFormContainer(token) {
  return token.split(/(?=[A-Z])/).some((word) => /^(?:fields?|forms?)$/i.test(word))
    || /^(?:fields?|forms?)$/i.test(token);
}

function rowSpacingOf(property, value) {
  const prop = property.toLowerCase();
  const first = value.trim().split(/\s+/)[0] ?? '';
  if (prop === 'gap' || prop === 'row-gap') return ZERO_LENGTH.test(first) ? null : prop;
  if (prop === 'margin-top' || prop === 'margin-bottom' || prop === 'margin-block'
    || prop === 'margin-block-start' || prop === 'margin-block-end') {
    return ZERO_LENGTH.test(first) ? null : prop;
  }
  if (prop === 'margin') {
    const parts = value.trim().split(/\s+/);
    const vertical = [parts[0] ?? '', parts.length >= 3 ? (parts[2] ?? '') : (parts[0] ?? '')];
    return vertical.some((one) => !ZERO_LENGTH.test(one)) ? prop : null;
  }
  return null;
}

function selfManagedRowsIn(css) {
  const hits = [];
  for (const block of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = block[1].replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\s+/g, ' ').trim();
    const form = Array.from(selector.matchAll(/\.([A-Za-z][\w-]*)/g), (one) => one[1])
      .filter((token) => isFormContainer(token) && !NOT_A_FORM.test(token));
    if (form.length === 0) continue;

    const body = block[2].replace(/\/\*[\s\S]*?\*\//g, (one) => ' '.repeat(one.length));
    const bodyAt = block.index + block[1].length + 1;
    for (const decl of body.matchAll(/([-\w]+)\s*:\s*([^;]*)/g)) {
      const prop = rowSpacingOf(decl[1], decl[2]);
      if (prop === null) continue;
      hits.push({
        line: css.slice(0, bodyAt + decl.index).split('\n').length,
        selector: selector.slice(0, 60),
        prop,
        decl: `${decl[1]}: ${decl[2].trim()}`.slice(0, 60),
      });
    }
  }
  return hits;
}

function handwrittenRowsIn(text) {
  const lines = text.split('\n');
  const hits = [];
  const claimed = new Set();
  for (let at = 0; at < lines.length; at += 1) {
    const open = lines[at].match(FORM_LABEL_ELEMENT);
    if (open === null) continue;
    const tag = open[1];
    const named = (() => {
      const found = lines[at].match(/className\s*=\s*(?:\{([^}]*)\}|"([^"]*)")/);
      return LABEL_CLASS.test(found?.[1] ?? found?.[2] ?? '');
    })();
    const close = new RegExp(`</${tag}>`);
    let end = -1;
    let keyed = false;
    for (let scan = at; scan < Math.min(lines.length, at + 5); scan += 1) {
      if (I18N_LABEL_KEY.test(lines[scan])) keyed = true;
      if (close.test(lines[scan])) {
        end = scan;
        break;
      }
    }
    if (end < 0 || (!named && !keyed)) continue;
    for (let scan = end + 1; scan < Math.min(lines.length, end + 13); scan += 1) {
      if (FORM_LAYER.test(lines[scan])) break;
      const control = lines[scan].match(FORM_CONTROL);
      if (control === null) continue;
      if (!claimed.has(scan)) {
        claimed.add(scan);
        hits.push({ line: scan + 1, labelLine: at + 1, control: control[1] });
      }
      break;
    }
  }
  return hits;
}

const FORM_ROW_EXEMPT = new Map([]);

const FORM_ACTIONS_EXEMPT = new Map([]);

const FORM_EXEMPT = new Map([]);

const ANCHOR_EXEMPT = new Map([
  [
    '@dsh-workbench/module-demo-anchor-exempt:src/components/IssueRow.tsx',
    '自检探针：整行链形态的裸 `<a>`（只在这个临时探针包里出现）',
  ],
  [
    '@pagoda-dsh-workbench/module-argocd:src/components/views/EnvRows.tsx',
    '图标钮 / 按钮皮 / 整行链：外观与交互沿用既有视图，文字链已走 kit 的 Link',
  ],
  [
    '@pagoda-dsh-workbench/module-argocd:src/components/views/IdentityFields.tsx',
    '图标钮 / 按钮皮：登录入口沿用既有视图，文字链已走 kit 的 Link',
  ],
  [
    '@pagoda-dsh-workbench/module-coding-analysis:src/components/views/AnalysisBody.tsx',
    '图标钮：卡片角上的外链按钮，不是正文文字链',
  ],
  [
    '@pagoda-dsh-workbench/module-coding-analysis:src/components/views/AnalysisStates.tsx',
    '按钮皮的链：空态行动区，沿用既有视图',
  ],
  [
    '@pagoda-dsh-workbench/module-coding-analysis:src/components/views/EnvSettings.tsx',
    '按钮皮的链：设置区行动入口，沿用既有视图',
  ],
  [
    '@pagoda-dsh-workbench/module-coding-issues:src/components/IssueRow.tsx',
    '整行链：缺陷行整行可点，不是正文文字链',
  ],
]);

function bareControlsIn(text) {
  const hits = [];
  for (const one of BARE_CONTROLS) {
    const pattern = new RegExp(
      `(?:h\\(\\s*['"]${one.tag}['"]|jsx\\(\\s*['"]${one.tag}['"]|<${one.tag}(?=[\\s>/]))`,
      'g',
    );
    for (const match of text.matchAll(pattern)) {
      if (one.tag === 'input' && NATIVE_ONLY_INPUT.test(text.slice(match.index, match.index + 220))) continue;
      hits.push({ ...one, line: text.slice(0, match.index).split('\n').length });
    }
  }
  return hits;
}

function bareFormsIn(text) {
  return Array.from(text.matchAll(BARE_FORM), (match) => ({
    line: text.slice(0, match.index).split('\n').length,
  }));
}

function bareAnchorsIn(text) {
  BARE_ANCHOR.lastIndex = 0;
  return Array.from(text.matchAll(BARE_ANCHOR), (match) => ({
    line: text.slice(0, match.index).split('\n').length,
  }));
}

const CLASS_TOKEN = /(^|[^-\w])\.?(wb-[a-zA-Z0-9-]+)/g;

const SOURCE_BOARD = fileURLToPath(new URL('../../../core/src/shared/styles/board.css', import.meta.url));
const SOURCE_COMPONENTS = fileURLToPath(new URL('../../../shared/src/components', import.meta.url));
const INSTALLED_BOARD = join('node_modules', '@dsh-workbench', 'core', 'dist', 'board.css');
const INSTALLED_COMPONENTS = join('node_modules', '@dsh-workbench', 'shared', 'src', 'components');

const SOURCE_SHELL_SRC = fileURLToPath(new URL('../../../core/src', import.meta.url));
const SOURCE_SHARED_SRC = fileURLToPath(new URL('../../../shared/src', import.meta.url));
const SHELL_FONT_SCALE_FILES = [
  fileURLToPath(new URL('../../../core/src/shared/styles/tokens/scale.css', import.meta.url)),
  fileURLToPath(new URL('../../../core/src/shared/styles/tokens.css', import.meta.url)),
];
const FONT_DOC = '`@dsh-workbench/core` 的 `skills/workbench-module-diy/PANEL.md` §6「字号与重点」';

function packageNameOf(dir, fallback) {
  try {
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    return typeof manifest.name === 'string' ? manifest.name : fallback;
  } catch {
    return fallback;
  }
}

function fontRootsIn(modules) {
  const roots = [];
  for (const [dir, fallback] of [
    [SOURCE_SHELL_SRC, '@dsh-workbench/core'],
    [SOURCE_SHARED_SRC, '@dsh-workbench/shared'],
  ]) {
    if (existsSync(dir)) roots.push({ label: packageNameOf(join(dir, '..'), fallback), dir });
  }
  for (const pkg of modules) roots.push({ label: pkg.manifest.name, dir: pkg.dir });
  return roots;
}

function installedUnder(dir, tail) {
  let at = resolve(dir);
  for (;;) {
    const candidate = join(at, tail);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(at);
    if (parent === at) return undefined;
    at = parent;
  }
}

function cssFilesIn(dir) {
  try {
    return readdirSync(dir)
      .filter((name) => name.endsWith('.css'))
      .map((name) => join(dir, name));
  } catch {
    return [];
  }
}

function contractFilesFor(moduleDir) {
  const board = existsSync(SOURCE_BOARD) ? SOURCE_BOARD : installedUnder(moduleDir, INSTALLED_BOARD);
  const components = existsSync(SOURCE_COMPONENTS)
    ? SOURCE_COMPONENTS
    : installedUnder(moduleDir, INSTALLED_COMPONENTS);
  return [
    ...(board === undefined ? [] : [board]),
    ...(components === undefined ? [] : cssFilesIn(components)),
  ];
}

function contractOf(moduleDir) {
  const files = contractFilesFor(moduleDir);
  if (files.length === 0) return null;
  return new Set(
    files.flatMap((file) =>
      Array.from(readFileSync(file, 'utf8').matchAll(CLASS_TOKEN), (match) => match[2]),
    ),
  );
}

export const title = '样式归属';

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

function isTestSource(file) {
  return /(^|[\\/])__tests__[\\/]/.test(file) || /\.test\.[cm]?tsx?$/.test(file);
}

export async function run() {
  const problems = [];
  let tokenNote = null;
  const borrowed = [];
  const anchors = [];
  const controls = [];
  const rows = [];
  const actionAreas = [];
  const forms = [];

  const formRowHits = new Set();
  const actionAreaHits = new Set();
  const formHits = new Set();
  const anchorHits = new Set();
  const modules = discoverModulePackages({ root: process.cwd() });
  const contracts = new Map(modules.map((pkg) => [pkg.dir, contractOf(pkg.dir)]));
  if (modules.length > 0) {
    const searched = [
      process.cwd(),
      ...modules.map((pkg) => pkg.dir),
      join(dshHome(), 'profiles'),
      join(dshHome(), 'workbench', 'diy'),
    ];
    const tokens = readTokens(searched);
    const dswNames = (tokens.dsw?.entries ?? []).map((one) => one.name);
    const wbNames = (tokens.wb?.entries ?? []).map((one) => one.name);
    const known = new Set([...dswNames, ...wbNames]);
    const versionOf = (one, label) => (one === null ? `${label}没读到` : `${label} ${one.version ?? '版本未知'}`);
    const source = `${versionOf(tokens.dsw, 'dsh 主题')} + ${versionOf(tokens.wb, '外壳')}`;
    const hits = [];
    for (const pkg of modules) {
      for (const file of walk(pkg.dir)) {
        if (!/\.(css|ts|tsx)$/.test(file) || isTestSource(file)) continue;
        let text;
        try {
          text = readFileSync(file, 'utf8');
        } catch {
          continue;
        }
        text.split('\n').forEach((line, index) => {
          for (const match of line.matchAll(/var\(\s*(--(?:dsw|wb)-[a-z0-9-]+)/g)) {
            hits.push({ pkg: pkg.manifest.name, file: relative(pkg.dir, file), line: index + 1, name: match[1] });
          }
        });
      }
    }
    const checkable = (hit) => (hit.name.startsWith(DSW_PREFIX) ? tokens.dsw !== null : tokens.wb !== null);
    const checked = hits.filter(checkable);
    const unchecked = hits.length - checked.length;
    const unknown = checked.filter((hit) => !known.has(hit.name));
    for (const hit of unknown) {
      const pool = hit.name.startsWith(DSW_PREFIX) ? dswNames : wbNames;
      const near = nearestTokens(hit.name, pool);
      problems.push(
        `${hit.pkg}: ${hit.file}:${hit.line} 用了 ${hit.name}，令牌清单里没有它 —— ` +
          (near.length === 0 ? '清单里一个相近的也没有' : `近似的：${near.join(' / ')}`) +
          `（清单是现读的：${source}）`,
      );
    }
    tokenNote =
      hits.length === 0
        ? null
        : unknown.length > 0
          ? `${unknown.length} 处令牌名不在现读的清单里（${source}）${unchecked === 0 ? '' : `；另有 ${unchecked} 处没验（那一份没读到）`}`
          : unchecked > 0
            ? `令牌名验了 ${checked.length} 处，都在清单里（${source}）；另有 ${unchecked} 处没验（那一份没读到，找过 ${searched.join('、')}）`
            : `令牌名 ${hits.length} 处都在现读的清单里（${source}）`;
  }
  for (const pkg of modules) {
    const contract = contracts.get(pkg.dir);
    for (const file of walk(pkg.dir)) {
      if (!/\.(css|ts|tsx)$/.test(file)) continue;
      let text;
      try {
        text = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      const lines = text.split('\n');
      lines.forEach((line, index) => {
        for (const offender of shellRulesIn(line)) {
          problems.push(
            `${pkg.manifest.name}: ${relative(pkg.dir, file)}:${index + 1} 定义了外壳类的 CSS 规则 —— ` +
              `${offender}（这个复合选择器里没有模块自己的类：外壳的类谁渲染谁拥有，` +
              '要改就跟外壳那位主人说，别在后面覆盖它）',
          );
        }
      });

      if (/\.css$/.test(file)) {
        const key = `${pkg.manifest.name}:${relative(pkg.dir, file)}`;
        const exemptRows = FORM_ROW_EXEMPT.has(key);
        for (const hit of selfManagedRowsIn(text)) {
          formRowHits.add(key);
          if (exemptRows) continue;
          rows.push(
            `${pkg.manifest.name}: ${relative(pkg.dir, file)}:${hit.line} 模块自己管了行距（${hit.selector} 的 ${hit.decl}）—— ` +
              `行距归 FormRow(s)（行距只有这一档，模块不许自己写）：` +
              `${(lines[hit.line - 1] ?? '').trim().slice(0, 80)}`,
          );
        }
      }

      if (isTestSource(file)) continue;
      if (!/\.tsx?$/.test(file)) continue;
      const exemptControls = CONTROL_EXEMPT.has(`${pkg.manifest.name}:${relative(pkg.dir, file)}`);
      const anchorKey = `${pkg.manifest.name}:${relative(pkg.dir, file)}`;
      const exemptAnchors = ANCHOR_EXEMPT.has(anchorKey);
      for (const hit of bareAnchorsIn(text)) {
        anchorHits.add(anchorKey);
        if (exemptAnchors) continue;
        anchors.push(
          `${pkg.manifest.name}: ${relative(pkg.dir, file)}:${hit.line} 手写了裸 <a> —— ` +
            `正文里的文字链一律用 kit 的 Link（新窗口、noopener、自带那个外链小箭头；样式只有这一份）：` +
            `${(lines[hit.line - 1] ?? '').trim().slice(0, 80)}`,
        );
      }
      if (!exemptControls) {
        for (const hit of bareControlsIn(text)) {
          controls.push(
            `${pkg.manifest.name}: ${relative(pkg.dir, file)}:${hit.line} 手写了裸 <${hit.tag}>（${hit.what}）—— ` +
              `用 ${hit.use}（手写的拿到的是浏览器默认样式：悬停、禁用、焦点环、色板都得自己抄，还不跟主题）：` +
              `${(lines[hit.line - 1] ?? '').trim().slice(0, 80)}`,
          );
        }
      }
      if (/\.tsx$/.test(file)) {
        const key = `${pkg.manifest.name}:${relative(pkg.dir, file)}`;
        const exemptRows = FORM_ROW_EXEMPT.has(key);
        for (const hit of handwrittenRowsIn(text)) {
          formRowHits.add(key);
          if (exemptRows) continue;
          rows.push(
            `${pkg.manifest.name}: ${relative(pkg.dir, file)}:${hit.line} 手写的「标签 + 控件」行（标签在 ${hit.labelLine} 行，控件是 ${hit.control}）—— ` +
              `用 FormRow：标签归它（面 → 行 → 控件，中间那层归 FormRow(s)）：` +
              `${(lines[hit.line - 1] ?? '').trim().slice(0, 80)}`,
          );
        }
      }
      const actionKey = `${pkg.manifest.name}:${relative(pkg.dir, file)}`;
      const exemptActions = FORM_ACTIONS_EXEMPT.has(actionKey);
      lines.forEach((line, index) => {
        if (!ACTION_AREA_CLASS.test(line)) return;
        actionAreaHits.add(actionKey);
        if (exemptActions) return;
        actionAreas.push(
          `${pkg.manifest.name}: ${relative(pkg.dir, file)}:${index + 1} 手写了操作区（借了外壳的槽类 wb-formActions）—— ` +
            `用 kit 的 FormActions（主操作在右、一个区一颗 primary、danger 紧挨它左侧且有二次确认、` +
            '间距与窄容器换行都归它）：' +
            `${line.trim().slice(0, 80)}`,
        );
      });
      const formKey = `${pkg.manifest.name}:${relative(pkg.dir, file)}`;
      const exemptForms = FORM_EXEMPT.has(formKey);
      for (const hit of bareFormsIn(text)) {
        formHits.add(formKey);
        if (exemptForms) continue;
        forms.push(
          `${pkg.manifest.name}: ${relative(pkg.dir, file)}:${hit.line} 手写了裸 <form> —— ` +
            '改用 kit 的 Form（fields 进、其余全归它：行的排布 / 校验时机 / 错误摆哪 / 提交怎么被挡住 / ' +
            '第一处错误怎么找 / 操作区怎么排）：' +
            `${(lines[hit.line - 1] ?? '').trim().slice(0, 80)}`,
        );
      }
      lines.forEach((line, index) => {
        const slot = line.match(FORM_SLOT_CLASS);
        if (slot === null) return;
        formHits.add(formKey);
        if (exemptForms) return;
        forms.push(
          `${pkg.manifest.name}: ${relative(pkg.dir, file)}:${index + 1} 手写了表单的行（借了外壳的槽类 ${slot[0]}）—— ` +
            '改用 kit 的 Form（面 → 行 → 控件：标签 + 控件这一行归 FormRow(s)，整张表单的面归 Form）：' +
            `${line.trim().slice(0, 80)}`,
        );
      });
      if (contract === null) continue;
      lines.forEach((line, index) => {
        for (const match of line.matchAll(CLASS_TOKEN)) {
          const name = match[2];
          if (line[match.index + match[0].indexOf(name) - 1] === '-') continue;
          if (name.endsWith('-')) continue;
          if (contract.has(name)) continue;
          borrowed.push(
            `${pkg.manifest.name}: ${relative(pkg.dir, file)}:${index + 1} 借用了 ${name}，契约里没有它 —— ${line.trim().slice(0, 100)}`,
          );
        }
      });
    }
  }

  const bindings = [];
  for (const pkg of modules) {
    const defined = new Map();
    for (const file of walk(pkg.dir)) {
      if (!/\.module\.css$/.test(file)) continue;
      const text = readFileSync(file, 'utf8').replace(/:global\([^)]*\)/g, '');
      defined.set(file, new Set(Array.from(text.matchAll(/\.([A-Za-z][\w-]*)/g), (m) => m[1])));
    }
    for (const file of walk(pkg.dir)) {
      if (!/\.tsx?$/.test(file) || isTestSource(file)) continue;
      const text = readFileSync(file, 'utf8');
      for (const hit of text.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from\s+'([^']*\.module\.css)'/g)) {
        const bind = hit[1];
        const names = defined.get(resolve(dirname(file), hit[2]));
        if (names === undefined) continue;
        for (const use of text.matchAll(new RegExp(`\\b${bind}\\.([A-Za-z_$][\\w$]*)`, 'g'))) {
          if (names.has(use[1])) continue;
          bindings.push(
            `${pkg.manifest.name}: ${relative(pkg.dir, file)} 用了 ${bind}.${use[1]}，` +
              `${relative(pkg.dir, resolve(dirname(file), hit[2]))} 里没有这个类`,
          );
        }
      }
    }
  }

  const present = new Set(modules.map((pkg) => pkg.manifest.name));
  const staleRows = [];
  for (const [key, reason] of FORM_ROW_EXEMPT) {
    const owner = key.slice(0, key.indexOf(':'));
    if (!present.has(owner) || formRowHits.has(key)) continue;
    staleRows.push(
      `${key} 还在 FORM_ROW_EXEMPT 里，但一处都不再命中 —— 按棘轮删掉这一行（原由：${reason}）`,
    );
  }
  const staleActionRows = [];
  for (const [key, reason] of FORM_ACTIONS_EXEMPT) {
    const owner = key.slice(0, key.indexOf(':'));
    if (!present.has(owner) || actionAreaHits.has(key)) continue;
    staleActionRows.push(
      `${key} 还在 FORM_ACTIONS_EXEMPT 里，但一处都不再命中 —— 按棘轮删掉这一行（原由：${reason}）`,
    );
  }
  const staleFormRows = [];
  for (const [key, reason] of FORM_EXEMPT) {
    const owner = key.slice(0, key.indexOf(':'));
    if (!present.has(owner) || formHits.has(key)) continue;
    staleFormRows.push(
      `${key} 还在 FORM_EXEMPT 里，但一处都不再命中 —— 按棘轮删掉这一行（原由：${reason}）`,
    );
  }
  const staleAnchorRows = [];
  for (const [key, reason] of ANCHOR_EXEMPT) {
    const owner = key.slice(0, key.indexOf(':'));
    if (!present.has(owner) || anchorHits.has(key)) continue;
    staleAnchorRows.push(
      `${key} 还在 ANCHOR_EXEMPT 里，但一处都不再命中 —— 按棘轮删掉这一行（原由：${reason}）`,
    );
  }

  if (bindings.length + problems.length + borrowed.length + anchors.length + controls.length
    + rows.length + actionAreas.length + forms.length + staleRows.length + staleActionRows.length
    + staleFormRows.length + staleAnchorRows.length > 0) {
    const notes = [];
    if (tokenNote !== null) notes.push(tokenNote);
    if (bindings.length > 0) {
      notes.push(
        `${bindings.length} 处是「样式绑定指向了 CSS 里不存在的类」：（CSS Modules 的哈希类名靠"同一份文件、同一个导出"配对：` +
          '调用点拿到的会是 undefined，真机上渲染成 class="undefined" —— 元素整片没样式，而且控制台一声不响）',
      );
    }
    if (problems.length > 0) {
      notes.push(
        `${problems.length} 处是「模块不许定义外壳类（wb-*）的 CSS 规则」：（wb-* 是外壳的命名空间：` +
          '两份同名规则按注入顺序互相覆盖，用户看到的是随机的那个。判据看**复合选择器** —— ' +
          '`:global(.wb-x)` 与 `.row :global(.wb-x)` 都算，只有同一个复合选择器里带了模块自己的类才放行）',
      );
    }
    if (borrowed.length > 0) {
      notes.push(
        `${borrowed.length} 处是「模块借用了契约里没有的 wb-* 类」：模块只许借外壳出货的 board.css 里有的类。` +
          '没有的那个要么是拼错/改了名漏改，要么本该进 board.css —— 空类名在真机上就是没样式，而且没人会报错。' +
          '名单是**外壳出货的那份**（`@dsh-workbench/core/dist/board.css` + 外壳组件自己的样式表）',
      );
    }
    if (anchors.length > 0) {
      notes.push(
        `${anchors.length} 处是「手写了裸 <a>」：（**正文里的文字链**用 kit 的 Link —— 样式只有一份，` +
          '改一处全局一致；裸 <a> 拿到的是浏览器默认样式，看着和卡片其它地方不是一套。' +
          '三种不算"绕过"的形态 —— 图标链 / 按钮皮的链 / 整行链 —— 逐文件收在 `ANCHOR_EXEMPT` 里，' +
          '口径见 style.mjs 里 `BARE_ANCHOR` 那一段注释与 README 的 `style` 那一行）',
      );
    }
    if (controls.length > 0) {
      notes.push(
        `${controls.length} 处是「手写了裸 <button>/<input>/<select>」：（kit 与 dsh 原语里都有对应形态 —— ` +
          'Button / TextField / SelectField / ChoiceGroup；手写的那份拿到浏览器默认样式，' +
          '悬停、禁用、焦点环、字号都得自己抄一遍，还不跟主题。只有多行输入 <textarea> 与 ' +
          '`type="hidden"` / `type="file"` 例外：那两种形态两处都没有）',
      );
    }
    if (rows.length > 0) {
      notes.push(
        `${rows.length} 处是「手写的标签+控件行 或 模块自己管的行距」：（面 → 行 → 控件，` +
          '中间那层归 `FormRow(s)`。行里自己写 `<span className=…label>` 配 `SelectField` / `TextField` / ' +
          '`ChoiceGroup` / `Input`、或给 field/form 容器设 `gap` / 上下 `margin`，就是这一层没有主人的信号 —— ' +
          '换 `<FormRow label={…}>{控件}</FormRow>`，行距一起归它。窄口径与已知漏报见 style.mjs 里那两段注释）',
      );
    }
    if (actionAreas.length > 0) {
      notes.push(
        `${actionAreas.length} 处是「手写了操作区（借了外壳的槽类 wb-formActions）」：（` +
          '操作区那一层归 `FormActions` —— 顺序（主操作在右、danger 紧挨它左侧）、一个区一颗 `primary`、' +
          '间距、窄容器换行都由组件定；调用点只给"有哪些动作、哪个是主要、点了做什么"。' +
          '`wb-formActions` 这个槽类只为操作区存在，出现它就是自己摆了一套：换 `<FormActions actions={…} />`。' +
          '窄口径与已知漏报见 style.mjs 里那一段注释）',
      );
    }
    if (forms.length > 0) {
      notes.push(
        `${forms.length} 处是「手写了整张表单（裸 <form> 元素，或借了外壳的槽类 wb-formRow / wb-formRows / wb-field）」：（` +
          '表单那一层归 `Form` —— fields 进、其余全归它：行的排布、校验的时机（还没提交过时一格错都不显示）、' +
          '错误摆哪、提交怎么被挡住、第一处错误怎么带进视口、操作区怎么排都由组件定，调用点只给数据与语义。' +
          '`wb-formRow` / `wb-formRows` / `wb-field` 这三个槽类只为"行 / 字段"这一层存在，出现它们就是自己摆了一套：' +
          '改用 kit 的 `Form`（`<Form fields={…} onSubmit={…} submit={…} />`）。' +
          '窄口径与已知漏报见 style.mjs 里那一段注释）',
      );
    }
    if (staleRows.length > 0) {
      notes.push(
        `${staleRows.length} 条 FORM_ROW_EXEMPT 已经不命中了：（棘轮：迁完一处删一行 —— ` +
          '一个包迁完 FormRow 之后，它那几行豁免要跟着删，别留着让表长起来）',
      );
    }
    if (staleActionRows.length > 0) {
      notes.push(
        `${staleActionRows.length} 条 FORM_ACTIONS_EXEMPT 已经不命中了：（棘轮：迁完一处删一行 —— ` +
          '一个包迁完 FormActions 之后，它那几行豁免要跟着删，别留着让表长起来）',
      );
    }
    if (staleFormRows.length > 0) {
      notes.push(
        `${staleFormRows.length} 条 FORM_EXEMPT 已经不命中了：（棘轮：迁完一处删一行 —— ` +
          '一个包迁完 Form 之后，它那几行豁免要跟着删，别留着让表长起来）',
      );
    }
    if (staleAnchorRows.length > 0) {
      notes.push(
        `${staleAnchorRows.length} 条 ANCHOR_EXEMPT 已经不命中了：（棘轮：迁完一处删一行 —— ` +
          '一个文件里的裸 <a> 都迁成 Link（或那个文件没了）之后，它那一行豁免要跟着删，别留着让表长起来）',
      );
    }

    return {
      status: 'fail',
      notes,
      problems: [
        ...bindings,
        ...problems,
        ...borrowed,
        ...anchors,
        ...controls,
        ...rows,
        ...actionAreas,
        ...forms,
        ...staleRows,
        ...staleActionRows,
        ...staleFormRows,
        ...staleAnchorRows,
      ],
    };
  }

  if (modules.length === 0) {
    return {
      status: 'skip',
      notes: ['没有模块包（没有声明 dsh.workbench 的包）—— 没有样式要查归属'],
      problems: [],
    };
  }

  const noContract = modules
    .filter((pkg) => contracts.get(pkg.dir) === null)
    .map((pkg) => pkg.manifest.name);
  if (noContract.length === modules.length) {
    return {
      status: 'skip',
      notes: [
        '找不到外壳出货的那份契约（`@dsh-workbench/core/dist/board.css` 与 `@dsh-workbench/shared` 的组件样式表都不在）' +
          '—— 模块借的 wb-* 类这一项这次一条都没查，不是"没问题"',
        ...(tokenNote === null ? [] : [tokenNote]),
      ],
      problems: [],
    };
  }
  const contractNote =
    noContract.length === 0
      ? '借用的类都在契约里（外壳出货的 board.css + 外壳组件自己的样式表）'
      : `${noContract.join(' / ')} 那一边找不到外壳的契约，借用这一项没查`;
  const exemptNote =
    formRowHits.size === 0
      ? '没有手写的「标签+控件」行，也没有模块自己管的行距'
      : `表单「行」这一层还有 ${formRowHits.size} 个文件在 FORM_ROW_EXEMPT 里等外壳发版后迁（棘轮：迁一处删一行）`;
  const actionNote =
    actionAreaHits.size === 0
      ? '没有手写的操作区'
      : `操作区这一层还有 ${actionAreaHits.size} 个文件在 FORM_ACTIONS_EXEMPT 里等外壳发版后迁（棘轮：迁一处删一行）`;
  const formNote =
    formHits.size === 0
      ? '没有手写的整张表单（没有裸 <form>，也没有借表单槽类手摆行）'
      : `表单这一层还有 ${formHits.size} 个文件在 FORM_EXEMPT 里等外壳发版后迁（棘轮：迁一处删一行）`;

  const fontScale = fontScaleOf(SHELL_FONT_SCALE_FILES);
  const fontNotes = fontScaleNotes(
    auditFontSizes({ roots: fontRootsIn(modules), scale: fontScale }),
    fontScale,
    { doc: FONT_DOC },
  );
  return {
    status: 'pass',
    notes: [
      `${modules.length} 个模块都没有定义外壳前缀（wb-*）的 CSS 规则；${contractNote}；${exemptNote}；${actionNote}；${formNote}`,
      ...(tokenNote === null ? [] : [tokenNote]),
      ...fontNotes,
    ],
    problems: [],
  };
}
