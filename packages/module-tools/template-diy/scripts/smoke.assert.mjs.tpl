// 这份模块自己的真读断言：换数据源时改这一份，不要删 smoke.mjs 里那一整段。
//
// `assertModule()` 只在这里拿到真东西（路由表与 check），想验什么就写什么：
// 卡片画的数从哪来，这里真的调一次 —— `check` 的十三条判据一条都不碰这条。

import { readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = dirname(dirname(fileURLToPath(import.meta.url)));

export async function assertModule({ check, routes, UNIT_ID }) {
  const route = `${UNIT_ID}/overview`;
  if (typeof routes[route] !== 'function') {
    check(`真读路由 ${route} 还在`, false, '换数据源时把 smoke.assert.mjs 的断言一起改掉，别静默跳过');
    return;
  }

  const answer = await routes[route](new URLSearchParams({ path: moduleDir, limit: '3' }));
  const entries = readdirSync(moduleDir, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile());
  const names = new Set(files.map((entry) => entry.name));

  check('路由真读了本目录：ok，回的是这个 path', answer?.ok === true && answer?.path === moduleDir, JSON.stringify(answer?.error ?? answer?.path));
  check('读到的文件数与真实目录一致（不是写死的）', answer?.files === files.length, `answer=${answer?.files} 实际=${files.length}`);
  check('最大的几个文件不超过 limit，而且都是真文件', (answer?.largest?.length ?? 0) >= 1 && answer.largest.length <= 3 && answer.largest.every((one) => names.has(one.name)), JSON.stringify(answer?.largest));
  check('读不到时回 ok:false 的 error，而不是抛', (await routes[route](new URLSearchParams({ path: `${moduleDir}/不存在的目录` })))?.ok === false);
}
