import { createRule } from '@arch-guard/core';
import { deps, designSystem, i18n, library, noneI18nKit } from '@arch-guard/core/presets';

const entryKeepsHostOut = createRule({
  id: 'S70',
  domain: 'structure',
  level: 'L2',
  severity: 'error',
  title: '浏览器入口不许带出宿主侧',
  hint: 'src/index.ts 是浏览器半侧的入口，只能带 browser-safe 的东西；宿主侧走 src/host.ts。',
  run(ctx) {
    const facts = ctx.facts.get('src/index.ts');
    if (facts === undefined) return [];
    return (facts.imports ?? [])
      .filter((fact) => /(^|\/)host(\/|$)/.test(fact.spec))
      .map((fact) => ({
        rule: 'S70',
        file: 'src/index.ts',
        line: fact.line,
        text: `浏览器入口带出了宿主侧：${fact.spec}`,
        hint: '把它挪到 src/host.ts 那一侧（宿主入口）',
      }));
  },
});

export default {
  sourceForm: 'react',
  presets: [
    library({
      src: 'src',
      entry: ['index.ts', 'host.ts', 'testing.ts'],
      modules: {
        lib: 1,
        config: 2,
        i18n: 3,
        api: 4,
        components: 5,
        '__tests__': 5,
        host: 9,
        testing: 10,
      },
    }),
    designSystem({

      styleDir: 'src/components',
      storageFile: 'src/config/storage.ts',
      tokenDir: '',
      vendorDir: '',
      paletteFile: '',
      themeFile: '',
      valueWhitelists: [
        { rule: 'D12', allow: ['0'] },
        { rule: 'D13', allow: ['0'] },
        { rule: 'D14', allow: ['0'] },
      ],
    }),
    deps({ allow: ['react', 'dayjs'] }),
    i18n(noneI18nKit()),
    { enable: ['S70'] },
  ],
  overrides: {
    include: ['src/**'],
    customRules: [entryKeepsHostOut],
    exceptions: [
      {
        rule: 'S11',
        glob: 'src/index.ts',
        reason: '这两个文件不是顺手加的 index：它们就是本包 exports 指向的两个入口（浏览器侧与宿主侧），由 scripts/barrels.mjs 生成（`pnpm --filter @dsh-workbench/shared run barrels`，跑完 git diff 必须为空）—— index.ts 收 src/** 里除 host/** 与 testing 入口（exports["./testing"]）之外的全部文件；host.ts 的 ./host/** 段是生成的，前面那段跨运行时再导出是人工维护的。S11 防的是「随手造 barrel 造出依赖环」，而这两个 barrel 是契约本身 —— 只 export *、不含逻辑。',
      },
      {
        rule: 'S11',
        glob: 'src/host.ts',
        reason: '同 src/index.ts：它也是 exports 指向的入口，不是顺手加的 barrel。它的 ./host/** 段由 scripts/barrels.mjs 生成，前面那段跨运行时再导出（宿主侧也要用的纯类型与纯函数）是人工维护的，生成器原样保留 —— 别当它是手滑加的。',
      },
      {
        rule: 'S11',
        glob: 'src/testing.ts',
        reason: '它也是 exports 指向的入口（exports["./testing"] 的测试夹具），但是手写的、不由 scripts/barrels.mjs 生成：夹具故意不进 index.ts / host.ts 这两个生产入口（所以 index.ts 生成时把 testing.ts 与 testing/** 排掉）。',
      },
      {
        rule: 'D04',
        glob: 'src/components/*.css',
        reason:
          '主题令牌由 dsh 在运行时提供（--dsw-*）。本包不拥有主题，凡是 --dsw-* 的名字都不在本包定义 —— ' +
          '所以这里的引用查不闭合是正常的，与外壳 `src/shared/styles/**` 那条豁免同一个理由' +
          '（ADR-0029 S3 把组件样式搬进本包时，这条豁免跟着搬过来）。',
      },
    ],
  },
};
