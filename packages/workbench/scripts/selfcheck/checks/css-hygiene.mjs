import { existsSync, readdirSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import {
  allSourceCss,
  allowsJsDoc,
  commentViolationsOf,
  pkg,
  publicSurfaceFiles,
  read,
  REPO,
  SHARED_SRC,
  SRC,
  walkCode,
} from '../lib.mjs';

const injectedCss = (injectedStyles) => injectedStyles.map((el) => el.textContent ?? '').join('\n');

const allFilesUnder = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? allFilesUnder(full) : [full];
  });

const tsxFilesUnder = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === '__tests__') return [];
    const full = join(dir, entry.name);
    return entry.isDirectory() ? tsxFilesUnder(full) : full.endsWith('.tsx') ? [full] : [];
  });

const srcTsFiles = (dir, out = []) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__') srcTsFiles(join(dir, entry.name), out);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
    out.push(join(dir, entry.name));
  }
  return out;
};

const cssFilesIn = (dir) => {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? cssFilesIn(full) : entry.name.endsWith('.css') ? [full] : [];
  });
};
const shellSheets = () => [...cssFilesIn(pkg('src/shared/styles')), ...cssFilesIn(join(SHARED_SRC, 'components'))];

const wbHooksIn = (source) => [...new Set(source.match(/\[data-wb-[a-z0-9-]+\]/g) ?? [])];

const HAND_ROLLED_BUTTONS = [
  'wb-primaryButton',
  'wb-linkButton',
  'wb-outlineButton',
  'wb-marketAction',
  'wb-marketActionPrimary',
  'wb-marketActionDanger',
  'wb-addModuleRun',
  'wb-addModuleRunGhost',
  'wb-switch',
  'wb-switchKnob',
];

const OWN_ICONS = new Set([
  'IconBrandMark',
  'IconModuleMark',
  'IconModules',
  'IconNpm',
  'IconOpencli',
  'IconPanelScreen',
  'IconConversation',
]);

const sharedImportsOf = (text) =>
  [...text.matchAll(/import \{([^}]*)\} from '@dsh-workbench\/shared';/g)].flatMap((match) =>
    match[1].split(',').map((name) => name.trim()),
  );

const readAllUnder = (dir, pick, out = []) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) readAllUnder(full, pick, out);
    else if (pick(entry.name)) out.push(full);
  }
  return out;
};

