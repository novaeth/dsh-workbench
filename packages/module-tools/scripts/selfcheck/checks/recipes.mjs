import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { BIN, PACKAGES_DIR, fillPendingDesign } from '../lib.mjs';
import { datasourceProblemOf, renderDatasource } from '../../../src/datasource-file.mjs';

const TITLE =
  '配方：读写共用 key + recipe（+ calls）生成 src/datasource.ts（幂等）；凭据头 / 枚举外 / 批量不合法 /' +
  'recipe 与 custom 二选一都点名叫那条读或写；读写 key 撞了点名；custom 记 warn 不挡绿；生成物过期点名 sync';

export const checks = [
  {
    title: TITLE,
    run(_ctx, report) {
      const probe = mkdtempSync(join(PACKAGES_DIR, '.recipes-'));
      const designFile = join(probe, 'design.json');
      const run = (args) => {
        try {
          const out = execFileSync(process.execPath, [BIN, ...args], {
            cwd: probe,
            encoding: 'utf8',
            stdio: 'pipe',
          });
          return { failed: false, out: String(out) };
        } catch (error) {
          return { failed: true, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
        }
      };
      const read = (file) => readFileSync(join(probe, file), 'utf8');
      const edit = (change) => {
        const design = JSON.parse(read('design.json'));
        change(design);
        writeFileSync(designFile, JSON.stringify(design, null, 2));
      };
      const render = () => {
        const rendered = run(['design', 'render']);
        if (rendered.failed) throw new Error(`design render 起不来：${rendered.out}`);
      };
      const check = () => run(['design', 'check']);
      const problems = [];
      try {
        const init = run(['init', 'demo', '--dir', probe, '--template', 'diy']);
        if (init.failed) throw new Error(`init 起不来：${init.out}`);

        fillPendingDesign(probe);

        edit((design) => {
          design.datasource.key = 'balance';
          design.datasource.recipe = {
            origin: 'https://x.example.com',
            request: { method: 'GET', path: '/api/balance' },
            response: { kind: 'json', path: 'data' },
          };
        });
        render();
        const green = check();
        if (green.failed) problems.push(`带 key + recipe 的读没判绿：${green.out.trim().split('\n').slice(-3).join(' | ')}`);
        if (!read('README.md').includes('调用形状（配方）')) problems.push('README 里没有「调用形状（配方）」那一行');

        edit((design) => {
          design.datasource.calls = { wallet: { path: '/api/wallet' } };
        });
        render();
        const withCalls = check();
        if (withCalls.failed) {
          problems.push(`key + recipe + calls 没判绿：${withCalls.out.trim().split('\n').slice(-3).join(' | ')}`);
        }
        if (!read('README.md').includes('一次打几条（批量）')) problems.push('README 里没有「一次打几条（批量）」那一行');

        edit((design) => {
          design.datasource.calls = { wallet: { path: '/api/wallet?x=1' } };
        });
        render();
        const badCall = check();
        if (!badCall.failed) problems.push('calls 里的 path 带查询，design check 还是绿的');
        else if (!badCall.out.includes('datasource.calls')) problems.push(`批量不合法没点名叫 calls：${badCall.out}`);
        edit((design) => {
          design.datasource.calls = { wallet: { path: '/api/wallet' } };
        });
        render();

        const writeRecipe = {
          origin: 'https://x.example.com',
          request: { method: 'POST', path: '/api/comment', body: { text: 'hi' } },
        };
        edit((design) => {
          design.writes = [
            {
              command: 'POST /api/comment',
              params: 'body.text 必填（契约）',
              credentials: '同源 cookie',
              preview: 'describeRecipe 预览',
              readback: 'datasource.balance',
              undo: '没有配对，一次就是真的',
              failure: '5xx 可能已写，先回读',
              key: 'comment',
              recipe: { ...writeRecipe },
            },
          ];
        });
        render();
        const withWrite = check();
        if (withWrite.failed) {
          problems.push(`写配方没判绿：${withWrite.out.trim().split('\n').slice(-3).join(' | ')}`);
        }
        if (!read('README.md').includes('POST https://x.example.com/api/comment')) {
          problems.push('写通道没有「调用形状（配方）」那一行');
        }

        edit((design) => {
          design.writes[0].recipe.request.headers = { authorization: 'Bearer x' };
        });
        render();
        const badWrite = check();
        if (!badWrite.failed) problems.push('写配方里凭据头写死了，design check 还是绿的');
        else if (!badWrite.out.includes('write.recipe')) problems.push(`写配方不合法没点名叫 write.recipe：${badWrite.out}`);

        edit((design) => {
          delete design.writes[0].recipe.request.headers;
          design.writes[0].custom = { why: '请求体要页面 JS 现算签名' };
        });
        render();
        const bothWrite = check();
        if (!bothWrite.failed) problems.push('写 recipe 与 custom 同时写，design check 还是绿的');
        else if (!bothWrite.out.includes('二选一')) problems.push('写没有点明 recipe 与 custom 二选一');

        edit((design) => {
          delete design.writes[0].recipe;
        });
        render();
        const customWrite = check();
        if (customWrite.failed) {
          problems.push(`写只有 custom + why 应判绿：${customWrite.out.trim().split('\n').slice(-3).join(' | ')}`);
        } else if (!customWrite.out.includes('⚠')) {
          problems.push('写 custom 没有记 warn');
        }

        edit((design) => {
          delete design.writes[0].custom;
          design.writes[0].recipe = { ...writeRecipe };
        });
        render();

        const first = run(['sync']);
        if (first.failed) problems.push(`sync 起不来：${first.out}`);
        const generated = read('src/datasource.ts');
        if (!generated.includes('balance:') || !generated.includes('https://x.example.com')) {
          problems.push('src/datasource.ts 里没有按 design.json 生成的配方');
        }
        if (!generated.includes('DATASOURCE_CALLS') || !generated.includes('/api/wallet')) {
          problems.push('calls 没生成 DATASOURCE_CALLS');
        }
        if (!generated.includes('comment:') || !generated.includes('/api/comment')) {
          problems.push('写配方没生成进 DATASOURCE');
        }
        const again = run(['sync']);
        if (again.failed) problems.push(`第二次 sync 起不来：${again.out}`);
        if (read('src/datasource.ts') !== generated) problems.push('同一条配方 sync 两次写出两份不同的文件');

        edit((design) => {
          design.datasource.recipe.request.headers = { Authorization: 'Bearer x' };
        });
        render();
        const badHeader = check();
        if (!badHeader.failed) problems.push('凭据头写死，design check 还是绿的');
        else {
          if (!badHeader.out.includes('datasource.recipe')) problems.push(`没点名叫 recipe：${badHeader.out}`);
          if (!badHeader.out.includes('auth.place')) problems.push('没说凭据该走 auth.place');
        }

        edit((design) => {
          delete design.datasource.recipe.request.headers;
          delete design.datasource.calls;
          design.datasource.custom = { why: '请求体要页面 JS 现算签名' };
        });
        render();
        const both = check();
        if (!both.failed) problems.push('recipe 与 custom 同时写，design check 还是绿的');
        else if (!both.out.includes('二选一')) problems.push('没点明 recipe 与 custom 只能二选一');

        edit((design) => {
          delete design.datasource.recipe;
        });
        render();
        const onlyCustom = check();
        if (onlyCustom.failed) problems.push(`只有 custom + why 应判绿（只记 warn）：${onlyCustom.out.trim().split('\n').slice(-3).join(' | ')}`);
        else if (!onlyCustom.out.includes('⚠') || !onlyCustom.out.includes('custom')) {
          problems.push('custom 没有记 warn');
        }

        edit((design) => {
          design.datasource.key = 'comment';
        });
        render();
        const dupKey = check();
        if (!dupKey.failed) problems.push('读和写的 key 撞了，design check 还是绿的');
        else if (!dupKey.out.includes('重复')) problems.push(`读写 key 撞了没点名重复：${dupKey.out}`);
        edit((design) => {
          design.datasource.key = 'balance';
        });
        render();

        const designNow = JSON.parse(read('design.json'));
        designNow.datasource.recipe = {
          origin: 'https://x.example.com',
          request: { method: 'GET', path: '/api/other' },
        };
        const stale = datasourceProblemOf(probe, designNow);
        if (stale === undefined || !stale.includes('sync')) {
          problems.push('配方改了、生成物没跟，datasourceProblemOf 没点名 sync');
        }
        const renderedStale = renderDatasource(designNow);
        if (!renderedStale.includes('/api/other')) problems.push('renderDatasource 没按新配方渲染');
      } catch (error) {
        problems.push(String(error?.message ?? error).split('\n')[0]);
      } finally {
        rmSync(probe, { recursive: true, force: true });
      }
      report(TITLE, problems.length === 0, problems.join(' · '));
    },
  },
];
