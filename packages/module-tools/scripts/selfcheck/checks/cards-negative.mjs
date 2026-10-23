import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { BIN, FACES, PACKAGES_DIR, REPO_ROOT, declaration, read } from '../lib.mjs';

const STATES_TITLE =
  '逐态卡片二十一刀各自判红并点名到态：loading 崩 / 冒 undefined / 冒 NaN / zh 缺键 / en 缺键 / loading 空屏 / 没套卡壳 + 刷新崩 / 刷新 NaN / 刷新缺键 / 能力闸缺插件 undefined / NaN / 缺键 + 刷新 at 崩 / at undefined / at NaN / at 缺键 + 缺命令崩 / 缺命令 undefined / 缺命令 NaN / 缺命令缺键（红都只红对应那条）';

export const checks = [
  {
    title: STATES_TITLE,
    run(ctx, report) {

      const probe = mkdtempSync(join(PACKAGES_DIR, '.cards-states-'));
      const shellClient = join(REPO_ROOT, 'packages', 'workbench', 'client.js');
      const messagesFor = (extraZh = '', extraEn = '') => `{
        zh: { 'demo.cardTitle': '演示', 'demo.body': '正文', 'demo.loading': '正在读…', 'demo.error': '读不到'${extraZh} },
        en: { 'demo.cardTitle': 'Demo', 'demo.body': 'Body', 'demo.loading': 'Reading…', 'demo.error': 'Unreadable'${extraEn} },
      }`;
      const write = (cardSource, messagesSource) => {
        writeFileSync(
          join(probe, 'package.json'),
          JSON.stringify(
            {
              name: '@dsh-workbench/module-demo-cards',
              version: '0.0.1',
              private: true,
              type: 'module',
              peerDependencies: { '@dsh-workbench/core': '^0.1.0' },
              scripts: { build: 'x', typecheck: 'x', test: 'x', selfcheck: 'x' },
              dsh: {
                bundle: { patch: './cordis.patch.yml' },
                client: {
                  platform: 'web',
                  inject: ['@dsh-workbench/core'],
                  external: ['@dsh-workbench/core/client'],
                },
                workbench: declaration('demo-cards', { card: { titleKey: 'demo.cardTitle', order: 7 } }),
                workbenchFaces: FACES,
              },
            },
            null,
            2,
          ),
        );
        writeFileSync(
          join(probe, 'client.js'),
          `window.__ModuleLoader__.load({
  id: '@dsh-workbench/module-demo-cards',
  factory: (require) => {
    const { createElement: h } = require('react');
    const { kit } = require('@dsh-workbench/core/client');
    const head = (props) => ({ t: props.t, title: props.t('demo.cardTitle'), refreshing: false, onRefresh: props.onRefresh });
    const face = {
      unit: 'demo-cards',
      messages: ${messagesSource},
      card: ${cardSource},
    };
    return { apply: (ctx) => { ctx.get('workbenchUnits').registerUnit(face); } };
  },
});
`,
        );
      };
      const run = () => {
        try {
          return {
            failed: false,
            out: String(
              execFileSync(process.execPath, [BIN, 'check', '--only', 'cards'], {
                cwd: probe,
                encoding: 'utf8',
                stdio: 'pipe',
                env: { ...process.env, DSH_WB_CORE_CLIENT: shellClient },
              }),
            ),
          };
        } catch (error) {
          return { failed: true, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
        }
      };
      const tail = (out) => out.trim().split('\n').slice(-6).join(' | ');

      const expectRed = (count, cardSource, messagesSource, needles) => {
        write(cardSource, messagesSource);
        const out = run();
        if (!out.failed) return `居然没红：${tail(out.out)}`;
        const tally = /✖ 卡片渲染 (\d+) 条不过/.exec(out.out);
        if (tally === null) return `红了，但不是卡片判据红的：${tail(out.out)}`;
        if (Number(tally[1]) !== count) {
          return `红了 ${tally[1]} 条（应该只有 ${count} 条 —— 多了说明顺带踩红了别的断言）：${tail(out.out)}`;
        }
        for (const needle of needles) {
          if (!out.out.includes(needle)) return `红是红了，但没有「${needle}」：${tail(out.out)}`;
        }
        return undefined;
      };

      const gateCard = (body) => `(props) => {
        const gate = kit.hooks.useCapabilityGate('demo-cards', props.refreshToken);
        const board = kit.hooks.useUnitBoard({
          unit: 'demo-cards', gate, refreshToken: props.refreshToken, onRefresh: props.onRefresh,
          onSummary: () => {}, t: props.t,
          read: () => ({ state: { phase: 'idle' }, refreshing: false, at: null }),
        });
        if (board.blocker !== undefined) { ${body} }
        return h(kit.components.Card, head(props), h('p', null, props.t('demo.body')));
      }`;

      const cmdCard = (body) => `(props) => {
        const gate = kit.hooks.useCapabilityGate('demo-cards', props.refreshToken);
        const board = kit.hooks.useUnitBoard({
          unit: 'demo-cards', gate, refreshToken: props.refreshToken, onRefresh: props.onRefresh,
          onSummary: () => {}, t: props.t,
          read: () => ({ state: { phase: 'idle' }, refreshing: false, at: null }),
        });
        const copy = board.blocker === undefined ? undefined : board.blocker.actions.find((one) => one.kind === 'copy');
        if (copy !== undefined) { ${body} }
        return h(kit.components.Card, head(props), h('p', null, props.t('demo.body')));
      }`;
      const cases = [
        [
          '某态（loading）才崩',
          2,
          `(props) => {
        const resource = kit.hooks.useApiResource('demo/cards', {}, props.refreshToken, {});
        if (resource.phase === 'loading') return h('p', null, String(resource.value.rows[0].name));
        return h(kit.components.Card, head(props), h('p', null, props.t('demo.body')));
      }`,
          messagesFor(),
          ['loading（zh）', '卡片抛了'],
        ],
        [
          '冒 undefined（拼进 hint）',
          16,
          `(props) => {
        const payload = {};
        return h(kit.components.Card, head(props), h(kit.components.CenteredState, { icon: null, title: props.t('demo.body'), hint: String(payload.missing), compact: true }));
      }`,
          messagesFor(),
          ['屏上出现了 undefined', 'idle（zh）'],
        ],
        [
          '冒 NaN（点出来的数没值）',
          16,
          `(props) => {
        const n = Number(undefined).toFixed(1);
        return h(kit.components.Card, head(props), h('p', null, props.t('demo.body') + ' ' + n));
      }`,
          messagesFor(),
          ['屏上出现了 NaN', 'ready（en）'],
        ],
        [
          '裸键名：zh 缺',
          1,
          `(props) => h(kit.components.Card, head(props), h('p', null, props.t('demo.missingInZh')))`,
          messagesFor('', ", 'demo.missingInZh': 'fixed only in en'"),
          ["t('demo.missingInZh') 在 zh 里没有落点", 'idle'],
        ],
        [
          '裸键名：en 缺',
          1,
          `(props) => h(kit.components.Card, head(props), h('p', null, props.t('demo.missingInEn')))`,
          messagesFor(", 'demo.missingInEn': '只在中文里有'"),
          ["t('demo.missingInEn') 在 en 里没有落点", 'idle'],
        ],
        [
          'loading 与刷新那一帧 return null（两态 × 两语）',
          4,
          `(props) => {
        const resource = kit.hooks.useApiResource('demo/cards', {}, props.refreshToken, {});
        if (resource.phase === 'loading') return null;
        return h(kit.components.Card, head(props), h('p', null, props.t('demo.body')));
      }`,
          messagesFor(),
          [
            'loading（zh） 卡片返回空',
            'loading（en）',
            'loading（刷新：保留旧值）（zh）',
            'loading（刷新：保留旧值）（en）',
          ],
        ],
        [
          '没套卡壳（裸 section）',
          1,
          `(props) => h('section', null, h('p', null, props.t('demo.body')), h('span', null, 'x'))`,
          messagesFor(),
          ['没套外壳的卡壳'],
        ],
        [
          '刷新那一帧才崩（有旧值时把旧值当新值解引用）',
          2,
          `(props) => {
        const resource = kit.hooks.useApiResource('demo/cards', {}, props.refreshToken, {});
        if (resource.phase === 'loading' && resource.value !== undefined) throw new Error('刷新那一帧把旧值当新值解引用了');
        return h(kit.components.Card, head(props), h('p', null, props.t('demo.body')));
      }`,
          messagesFor(),
          ['loading（刷新：保留旧值）（zh）', 'loading（刷新：保留旧值）（en）', '卡片抛了'],
        ],
        [
          '刷新那一帧才冒 NaN（拿旧值点出来的数没值）',
          2,
          `(props) => {
        const resource = kit.hooks.useApiResource('demo/cards', {}, props.refreshToken, {});
        const n = resource.phase === 'loading' && resource.value !== undefined ? Number(undefined).toFixed(1) : '0';
        return h(kit.components.Card, head(props), h('p', null, props.t('demo.body') + ' ' + n));
      }`,
          messagesFor(),
          ['屏上出现了 NaN', 'loading（刷新：保留旧值）（zh）'],
        ],
        [
          '刷新那一帧才露裸键名（zh 缺，且只在那一帧问）',
          1,
          `(props) => {
        const resource = kit.hooks.useApiResource('demo/cards', {}, props.refreshToken, {});
        const stale = resource.phase === 'loading' && resource.value !== undefined;
        return h(kit.components.Card, head(props), h('p', null, props.t(stale ? 'demo.refreshOnly' : 'demo.body')));
      }`,
          messagesFor('', ", 'demo.refreshOnly': 'stale frame'"),
          ["t('demo.refreshOnly') 在 zh 里没有落点", 'loading（刷新：保留旧值）'],
        ],
        [
          '两条能力闸里才冒 undefined（读阻断里没有的那一格；缺插件 / 缺命令各一）',
          4,
          gateCard(
            `return h(kit.components.Card, head(props), h(kit.components.CenteredState, { icon: null, title: props.t('demo.body'), hint: String(board.blocker.actions[0].missingField), compact: true }));`,
          ),
          messagesFor(),
          [
            '屏上出现了 undefined',
            'unreadable（能力闸：缺插件）（zh）',
            'unreadable（能力闸：缺命令）（zh）',
          ],
        ],
        [
          '两条能力闸里才冒 NaN（把阻断里没有的那一格当数字；缺插件 / 缺命令各一）',
          4,
          gateCard(
            `const n = Number(board.blocker.actions[0].missingField).toFixed(1); return h(kit.components.Card, head(props), h('p', null, props.t('demo.body') + ' ' + n));`,
          ),
          messagesFor(),
          [
            '屏上出现了 NaN',
            'unreadable（能力闸：缺插件）（en）',
            'unreadable（能力闸：缺命令）（en）',
          ],
        ],
        [
          '两条能力闸里才露裸键名（en 缺，且只在有阻断时问；按 语言 × 键 汇总 → 仍是一条）',
          1,
          gateCard(`return h(kit.components.Card, head(props), h('p', null, props.t('demo.gateOnly')));`),
          messagesFor(", 'demo.gateOnly': '只在中文里有'"),
          ["t('demo.gateOnly') 在 en 里没有落点", 'unreadable（能力闸：缺插件）', 'unreadable（能力闸：缺命令）'],
        ],
        [
          '刷新那一帧的 at 在场时才崩（旧时间戳是这一相的一部分）',
          2,
          `(props) => {
        const resource = kit.hooks.useApiResource('demo/cards', {}, props.refreshToken, {});
        if (resource.at !== undefined) throw new Error('刷新那一帧带了旧时间戳');
        return h(kit.components.Card, head(props), h('p', null, props.t('demo.body')));
      }`,
          messagesFor(),
          ['loading（刷新：保留旧值）（zh）', 'loading（刷新：保留旧值）（en）', '卡片抛了'],
        ],
        [
          '刷新那一帧的 at 在场时才冒 undefined',
          2,
          `(props) => {
        const resource = kit.hooks.useApiResource('demo/cards', {}, props.refreshToken, {});
        const hint = resource.at === undefined ? 'ok' : String(resource.missingField);
        return h(kit.components.Card, head(props), h(kit.components.CenteredState, { icon: null, title: props.t('demo.body'), hint, compact: true }));
      }`,
          messagesFor(),
          ['屏上出现了 undefined', 'loading（刷新：保留旧值）（zh）'],
        ],
        [
          '刷新那一帧的 at 在场时才冒 NaN',
          2,
          `(props) => {
        const resource = kit.hooks.useApiResource('demo/cards', {}, props.refreshToken, {});
        const text = resource.at === undefined ? '0' : Number(resource.missingField).toFixed(1);
        return h(kit.components.Card, head(props), h('p', null, props.t('demo.body') + ' ' + text));
      }`,
          messagesFor(),
          ['屏上出现了 NaN', 'loading（刷新：保留旧值）（en）'],
        ],
        [
          '刷新那一帧的 at 在场时才露裸键名（zh 缺，且只在那一帧问）',
          1,
          `(props) => {
        const resource = kit.hooks.useApiResource('demo/cards', {}, props.refreshToken, {});
        return h(kit.components.Card, head(props), h('p', null, props.t(resource.at === undefined ? 'demo.body' : 'demo.atOnly')));
      }`,
          messagesFor('', ", 'demo.atOnly': 'stale timestamp frame'"),
          ["t('demo.atOnly') 在 zh 里没有落点", 'loading（刷新：保留旧值）'],
        ],
        [
          '缺命令那一帧才崩（升级命令那条动作在场时）',
          2,
          cmdCard(`throw new Error('缺命令那一帧带上了可复制的升级命令');`),
          messagesFor(),
          ['unreadable（能力闸：缺命令）（zh）', 'unreadable（能力闸：缺命令）（en）', '卡片抛了'],
        ],
        [
          '缺命令那一帧才冒 undefined（复制动作里没有的那一格）',
          2,
          cmdCard(
            `return h(kit.components.Card, head(props), h(kit.components.CenteredState, { icon: null, title: props.t('demo.body'), hint: String(copy.missingField), compact: true }));`,
          ),
          messagesFor(),
          ['屏上出现了 undefined', 'unreadable（能力闸：缺命令）（zh）'],
        ],
        [
          '缺命令那一帧才冒 NaN（把复制动作里没有的那一格当数字）',
          2,
          cmdCard(
            `const n = Number(copy.missingField).toFixed(1); return h(kit.components.Card, head(props), h('p', null, props.t('demo.body') + ' ' + n));`,
          ),
          messagesFor(),
          ['屏上出现了 NaN', 'unreadable（能力闸：缺命令）（en）'],
        ],
        [
          '缺命令那一帧才露裸键名（en 缺，且只在那一帧问）',
          1,
          cmdCard(`return h(kit.components.Card, head(props), h('p', null, props.t('demo.cmdOnly')));`),
          messagesFor(", 'demo.cmdOnly': '只在中文里有'"),
          ["t('demo.cmdOnly') 在 en 里没有落点", 'unreadable（能力闸：缺命令）'],
        ],
      ];
      try {
        mkdirSync(probe, { recursive: true });
        writeFileSync(join(probe, 'cordis.patch.yml'), '- id: workbench\n');

        write(
          `(props) => {
        const resource = kit.hooks.useApiResource('demo/cards', {}, props.refreshToken, {});
        if (resource.phase === 'idle') return h(kit.components.Card, head(props), h('p', null, props.t('demo.body')));
        if (resource.phase === 'loading') return h(kit.components.Card, head(props), h('p', null, props.t('demo.loading')));
        if (resource.phase === 'error') return h(kit.components.Card, head(props), h('p', null, props.t('demo.error')));
        return h(kit.components.Card, head(props), h('p', null, props.t('demo.body')));
      }`,
          messagesFor(),
        );
        const green = run();
        report(
          '逐态卡片正例：八态都画得出、两语字典齐全 → 绿',
          !green.failed,
          green.failed ? `居然红了：${tail(green.out)}` : '底座是绿的',
        );

        let allNamed = !green.failed;
        for (const [label, count, cardSource, messagesSource, needles] of cases) {
          const problem = expectRed(count, cardSource, messagesSource, needles);
          if (problem !== undefined) allNamed = false;
          report(
            label,
            problem === undefined,
            problem ?? `${count} 条红都在点上，点到了 ${needles.join('、')}`,
          );
        }
        report(STATES_TITLE, allNamed, allNamed ? '二十一刀都判红且都点到了名' : '有刀没判红或没点名（见上面那几行）');
      } finally {
        rmSync(probe, { recursive: true, force: true });
      }
    },
  },
  {
    title: 'prefs：表里"存起来"没接 → 红（点名）；接了但表里没写 → 红；对齐 → 绿；枚举外 → 点名可选值',
    run(ctx, report) {

      const probe = mkdtempSync(join(PACKAGES_DIR, '.prefs-'));
      const designFile = join(probe, 'design.json');
      const hostFile = join(probe, 'dist/host.js');
      const face = (withPrefs) => `export const name = '@dsh-workbench/module-demo-prefs';
export const inject = ['workbenchUnits'];
const mount = () => ({
  routes: {},
  registerTools: () => [],${withPrefs ? "\n  prefs: { resource: 'demo-prefs', handle: (payload) => ({ ok: true, payload }) }," : ''}
});
const face = { manifest: { id: 'demo-prefs', card: null, tools: [], host: { inject: [] } }, mount };
export function apply(ctx) {
  const units = ctx.get('workbenchUnits');
  if (units === undefined) return;
  ctx.effect(() => units.register(face), 'demo-prefs');
}
`;
      const run = (args) => {
        try {
          const out = execFileSync(process.execPath, [BIN, ...args], { cwd: probe, encoding: 'utf8', stdio: 'pipe' });
          return { failed: false, out: String(out) };
        } catch (error) {
          return { failed: true, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
        }
      };
      const state = (persistence, withPrefs) => {
        writeFileSync(
          designFile,
          JSON.stringify(
            {
              unit: 'demo-prefs',
              name: 'x',
              oneLine: 'x',
              panel: [],
              config:
                persistence === null
                  ? []
                  : [
                      {
                        persistence,
                        key: '看几天',
                        watches: '窗口',
                        default: '7',
                        valuesFrom: '1 / 7 / 30',
                        wrongChoice: '夹回范围',
                      },
                    ],
              capabilities: [],
              linkage: [],
              acceptance: [],
              reads: [{ read: 'r', params: 'p', credentials: 'c', notLoggedIn: 'n', timeout: 't' }],
            },
            null,
            2,
          ),
        );
        writeFileSync(hostFile, face(withPrefs));
      };
      const tail = (out) => out.trim().split('\n').slice(-6).join(' | ');
      const problems = [];
      try {
        mkdirSync(join(probe, 'dist'), { recursive: true });
        mkdirSync(join(probe, 'src'), { recursive: true });
        writeFileSync(join(probe, 'cordis.patch.yml'), '- id: workbench\n');
        writeFileSync(join(probe, 'src/host.ts'), 'export const manifest = {};\n');
        writeFileSync(join(probe, 'src/client.tsx'), 'export const card = null;\n');
        writeFileSync(
          join(probe, 'package.json'),
          JSON.stringify(
            {
              name: '@dsh-workbench/module-demo-prefs',
              version: '0.0.1',
              private: true,
              type: 'module',
              peerDependencies: { '@dsh-workbench/core': '^0.1.0' },
              scripts: { build: 'x', typecheck: 'x', test: 'x', selfcheck: 'x' },
              dsh: {
                bundle: { patch: './cordis.patch.yml' },
                client: {
                  platform: 'web',
                  inject: ['@dsh-workbench/core'],
                  external: ['@dsh-workbench/core/client'],
                },
                workbench: { unit: 'demo-prefs' },
                workbenchFaces: FACES,
              },
            },
            null,
            2,
          ),
        );

        state('prefs', false);
        const missing = run(['check', '--only', 'contracts']);
        if (!missing.failed) problems.push('表里写着"存起来"、产物里没接 prefs，居然没红');
        else if (!missing.out.includes('没有接 prefs')) {
          problems.push(`判红了但没点明是没接 prefs：${tail(missing.out)}`);
        }

        state('view', true);
        const unwritten = run(['check', '--only', 'contracts']);
        if (!unwritten.failed) problems.push('产物里接了 prefs、设计表里没写，居然没红');
        else if (!unwritten.out.includes('表上没写')) {
          problems.push(`判红了但没点明是表里没写：${tail(unwritten.out)}`);
        }

        state('prefs', true);
        const aligned = run(['check', '--only', 'contracts']);
        if (aligned.failed) problems.push(`两边对齐了还是红的：${tail(aligned.out)}`);

        state('whatever', true);
        const bogus = run(['design', 'check']);
        if (!bogus.failed) problems.push('persistence 写成枚举外的值，design check 居然没红');
        else if (!bogus.out.includes('只认 prefs / view')) {
          problems.push(`没点明可选值：${tail(bogus.out)}`);
        }
      } finally {
        rmSync(probe, { recursive: true, force: true });
      }
      report(
        'prefs：表里"存起来"没接 → 红（点名）；接了但表里没写 → 红；对齐 → 绿；枚举外 → 点名可选值',
        problems.length === 0,
        problems.join(' · '),
      );
    },
  },
  {
    title: '多条读：reads[] 各占一节；缺格点名叫 reads[1].那格；单条读的渲染逐字不变',
    run(ctx, report) {

      const probe = mkdtempSync(join(PACKAGES_DIR, '.reads-'));
      const problems = [];
      try {
        execFileSync(process.execPath, [BIN, 'init', 'demo', '--dir', probe, '--template', 'diy'], { stdio: 'pipe' });
        const design = join(probe, 'design.json');
        const run = (action) => execFileSync(process.execPath, [BIN, 'design', action, '--cwd', probe], { stdio: 'pipe' });

        const parsed = JSON.parse(read(design));
        const first = parsed.datasource;
        delete parsed.datasource;
        parsed.reads = [first, { ...first, read: '第二条读：另一次调用', notLoggedIn: '' }];
        writeFileSync(design, JSON.stringify(parsed, null, 2));

        let message = '';
        try {
          run('check');
        } catch (error) {
          message = `${error.stdout ?? ''}${error.stderr ?? ''}`;
        }
        if (message === '') problems.push('第二条读缺一格，design check 还是绿的');
        else if (!message.includes('reads[1].notLoggedIn')) {
          problems.push(`报错里没点名是第几条读的哪一格：${message.trim().split('\n').slice(-3).join(' | ')}`);
        }

        parsed.reads[1].notLoggedIn = '没登录 / 凭据过期时：阻断屏，码 auth-required';
        writeFileSync(design, JSON.stringify(parsed, null, 2));
        try {
          run('render');
          run('check');
          const readme = read(join(probe, 'README.md'));
          if (!readme.includes('#### 读 1') || !readme.includes('#### 读 2')) {
            problems.push('两条读没在 README 里各占一节');
          }
        } catch (error) {
          const out = `${error.stdout ?? ''}${error.stderr ?? ''}`;
          problems.push(`补全后 render / check 还是红的：${out.trim().split('\n').slice(-3).join(' | ')}`);
        }
      } finally {
        rmSync(probe, { recursive: true, force: true });
      }
      report(
        '多条读：reads[] 各占一节；缺格点名叫 reads[1].那格；单条读的渲染逐字不变',
        problems.length === 0,
        problems.join(' · '),
      );
    },
  },
];
