import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const HOST_ONLY = [/^src\/shared\/api\/host\//, /^src\/app\/host\.ts$/];

const CLIENT_ONLY = [
  /^src\/app\/layouts\//,
  /^src\/shared\/components\//,
  /^src\/shared\/hooks\//,
  /^src\/shared\/styles\//,
];

function collectModules(sink, outside) {
  return {
    name: 'dsh-workbench:collect-modules',
    load(id) {
      const clean = id.split('?')[0] ?? id;
      if (clean.startsWith(root)) sink.add(relative(root, clean));
      else if (outside !== undefined && clean.includes('/packages/shared/')) outside.add(clean);
      return null;
    },
  };
}

async function graphOf(mode, outside) {
  const seen = new Set();
  await build({
    root,
    mode,
    logLevel: 'silent',
    plugins: [collectModules(seen, outside)],
    build: { write: false },
  });
  return [...seen];
}

function report(label, graph, patterns, advice) {
  const violations = graph.filter((path) => patterns.some((pattern) => pattern.test(path)));
  if (violations.length === 0) return false;
  console.error(`✖ ${label}：`);
  for (const path of violations) console.error(`  ${path}`);
  console.error(`  ${advice}`);
  return true;
}

const clientGraph = await graphOf('client');
const outsideHost = new Set();
const hostGraph = await graphOf('host', outsideHost);

const clientBroken = report(
  '浏览器入口的 import 图里出现了宿主传输层',
  clientGraph,
  HOST_ONLY,
  '两个运行时不许互引（见 AGENTS.md 硬约束 3）。',
);
const hostBroken = report(
  '宿主入口的 import 图里出现了浏览器侧文件',
  hostGraph,
  CLIENT_ONLY,
  '宿主半侧不许碰 DOM / React（见 AGENTS.md 硬约束 3）。',
);

const sharedBrowserInHost = [...outsideHost]
  .filter((path) => path.includes('/shared/dist/components/'))
  .map((path) => path.slice(path.indexOf('/packages/shared/')));
if (sharedBrowserInHost.length > 0) {
  console.error('✖ 宿主入口的 import 图里出现了 shared 的浏览器组件：');
  for (const path of [...new Set(sharedBrowserInHost)]) console.error(`  ${path}`);
  console.error('  宿主侧请从 `@dsh-workbench/shared/host` 取（根入口是浏览器 barrel）。');
}

if (clientBroken || hostBroken || sharedBrowserInHost.length > 0) process.exit(1);

console.log(
  `✔ 运行时边界通过：浏览器侧 ${clientGraph.length} 个文件（无宿主传输层）·` +
    ` 宿主侧 ${hostGraph.length} 个文件（无浏览器侧）。`,
);
