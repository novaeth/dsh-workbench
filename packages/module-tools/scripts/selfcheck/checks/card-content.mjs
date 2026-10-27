import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { BIN, FACES, PACKAGES_DIR, declaration } from '../lib.mjs';

export const checks = [
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
