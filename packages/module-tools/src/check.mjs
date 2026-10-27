export const CHECKS = {
  contracts: {
    title: '模块契约',
    summary: '单元 id、两个面、四个脚本、files、peer 下限，以及清单与代码注册对账',
    layer: 'manifest',
    load: () => import('./checks/contracts.mjs'),
  },
  protocol: {
    title: '模块声明协议',
    summary: 'dsh.workbench 的 apiVersion、静态半形状与未知键',
    layer: 'manifest',
    load: () => import('./checks/protocol.mjs'),
  },
  bundles: {
    title: '模块产物边界',
    summary: '宿主产物不含浏览器侧、浏览器产物不内联外壳 CSS 与夹具',
    layer: 'build',
    load: () => import('./checks/bundles.mjs'),
  },
  source: {
    title: '模块源码边界与零注释',
    summary: '零注释、包与运行时入口分开、不手写进程/锁/原子写',
    layer: 'source',
    load: () => import('./checks/source.mjs'),
  },
  arch: {
    title: '模块架构（分层 / 边界 / 设计系统）',
    summary: '模块自己的层序、运行时边界与设计系统配置',
    layer: 'source',
    load: () => import('./checks/arch.mjs'),
  },
  lint: {
    title: '模块代码卫生（eslint）',
    summary: '模块自己的 eslint.config.mjs 与规则集',
    layer: 'source',
    load: () => import('./checks/lint.mjs'),
  },
  primitives: {
    title: 'dsh 原语只从模块表拿',
    summary: 'dsh 包只从 kit 取，模块自己声明 external',
    layer: 'build',
    load: () => import('./checks/primitives.mjs'),
  },
  kit: {
    title: '外壳 kit 面',
    summary: '模块产物对得上所装外壳的 kit 面与 peer 下限',
    layer: 'build',
    load: () => import('./checks/kit.mjs'),
  },
  cards: {
    title: '卡片渲染',
    summary: '八态 × zh/en 渲染：不抛、不空白、不冒裸键名',
    layer: 'render',
    load: () => import('./checks/cards.mjs'),
  },
  standalone: {
    title: '独立构建',
    summary: '外壳源码不在场时仍能 build + typecheck',
    layer: 'build',
    load: () => import('./checks/standalone.mjs'),
  },
  markers: {
    title: '公开包无内部标识',
    summary: '公开包不含私有源、私网 IP、内部域名后缀',
    layer: 'meta',
    load: () => import('./checks/markers.mjs'),
  },
  style: {
    title: '样式归属',
    summary: '不定义 wb-* 规则；裸标签控件改走 kit；令牌名对现读的清单校验',
    layer: 'source',
    load: () => import('./checks/style.mjs'),
  },
  alias: {
    title: '模块不指外壳',
    summary: '模块源码里没有指向外壳 @/ 的引用',
    layer: 'source',
    load: () => import('./checks/alias.mjs'),
  },
};

export function checkList() {
  return Object.entries(CHECKS).map(([name, entry]) => ({
    name,
    title: entry.title,
    summary: entry.summary,
    layer: entry.layer,
  }));
}

export function renderCheckTable(rows = checkList()) {
  return [
    '| 判据 | 层 | 摘要 |',
    '|---|---|---|',
    ...rows.map((row) => `| \`${row.name}\` | ${row.layer} | ${row.summary} |`),
  ].join('\n');
}

function list(args) {
  const rows = checkList();
  if (args.includes('--json')) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  if (args.includes('--markdown')) {
    console.log(renderCheckTable(rows));
    return;
  }
  for (const row of rows) console.log(`${row.name}\t${row.layer}\t${row.title}\t${row.summary}`);
}

const STATES = ['pass', 'fail', 'skip'];

function report(title, result) {
  const notes = Array.isArray(result.notes) ? result.notes : [];
  if (result.status === 'fail') {
    const problems = Array.isArray(result.problems) ? result.problems : [];
    console.log(`✖ ${title} ${problems.length} 条不过：`);
    for (const problem of problems) console.log(`  · ${problem}`);
    for (const note of notes) console.log(`  ${note}`);
    return;
  }
  if (result.status === 'skip') {
    console.log(`○ ${title}：（不适用）${notes[0] ?? ''}`);
  } else {
    console.log(`✔ ${title}：${notes[0] ?? ''}`);
  }
  for (const note of notes.slice(1)) console.log(`  ${note}`);
}

export async function check({ only, args = [] } = {}) {
  if (args.includes('--list')) {
    list(args);
    return;
  }
  const names = only === undefined ? Object.keys(CHECKS) : [only];
  const jsonMode = args.includes('--json');
  const tally = { pass: 0, skip: 0, fail: 0 };
  const skipped = [];
  let ran = 0;
  process.env.DSH_WB_ONLY_ARGS = JSON.stringify(args);
  try {
    for (const name of names) {
      const entry = CHECKS[name];
      if (entry === undefined) {
        console.error(`不认识的判据：${name}（有：${Object.keys(CHECKS).join(' / ')}）`);
        process.exit(2);
      }

      process.env.DSH_WB_ONLY = only === undefined ? '' : name;
      const module = await entry.load();
      const result = await module.run();

      const title = typeof module.title === 'string' && module.title !== '' ? module.title : entry.title;
      ran += 1;
      if (!STATES.includes(result.status)) {
        report(title, {
          status: 'fail',
          notes: [],
          problems: [`返回了不认识的 status：${String(result.status)} —— 只许 ${STATES.join(' / ')}`],
        });
        tally.fail += 1;
        continue;
      }
      tally[result.status] += 1;
      if (result.status === 'skip') skipped.push(`${title}（${result.notes[0] ?? ''}）`);
      if (jsonMode && result.payload !== undefined) console.log(JSON.stringify(result.payload, null, 2));
      else report(title, result);
    }
  } finally {
    process.env.DSH_WB_ONLY = '';
    process.env.DSH_WB_ONLY_ARGS = '';
  }

  if (jsonMode) {
    if (tally.fail > 0) process.exit(1);
    return;
  }

  console.log(`${ran} 条判据：${tally.pass} 通过 · ${tally.skip} 不适用 · ${tally.fail} 不过`);

  if (skipped.length > 0) {
    console.log(`  这 ${skipped.length} 条这次一条都没查（不是"没问题"）：`);
    for (const one of skipped) console.log(`  ○ ${one}`);
    console.log('  换个 cwd 它们才跑得起来（工坊里「独立构建」扫不到外壳源码、「公开包无内部标识」只扫');
    console.log('  要发出去的包）—— 想验这两条，回工作台仓库根跑 `dsh-wb-module check`。');
  }
  if (tally.fail > 0) process.exit(1);
}
