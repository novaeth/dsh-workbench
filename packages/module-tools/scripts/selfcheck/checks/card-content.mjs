import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { BIN, FACES, PACKAGES_DIR, declaration } from '../lib.mjs';

export const checks = [
  {

    title: '卡片标题键有落点：zh/en 都有 → 放行；缺 en → 红并点名；没交字典 → 红',
    run(ctx, report) {
      const probe = mkdtempSync(join(PACKAGES_DIR, '.cardtitle-'));
      const write = (faceBody) => {
        writeFileSync(
          join(probe, 'package.json'),
          JSON.stringify(
            {
              name: '@dsh-workbench/module-demo-cardtitle',
              version: '0.0.1',
              private: true,
              type: 'module',
              peerDependencies: { '@dsh-workbench/core': '^0.1.0' },
              scripts: { build: 'x', typecheck: 'x', test: 'x', selfcheck: 'x' },
              dsh: {
                bundle: { patch: './cordis.patch.yml' },
                client: { platform: 'web', inject: ['@dsh-workbench/core'], external: ['@dsh-workbench/core/client'] },
                workbench: declaration('demo-cardtitle', { card: { titleKey: 'demo.cardTitle', order: 7 } }),
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
  id: '@dsh-workbench/module-demo-cardtitle',
  factory: (require) => ({
    apply: (ctx) => {
      ctx.get('workbenchUnits').registerUnit({
        unit: 'demo-cardtitle',
        card: () => require('@dsh-workbench/core/client').kit.components.Card({ children: 'x' }),
${faceBody}
      });
    },
  }),
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
              }),
            ),
          };
        } catch (error) {
          return { failed: true, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
        }
      };
      const tail = (out) => out.trim().split('\n').slice(-4).join(' | ');
      let problem = null;
      try {
        mkdirSync(probe, { recursive: true });
        writeFileSync(join(probe, 'cordis.patch.yml'), '- id: workbench\n');

        write("        messages: { zh: { 'demo.cardTitle': '卡片' }, en: { 'demo.cardTitle': 'Card' } },");
        const aligned = run();
        if (aligned.failed) throw new Error(`两语都有落点却还是红的：${tail(aligned.out)}`);

        write("        messages: { zh: { 'demo.cardTitle': '卡片' }, en: {} },");
        const halfTranslated = run();
        if (!halfTranslated.failed) throw new Error('en 里没有那条文案，居然没红');
        if (!halfTranslated.out.includes('en 里没有')) {
          throw new Error(`红是红了，但没说清缺哪一语的文案：${tail(halfTranslated.out)}`);
        }
        if (!halfTranslated.out.includes('demo.cardTitle')) {
          throw new Error(`红是红了，但没点名是哪个键：${tail(halfTranslated.out)}`);
        }

        write('');
        const noDictionary = run();
        if (!noDictionary.failed) throw new Error('根本没交字典，居然没红');
        if (!noDictionary.out.includes('没有落点')) {
          throw new Error(`红是红了，但没说清字典没交：${tail(noDictionary.out)}`);
        }
      } catch (error) {
        problem = String(error?.message ?? error);
      } finally {
        rmSync(probe, { recursive: true, force: true });
      }
      report(
        '卡片标题键有落点：zh/en 都有 → 放行；缺 en → 红并点名；没交字典 → 红',
        problem === null,
        problem ?? '',
      );
    },
  },
  {

    title: '无卡片模块（"card": null）：不登记卡片 → 放行并说明；偷偷留一张 → 红并点名"两处说法不一致"',
    run(ctx, report) {
      const probe = mkdtempSync(join(PACKAGES_DIR, '.nocard-'));
      const writeClient = (cardLine) =>
        writeFileSync(
          join(probe, 'client.js'),
          `window.__ModuleLoader__.load({
  id: '@dsh-workbench/module-demo-nocard',
  factory: (require) => ({
    apply: (ctx) => {
      ctx.get('workbenchUnits').registerUnit({
        unit: 'demo-nocard',
${cardLine}
      });
    },
  }),
});
`,
        );
      const run = () => {
        try {
          return {
            failed: false,
            out: String(
              execFileSync(process.execPath, [BIN, 'check', '--only', 'cards'], {
                cwd: probe,
                encoding: 'utf8',
                stdio: 'pipe',
              }),
            ),
          };
        } catch (error) {
          return { failed: true, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
        }
      };
      const tail = (out) => out.trim().split('\n').slice(-4).join(' | ');
      let problem = null;
      try {
        mkdirSync(probe, { recursive: true });
        writeFileSync(join(probe, 'cordis.patch.yml'), '- id: workbench\n');
        writeFileSync(
          join(probe, 'package.json'),
          JSON.stringify(
            {
              name: '@dsh-workbench/module-demo-nocard',
              version: '0.0.1',
              private: true,
              type: 'module',
              peerDependencies: { '@dsh-workbench/core': '^0.1.0' },
              scripts: { build: 'x', typecheck: 'x', test: 'x', selfcheck: 'x' },
              dsh: {
                bundle: { patch: './cordis.patch.yml' },
                client: { platform: 'web', inject: ['@dsh-workbench/core'], external: ['@dsh-workbench/core/client'] },
                workbench: declaration('demo-nocard'),
                workbenchFaces: FACES,
              },
            },
            null,
            2,
          ),
        );

        writeClient('');
        const none = run();
        if (none.failed) throw new Error(`清单说没有卡片、产物也没有，居然红了：${tail(none.out)}`);
        if (!none.out.includes('没有卡片')) {
          throw new Error(`放行了但没说清它是无卡片模块：${tail(none.out)}`);
        }

        writeClient(
          "        card: () => require('@dsh-workbench/core/client').kit.components.Card({ children: 'x' }),",
        );
        const sticker = run();
        if (!sticker.failed) throw new Error('清单说没有卡片、产物却登记了一张，居然没红');
        if (!sticker.out.includes('两处说法不一致')) {
          throw new Error(`红是红了，但没说清是两处说法打架：${tail(sticker.out)}`);
        }
      } catch (error) {
        problem = String(error?.message ?? error);
      } finally {
        rmSync(probe, { recursive: true, force: true });
      }
      report(
        '无卡片模块（"card": null）：不登记卡片 → 放行并说明；偷偷留一张 → 红并点名"两处说法不一致"',
        problem === null,
        problem ?? '',
      );
    },
  },
];
