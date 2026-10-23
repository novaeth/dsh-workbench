export const CHECKS = {
  contracts: { title: '模块契约', load: () => import('./checks/contracts.mjs') },
  protocol: { title: '模块声明协议', load: () => import('./checks/protocol.mjs') },
  bundles: { title: '模块产物边界', load: () => import('./checks/bundles.mjs') },
  source: { title: '模块源码边界与零注释', load: () => import('./checks/source.mjs') },
  arch: { title: '模块架构（分层 / 边界 / 设计系统）', load: () => import('./checks/arch.mjs') },
  lint: { title: '模块代码卫生（eslint）', load: () => import('./checks/lint.mjs') },
  primitives: { title: 'dsh 原语只从模块表拿', load: () => import('./checks/primitives.mjs') },
  kit: { title: '外壳 kit 面', load: () => import('./checks/kit.mjs') },
  cards: { title: '卡片渲染', load: () => import('./checks/cards.mjs') },
  standalone: { title: '独立构建', load: () => import('./checks/standalone.mjs') },
  markers: { title: '公开包无内部标识', load: () => import('./checks/markers.mjs') },
  style: { title: '样式归属', load: () => import('./checks/style.mjs') },
  alias: { title: '模块不指外壳', load: () => import('./checks/alias.mjs') },
};

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
