import { createRule } from '@arch-guard/core';
import { deps, designSystem, i18n, library, noneI18nKit } from '@arch-guard/core/presets';
import { kernelRules } from './arch/rules/kernel.mjs';
import { STACK_CAPABILITIES } from '../../scripts/arch/stack.mjs';

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
        contract: 1,
        lib: 2,
        config: 2,
        i18n: 2,
        api: 4,
        components: 3,
        '__tests__': 99,
        host: 9,
        testing: 99,
      },
    }),
    designSystem({

      styleDir: 'src/components',
      externalTokens: [
        { prefix: '--dsw-', provider: '@deepseek-ai/dsh-client-ui-theme' },
        { prefix: '--ds-', provider: '@deepseek-ai/dsh-client-ui-theme' },
        { prefix: '--wb-', provider: '@dsh-workbench/core' },
      ],
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
    deps({
      fingerprints: [{ capability: 'query-string', allowOwn: false }],
      capabilities: STACK_CAPABILITIES,
    }),
    i18n(noneI18nKit()),
  ],
  overrides: {
    include: ['src/**'],
    customRules: [entryKeepsHostOut, ...kernelRules],
    exceptions: [
      {
        rule: 'S16',
        glob: 'src/i18n/*.ts',
        reason: '词典是逐条文案的平铺表：拆文件只会让键名与语种漂开，检查的是键集不是文件体积。',
      },
    ],
  },
};