const tokenLedger = () => {
  const packagesDir = join(REPO, 'packages');
  const tokenFiles = [
    pkg('src/shared/styles/tokens.css'),
    ...readAllUnder(pkg('src/shared/styles/tokens'), (n) => n.endsWith('.css')),
  ];
  const defined = new Set();
  for (const file of tokenFiles) {
    for (const hit of read(file).matchAll(/(--wb-[a-z0-9-]+)\s*:/g)) defined.add(hit[1]);
  }
  const used = new Set();
  const unresolved = [];
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const srcDir = join(packagesDir, entry.name, 'src');
    if (!existsSync(srcDir)) continue;
    for (const file of readAllUnder(srcDir, (n) => /\.(css|ts|tsx)$/.test(n))) {
      const text = read(file);
      for (const hit of text.matchAll(/var\(\s*(--wb-[a-z0-9-]+)/g)) used.add(hit[1]);

      if (tokenFiles.includes(file)) continue;
      for (const hit of text.matchAll(/var\(\s*(--wb-[a-z0-9-]+)/g)) {
        if (!defined.has(hit[1])) unresolved.push(`${relative(REPO, file)}:${hit[1]}`);
      }
    }
  }
  return { defined, used, unresolved };
};

export const checks = [
  {
    title: '注入的样式花括号配平（CSS 语法没有别的守卫）',
    run(ctx, report) {

      const { injectedStyles } = ctx;
      const css = injectedCss(injectedStyles);
      const opens = (css.match(/\{/g) ?? []).length;
      const closes = (css.match(/\}/g) ?? []).length;
      report('注入的样式花括号配平（CSS 语法没有别的守卫）', opens === closes, `${opens} 开 / ${closes} 闭`);
    },
  },
  {
    title: '★ 样式里的 --wb-* 变量都用前定义过（用了没定义 = 整条声明失效）',
    run(ctx, report) {
      const { injectedStyles } = ctx;
      const css = injectedCss(injectedStyles);

      const definedVars = new Set([...css.matchAll(/(--wb-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
      const usedVars = new Set([...css.matchAll(/var\(\s*(--wb-[a-z0-9-]+)\s*\)/g)].map((m) => m[1]));
      const undefinedVars = [...usedVars].filter((name) => !definedVars.has(name));
      report(
        '★ 样式里的 --wb-* 变量都用前定义过（用了没定义 = 整条声明失效）',
        undefinedVars.length === 0,
        undefinedVars.join('、'),
      );
    },
  },
  {
    title: '★ 外壳全局样式表里每个类都有组件拥有它（新词汇落进组件样式表，§18.44）',
    run(_ctx, report) {
      const roots = [SRC, SHARED_SRC].filter((dir) => existsSync(dir));
      const files = roots
        .flatMap(allFilesUnder)
        .filter((file) => /\.(tsx|ts)$/.test(file) && !file.includes('__tests__'));
      const rendered = new Set();
      const namesOf = new Map();
      for (const sheet of ['board.css', 'sidebar.css', 'sidebar-app.css']) {
        const board = read(pkg(`src/shared/styles/${sheet}`));
        namesOf.set(
          sheet,
          [...new Set([...board.matchAll(/\.(wb-[A-Za-z][A-Za-z0-9]*)/g)].map((match) => match[1]))],
        );
      }
      for (const file of files) {
        const text = read(file);

        for (const names of namesOf.values()) {
          for (const name of names) {
            if (new RegExp(`(?<![A-Za-z0-9-])${name}(?![A-Za-z0-9])`).test(text)) rendered.add(name);
          }
        }
      }
      const unowned = [...namesOf].flatMap(([sheet, names]) =>
        names.filter((name) => !rendered.has(name)).map((name) => `${sheet}:${name}`),
      );
      report(
        '★ 外壳全局样式表里每个类都有组件拥有它（新词汇落进组件样式表，§18.44）',
        unowned.length === 0,
        unowned.length === 0
          ? `${[...namesOf.values()].flat().length} 个类都有组件在渲染`
          : `没人拥有：${unowned.join('、')}`,
      );
    },
  },
  {
    title: '★ 全局样式表只许减不许增（rightbar / sidebar / sidebar-app 的顶层规则块数，ADR-0029）',
    run(_ctx, report) {

      const countBlocks = (file) => {
        const text = existsSync(file) ? read(file) : '';
        let at = 0;
        let blocks = 0;
        while (true) {
          const open = text.indexOf('{', at);
          if (open < 0) break;
          let depth = 1;
          let end = open + 1;
          while (depth > 0 && end < text.length) {
            if (text[end] === '{') depth += 1;
            else if (text[end] === '}') depth -= 1;
            end += 1;
          }
          blocks += 1;
          at = end;
        }
        return blocks;
      };
      const CEILING = [
        ['rightbar.css', 10],
        ['sidebar.css', 48],
        ['sidebar-app.css', 43],
      ];
      const over = CEILING.map(([name, limit]) => [name, countBlocks(pkg(`src/shared/styles/${name}`)), limit]).filter(
        ([, blocks, limit]) => blocks > limit,
      );
      report(
        '★ 全局样式表只许减不许增（rightbar / sidebar / sidebar-app 的顶层规则块数，ADR-0029）',
        over.length === 0,
        over.length === 0
          ? CEILING.map(([name, limit]) => `${name} ${countBlocks(pkg(`src/shared/styles/${name}`))}/${limit}`).join(' · ')
          : over.map(([name, blocks, limit]) => `${name} 涨到 ${blocks}（上限 ${limit}）`).join(' · '),
      );
    },
  },
  {
    title: '★ 组件样式（*.module.css）进了注入的那份样式（占位串已替换、哈希类名在）',
    run(ctx, report) {

      const { injectedStyles } = ctx;
      const countModuleCss = (dir) =>
        readdirSync(dir, { withFileTypes: true }).reduce((total, entry) => {
          const full = `${dir}/${entry.name}`;
          if (entry.isDirectory()) return total + (entry.name === 'node_modules' ? 0 : countModuleCss(full));
          return total + (entry.name.endsWith('.module.css') ? 1 : 0);
        }, 0);
      const moduleCssCount = existsSync(SRC) ? countModuleCss(SRC) : 0;
      const css = injectedCss(injectedStyles);
      const leftOver = css.includes('@@WB_MODULE_CSS@@');
      const hashedRule = /\.[a-z0-9_-]+_[a-z0-9]+_\d+\s*[,{]/.test(css);
      report(
        '★ 组件样式（*.module.css）进了注入的那份样式（占位串已替换、哈希类名在）',
        !leftOver && (moduleCssCount === 0 || hashedRule),
        leftOver ? '占位串还在样式里' : `${moduleCssCount} 份组件样式`,
      );
    },
  },
  {
    title: '★ CSS Modules 的类名都对得上（styles.X 在它 import 的 *.module.css 里有定义）',
    run(_ctx, report) {

      const missing = [];
      for (const file of tsxFilesUnder(SRC)) {
        const text = read(file);
        const imported = /import\s+styles\s+from\s+'([^']+\.module\.css)'/.exec(text);
        if (imported === null) continue;
        const cssPath = resolve(dirname(file), imported[1]);
        const defined = existsSync(cssPath) ? read(cssPath) : '';
        for (const used of new Set([...text.matchAll(/styles\.([a-zA-Z][a-zA-Z0-9]*)/g)].map((m) => m[1]))) {
          if (!new RegExp(`\\.${used}(?![a-zA-Z0-9])`).test(defined)) missing.push(`${basename(file)}:${used}`);
        }
      }
      report(
        '★ CSS Modules 的类名都对得上（styles.X 在它 import 的 *.module.css 里有定义）',
        missing.length === 0,
        missing.slice(0, 6).join('、'),
      );
    },
  },
  {
    title: '★ 全局类名都对得上（className 里的 wb-* 在那份注入的样式里有定义）',
    run(ctx, report) {

      const { injectedStyles } = ctx;
      const allCss = injectedCss(injectedStyles);
      const defined = new Set([...allCss.matchAll(/\.(wb-[a-z0-9-]+)/g)].map((m) => m[1]));
      const missing = [];
      for (const file of tsxFilesUnder(SRC)) {
        const text = read(file);
        const usage = /className=(?:"([^"]*)"|\{`([^`]*)`\})/g;
        for (const hit of text.matchAll(usage)) {
          const names = (hit[1] ?? hit[2] ?? '')
            .split(' ')
            .map((part) => part.trim())
            .filter((part) => /^wb-[a-z0-9-]+$/.test(part));
          for (const name of names) if (!defined.has(name)) missing.push(`${basename(file)}:${name}`);
        }
      }
      report(
        '★ 全局类名都对得上（className 里的 wb-* 在那份注入的样式里有定义）',
        missing.length === 0,
        [...new Set(missing)].slice(0, 6).join('、'),
      );
    },
  },
  {
    title: '★ 组件样式里的动画名都在同一份 .module.css 里定义（借全局 @keyframes = 静默不转）',
    run(_ctx, report) {

      const KEYWORDS = new Set([
        'none', 'linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'infinite', 'alternate',
        'alternate-reverse', 'reverse', 'normal', 'forwards', 'backwards', 'both', 'running', 'paused',
        'step-start', 'step-end', 'initial', 'inherit', 'unset', 'revert', 'important',
      ]);
      const missing = [];
      const walk = (dir) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (entry.name === 'node_modules') continue;
          const full = join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(full);
            continue;
          }
          if (!entry.name.endsWith('.module.css')) continue;

          const text = read(full).replace(/\/\*[\s\S]*?\*\//g, '');
          const defined = new Set([...text.matchAll(/@keyframes\s+([A-Za-z_][\w-]*)/g)].map((m) => m[1]));
          for (const decl of text.matchAll(/animation(?:-name)?\s*:\s*([^;}]+)/g)) {
            const used = decl[1]
              .split(/\s+/)
              .map((part) => part.trim())
              .filter((part) => part !== '')
              .filter((part) => /^[A-Za-z_][\w-]*$/.test(part))
              .filter((part) => !KEYWORDS.has(part));
            for (const name of used) if (!defined.has(name)) missing.push(`${basename(full)}:${name}`);
          }
        }
      };
      walk(SRC);
      report(
        '★ 组件样式里的动画名都在同一份 .module.css 里定义（借全局 @keyframes = 静默不转）',
        missing.length === 0,
        [...new Set(missing)].slice(0, 6).join('、'),
      );
    },
  },
  {
    title: '★ 全仓代码零注释（只有公开入口成员的 JSDoc 与指令例外；CSS 一格都不许）',
    run(_ctx, report) {
      const bad = [];
      for (const file of walkCode()) {
        const rel = relative(REPO, file).split('\\').join('/');
        for (const line of commentViolationsOf(read(file), {
          css: file.endsWith('.css'),
          allowJsDoc: allowsJsDoc(rel),
        })) {
          bad.push(`${rel}:${line}`);
        }
      }
      report(
        '★ 全仓代码零注释（只有公开入口成员的 JSDoc 与指令例外；CSS 一格都不许）',
        bad.length === 0,
        bad.length === 0 ? '0 处' : `${bad.length} 处：${bad.slice(0, 5).join('、')}`,
      );
    },
  },
  {
    title: '★ 注释豁免面就是公开面（shared 三个入口 + kit 的来源文件；内部文件不放行）',
    run(_ctx, report) {
      const allowed = publicSurfaceFiles();
      const mustAllow = [
        'packages/shared/src/api/unit.ts',
        'packages/shared/src/host/data-root.ts',
        'packages/shared/src/testing/declaration.ts',
        'packages/workbench/src/shared/hooks/use-api-resource.ts',
        'packages/workbench/src/shared/components/Tip.tsx',
        'packages/workbench/src/shared/api/context-chips.ts',
      ];
      const mustDeny = [
        'packages/shared/src/lib/react.ts',
        'packages/workbench/src/shared/hooks/use-capabilities.ts',
        'packages/workbench/src/shared/components/PanelFoot.tsx',
        'packages/workbench/src/shared/api/diy.ts',
        'packages/workbench/src/app/client.tsx',
      ];
      const bad = [
        ...mustAllow.filter((rel) => !allowed.has(rel)).map((rel) => `${rel} 该放行却不在公开面里`),
        ...mustDeny.filter((rel) => allowed.has(rel)).map((rel) => `${rel} 不是公开面却在豁免名单里`),
      ];
      report(
        '★ 注释豁免面就是公开面（shared 三个入口 + kit 的来源文件；内部文件不放行）',
        bad.length === 0,
        bad.length === 0 ? `${String(allowed.size)} 个公开文件` : bad.join('；'),
      );
    },
  },
  {
    title: '★ 注释判据自己有负例（行注释 / 非 JSDoc / 非公开面 JSDoc / 行尾注释都算违规）',
    run(_ctx, report) {
      const title = '★ 注释判据自己有负例（行注释 / 非 JSDoc / 非公开面 JSDoc / 行尾注释都算违规）';
      const cases = [
        ['行注释（非公开面）', '// x\nexport const a = 1;\n', {}, 1],
        ['非 JSDoc 块', '/* x */\nexport const a = 1;\n', {}, 1],
        ['JSDoc（非公开面）', '/** x */\nexport const a = 1;\n', {}, 1],
        ['公开面贴导出的 JSDoc', '/** x */\nexport const a = 1;\n', { allowJsDoc: true }, 0],
        ['公开面 JSDoc 没贴导出', '/** x */\n\nconst a = 1;\n', { allowJsDoc: true }, 1],
        ['公开面 JSDoc 在函数体内', 'export function f() {\n  /** x */\n  const a = 1;\n}\n', { allowJsDoc: true }, 1],
        ['公开面 JSDoc 在 interface 成员上', 'export interface I {\n  /** x */\n  a: string;\n}\n', { allowJsDoc: true }, 1],
        ['多行公开面 JSDoc', '/** a\n * b\n */\nexport interface I {}\n', { allowJsDoc: true }, 0],
        ['行尾注释', 'foo(); // x\nexport const a = 1;\n', {}, 1],
        ['字符串里的斜杠', 'const s = "// x";\nexport const a = 1;\n', {}, 0],
        ['eslint 指令', '// eslint-disable-next-line\nexport const a = 1;\n', {}, 0],
        ['PURE 指令', '/* @__PURE__ */\nexport const a = 1;\n', {}, 0],
        ['三斜线指令', '/// <reference types="node" />\nexport const a = 1;\n', {}, 0],
        ['glob 字面量不算注释', "const s = 'src/**/*.ts';\nexport const a = 1;\n", {}, 0],
        ['CSS 一格都不许', '/* x */\nbody { color: red; }\n', { css: true }, 1],
      ];
      const wrong = cases
        .map(([why, text, options, want]) => ({ why, got: commentViolationsOf(text, options).length, want }))
        .filter((one) => one.got !== one.want);
      report(
        title,
        wrong.length === 0,
        wrong.length === 0
          ? `${String(cases.length)} 条负例都对`
          : wrong.map((one) => `${one.why}：期望 ${String(one.want)} 处、判成 ${String(one.got)} 处`).join('；'),
      );
    },
  },
  {
    title: '★ 写完通道的每个前缀只有一个注册处（两个注册处会把后面的 provision 挤掉）',
    run(_ctx, report) {

      const postSource = ['src/app/host.ts', 'src/shared/api/host/post-channels.ts']
        .map((file) => read(pkg(file)))
        .join('\n');
      const owners = ['registerPrefs', 'registerActions', 'registerProvision', 'registerPanelState'].map((fn) => ({
        fn,
        sites: (postSource.match(new RegExp(`${fn}\\(`, 'g')) ?? []).length,
      }));
      report(
        '★ 写完通道的每个前缀只有一个注册处（两个注册处会把后面的 provision 挤掉）',
        owners.every((item) => item.sites === 1),
        owners.map((item) => `${item.fn}=${item.sites}`).join(' '),
      );
    },
  },
  {
    title: '★ seed 脚本追加隔离层之前先把模板里的空数组 [] 让位（否则 setup 出来的 profile 起不来）',
    run(_ctx, report) {

      const seed = read(pkg('scripts/seed-profile.sh'));
      const strip = seed.indexOf(String.raw`grep -vx '\[\]'`);
      const append = seed.indexOf('cat "$ISOLATION" >>');
      report(
        '★ seed 脚本追加隔离层之前先把模板里的空数组 [] 让位（否则 setup 出来的 profile 起不来）',
        strip !== -1 && append !== -1 && strip < append,
        `让位在第 ${strip} 字符、追加在第 ${append} 字符`,
      );
    },
  },
  {
    title: '★ 模块卡片词汇还在（外壳的样式表里：board.css 或组件自己的，别当死规则删）',
    run(_ctx, report) {

      const sheets = shellSheets();
      const text = sheets.map((file) => read(file)).join('\n');
      const vocabulary = ['wb-card', 'wb-cardBody', 'wb-rows', 'wb-row', 'wb-rowKey', 'wb-panelBody'];
      const gone = vocabulary.filter((name) => !text.includes(`.${name}`));
      report(
        '★ 模块卡片词汇还在（外壳的样式表里：board.css 或组件自己的，别当死规则删）',
        gone.length === 0,
        gone.length === 0
          ? `${vocabulary.length} 个代表类都在（${sheets.length} 份样式表）`
          : `少了几条：${gone.join('、')}`,
      );
    },
  },
  {
    title: '★ 模块的意图钩子（data-wb-*）不进外壳样式表（要更宽用契约类 wb-cardBleed；在册的只许减）',
    run(_ctx, report) {

      const sheets = shellSheets();
      const present = new Set(sheets.flatMap((file) => wbHooksIn(read(file))));
      const registered = ['[data-wb-dot]'];
      const unregistered = [...present].filter((name) => !registered.includes(name));
      const stale = registered.filter((name) => !present.has(name));
      report(
        '★ 模块的意图钩子（data-wb-*）不进外壳样式表（要更宽用契约类 wb-cardBleed；在册的只许减）',
        unregistered.length === 0 && stale.length === 0,
        [
          unregistered.length === 0 ? '' : `新钩子：${unregistered.join('、')}`,
          stale.length === 0 ? '' : `在册却没用了（删掉登记）：${stale.join('、')}`,
        ]
          .filter(Boolean)
          .join(' · ') || `在册 ${registered.length} 条：${registered.join('、')}`,
      );
    },
  },
  {
    title: '★ 判据负例：`data-wb-*` 钩子认得出、外壳自己的属性选择器不误报',
    run(_ctx, report) {
      report(
        '★ 判据负例：`data-wb-*` 钩子认得出、外壳自己的属性选择器不误报',
        wbHooksIn('.wb-cardBody > :not([data-wb-bleed]) { padding-left: var(--wb-len-8); }').join() ===
          '[data-wb-bleed]' &&
          wbHooksIn('.wb-card[data-platform="darwin"] { background: none; }').length === 0,
        '正例 [data-wb-bleed] 命中、负例 [data-platform] 不命中',
      );
    },
  },
  {
    title: '★ 令牌账（跨包）：引用的 --wb-* 都有定义',
    run(_ctx, report) {
      const { used, unresolved } = tokenLedger();
      report(
        '★ 令牌账（跨包）：引用的 --wb-* 都有定义',
        unresolved.length === 0,
        unresolved.length === 0 ? `${used.size} 个引用都查得到` : unresolved.slice(0, 5).join('、'),
      );
    },
  },
  {
    title: '★ 令牌账（跨包）：定义的 --wb-* 都有人用',
    run(_ctx, report) {

      const { defined, used } = tokenLedger();
      const MODULE_FACING = new Set([
        '--wb-len-3-4em',
        '--wb-len-neg-1-5',
        '--wb-len-neg-8',
        '--wb-len-132',
        '--wb-len-5',
        '--wb-len-96',
        '--wb-line-15',
        '--wb-len-52',
        '--wb-len-30',
      ]);
      const dead = [...defined].filter((name) => !used.has(name) && !MODULE_FACING.has(name));
      report(
        '★ 令牌账（跨包）：定义的 --wb-* 都有人用',
        dead.length === 0,
        dead.length === 0 ? `${defined.size} 个令牌都有人用` : `没人用：${dead.slice(0, 6).join('、')}`,
      );
    },
  },
  {
    title: '★ 不再手搓按钮（用 dsh 的 Button；手搓类回来说明又长了一份）',
    run(_ctx, report) {

      const buttonBack = [];
      for (const file of srcTsFiles(SRC)) {
        const text = read(file);
        const where = relative(SRC, file);
        for (const cls of HAND_ROLLED_BUTTONS) {
          if (new RegExp(`\\b${cls}\\b`).test(text)) buttonBack.push(`${where} → ${cls}`);
        }
      }
      report('★ 不再手搓按钮（用 dsh 的 Button；手搓类回来说明又长了一份）', buttonBack.length === 0, buttonBack.join('、'));
    },
  },
  {
    title:
      '★ 不再手搓图标（用 dsh 的 Icon*Regular；只剩 IconBrandMark / IconModuleMark / IconModules / IconNpm / IconOpencli / IconPanelScreen / IconConversation 是我们的）',
    run(_ctx, report) {
      const iconBack = [];
      for (const file of srcTsFiles(SRC)) {
        const text = read(file);
        const fromShared = sharedImportsOf(text);
        const icons = fromShared.filter((name) => name.startsWith('Icon') && !OWN_ICONS.has(name));
        if (icons.length > 0) iconBack.push(`${relative(SRC, file)} → ${icons.join('、')}`);
      }
      report(
        '★ 不再手搓图标（用 dsh 的 Icon*Regular；只剩 IconBrandMark / IconModuleMark / IconModules / IconNpm / IconOpencli / IconPanelScreen / IconConversation 是我们的）',
        iconBack.length === 0,
        iconBack.join('、'),
      );
    },
  },
  {
    title: '★ 状态点用 dsh 的 StateDot（dsh 的插件页也是这么用的）',
    run(_ctx, report) {
      const dotBack = [];
      for (const file of srcTsFiles(SRC)) {
        if (sharedImportsOf(read(file)).includes('StateDot')) dotBack.push(relative(SRC, file));
      }
      report('★ 状态点用 dsh 的 StateDot（dsh 的插件页也是这么用的）', dotBack.length === 0, dotBack.join('、'));
    },
  },
  {
    title: '★ 手搓按钮连样式也不留（CSS 里也没有这些类了）',
    run(ctx, report) {

      const cssCode = injectedCss(ctx.injectedStyles).replace(/\/\*[\s\S]*?\*\//g, '');
      const leftoverRules = HAND_ROLLED_BUTTONS.filter((cls) => new RegExp(`\\.${cls}\\b`).test(cssCode));
      report(
        '★ 手搓按钮连样式也不留（CSS 里也没有这些类了）',
        leftoverRules.length === 0,
        leftoverRules.length === 0 ? '0 个' : `还剩：${leftoverRules.join('、')}`,
      );
    },
  },
  {
    title: '★ 选源选项排版照 dsh（常用项横排、自定义项竖排 → 输入框拉满宽）',
    run(_ctx, report) {
      const sourceCss = allSourceCss();
      const base = /\.registryOption\s*\{[^}]*flex-direction:\s*column/.test(sourceCss);
      const row = /label\.registryOption\s*\{[^}]*flex-direction:\s*row/.test(sourceCss);
      const pick = /\.registryPick\s*\{/.test(sourceCss);
      report(
        '★ 选源选项排版照 dsh（常用项横排、自定义项竖排 → 输入框拉满宽）',
        base && row && pick,
        `基础列 ${base ? '在' : '丢了'} / label 横排 ${row ? '在' : '丢了'} / pick 行 ${pick ? '在' : '丢了'}`,
      );
    },
  },
  {
    title: '★ 选源面板的关闭时机照 dsh（选中不关；开始检查才关）',
    run(_ctx, report) {

      const hook = read(pkg('src/app/layouts/market/use-add-module.ts'));
      const closesOnSelect = /setChoice\(next\);\s*\n\s*setRegistryOpen\(false\)/.test(hook);
      const closesOnInspect = /setRegistryOpen\(false\);\s*\n\s*setPhase\('inspecting'\)/.test(hook);
      report(
        '★ 选源面板的关闭时机照 dsh（选中不关；开始检查才关）',
        !closesOnSelect && closesOnInspect,
        `选中${closesOnSelect ? '会关' : '不关'} / 开始检查${closesOnInspect ? '会关' : '没关'}`,
      );
    },
  },
  {
    title: '★ shared 的哑组件里也不再有手搓按钮',
    run(_ctx, report) {
      const sharedComponents = join(SHARED_SRC, 'components');
      const sharedHits = [];
      for (const entry of readdirSync(sharedComponents, { withFileTypes: true })) {
        if (!/\.(tsx?)$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
        const text = read(join(sharedComponents, entry.name));
        for (const cls of HAND_ROLLED_BUTTONS) {
          if (new RegExp(`\\b${cls}\\b`).test(text)) sharedHits.push(`${entry.name} → ${cls}`);
        }
      }
      report(
        '★ shared 的哑组件里也不再有手搓按钮',
        sharedHits.length === 0,
        sharedHits.length === 0 ? '0 处' : `${sharedHits.length} 处：${sharedHits.join('、')}`,
      );
    },
  },
  {
    title: '★ 会话行不被压缩（滚动 flex 列里的行必须 flex: none）',
    run(ctx, report) {

      const css = injectedCss(ctx.injectedStyles);
      const rowRule = css.slice(css.indexOf('.wb-sessionRow {'), css.indexOf('}', css.indexOf('.wb-sessionRow {')));
      const rowPinned = /flex:\s*none/.test(rowRule);
      report(
        '★ 会话行不被压缩（滚动 flex 列里的行必须 flex: none）',
        rowPinned,
        rowPinned ? '已钉住 flex: none' : `规则体里没有 flex: none（${rowRule.trim().slice(0, 60)}…）`,
      );
    },
  },
];
