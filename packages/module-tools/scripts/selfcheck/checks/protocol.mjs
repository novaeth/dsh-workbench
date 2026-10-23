import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BIN, FACES, declaration } from '../lib.mjs';

export const checks = [
  {
    title:
      '模块声明协议：缺 apiVersion / 生字段（`scopes`）/ 认不出的版本 / 写 `scope`（card 与 tools[] 两处）都判红；' +
      '旧落点 `dsh.workbench.faces` 判生字段、`dsh.workbenchFaces` 缺了或指空文件都判红；' +
      '清单声明的能力与代码注册的对不上判红；对齐后 protocol 绿、那条话消失',
    run(_ctx, report) {
      const title =
        '模块声明协议：缺 apiVersion / 生字段（`scopes`）/ 认不出的版本 / 写 `scope`（card 与 tools[] 两处）都判红；' +
        '旧落点 `dsh.workbench.faces` 判生字段、`dsh.workbenchFaces` 缺了或指空文件都判红；' +
        '清单声明的能力与代码注册的对不上判红；对齐后 protocol 绿、那条话消失';
      const protoShop = mkdtempSync(join(tmpdir(), 'dsh-wb-protocol-'));
      const protoDir = join(protoShop, 'packages', 'proto-module');

      const protoManifest = (patch, dshExtra = {}) =>
        JSON.stringify(
          {
            name: '@neg/proto',
            version: '0.0.1',
            dsh: {
              bundle: { patch: './cordis.patch.yml' },
              workbench: declaration('proto', {
                card: { titleKey: 'proto.cardTitle', order: 90 },
                tools: [{ name: 'proto_read', writes: false }],
                ...patch,
              }),
              workbenchFaces: FACES,
              ...dshExtra,
            },
          },
          null,
          2,
        );
      const protoRun = (only) => {
        try {
          const out = execFileSync(process.execPath, [BIN, 'check', '--only', only], {
            cwd: protoDir,
            env: { ...process.env, DSH_WB_ROOT: protoShop },
            encoding: 'utf8',
            stdio: 'pipe',
          });
          return { failed: false, out: String(out) };
        } catch (error) {
          return { failed: true, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
        }
      };
      const protoExpectRed = (only, needles) => {
        const result = protoRun(only);
        if (!result.failed) throw new Error(`负例没被判红：check --only ${only}`);
        for (const needle of needles) {
          if (!result.out.includes(needle)) {
            throw new Error(`check --only ${only} 判红了，但没说清「${needle}」：\n${result.out}`);
          }
        }
      };
      try {
        mkdirSync(join(protoDir, 'src'), { recursive: true });
        mkdirSync(join(protoDir, 'dist'), { recursive: true });
        writeFileSync(join(protoDir, 'src/host.ts'), '');
        writeFileSync(join(protoDir, 'src/client.tsx'), '');
        writeFileSync(join(protoDir, 'cordis.patch.yml'), '[]\n');

        writeFileSync(
          join(protoDir, 'dist/host.js'),
          'export function apply(ctx) {\n' +
            '  ctx.get("workbenchUnits").register({ unit: "proto", mount: () => ({ routes: {}, registerTools: () => [] }) });\n' +
            '}\n',
        );

        writeFileSync(join(protoDir, 'package.json'), protoManifest({ apiVersion: undefined }));
        protoExpectRed('protocol', ['apiVersion']);

        writeFileSync(
          join(protoDir, 'package.json'),
          protoManifest({ tools: [{ name: 'proto_read', writes: false, scopes: 'machine' }] }),
        );
        protoExpectRed('protocol', ['scopes']);

        writeFileSync(
          join(protoDir, 'package.json'),
          protoManifest(
            { faces: { host: 'src/host.ts', client: 'src/client.tsx' } },
            { workbenchFaces: undefined },
          ),
        );
        protoExpectRed('protocol', ['faces']);
        protoExpectRed('contracts', ['dsh.workbenchFaces.host 没声明']);

        writeFileSync(join(protoDir, 'package.json'), protoManifest({ apiVersion: 99 }));
        protoExpectRed('protocol', ['99']);

        writeFileSync(
          join(protoDir, 'package.json'),
          protoManifest({
            card: { titleKey: 'proto.cardTitle', order: 90, scope: 'machine' },
            tools: [{ name: 'proto_read', writes: false, scope: 'workspace' }],
          }),
        );
        protoExpectRed('protocol', ['card 里有不认的键', '"scope"']);
        writeFileSync(
          join(protoDir, 'package.json'),
          protoManifest({ tools: [{ name: 'proto_read', writes: false, scope: 'wherever' }] }),
        );
        protoExpectRed('protocol', ['tools[0] 里有不认的键', '"scope"']);

        writeFileSync(join(protoDir, 'package.json'), protoManifest({}));
        protoExpectRed('contracts', ['声明的能力与代码真正注册的对不上']);

        writeFileSync(join(protoDir, 'package.json'), protoManifest({ tools: [] }));
        const green = protoRun('protocol');
        if (green.failed) throw new Error(`对齐之后 protocol 还是红的：\n${green.out}`);
        const reconciled = protoRun('contracts');
        if (reconciled.out.includes('对不上')) {
          throw new Error(`对齐之后还在报"对不上"（一刀切了）：\n${reconciled.out}`);
        }

        writeFileSync(join(protoDir, 'package.json'), protoManifest({ tools: [] }, { workbenchFaces: undefined }));
        protoExpectRed('contracts', ['dsh.workbenchFaces.host 没声明']);
        writeFileSync(
          join(protoDir, 'package.json'),
          protoManifest({ tools: [] }, { workbenchFaces: { host: 'src/nope.ts', client: 'src/client.tsx' } }),
        );
        protoExpectRed('contracts', ['dsh.workbenchFaces.host 指的文件不存在 —— src/nope.ts']);

        report(title, true);
      } catch (error) {
        report(title, false, `协议判据的负例坏了：${error.message}`);
      } finally {
        rmSync(protoShop, { recursive: true, force: true });
      }
    },
  },
];
