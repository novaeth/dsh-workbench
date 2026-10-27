import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inlinedShellRules } from '../css-shell.mjs';
import { discoverModulePackages } from '../discover.mjs';

const CLIENT_FORBIDDEN = [
  ['node 内置', /\bnode:[a-z]/],
  ['process.env（宿主环境）', /\bprocess\.env\b/],
  ['Buffer（Node 全局）', /\bBuffer\b/],
];

const HOST_FORBIDDEN = [
  ['DOM（document）', /\bdocument\./],
  ['DOM（window）', /\bwindow\./],
  ['react', /require\("react"\)/],
];

export const title = '模块产物边界';

const FIXTURE_MARKERS = [
  'wbMock',
  'wbCrash',
  'MockStrip',
  'useFixturePick',
  'mockModeOn',
  'crashModeOn',
  '-mock\'',
  '"*-mock"',
  'SCENES',
  'fixtureOf',
];

function fixtureMarkersIn(source) {
  return FIXTURE_MARKERS.filter((one) => source.includes(one));
}

export async function run() {
  const modulePackages = discoverModulePackages({ root: process.cwd() });
  const problems = [];
  let checked = 0;

  for (const pkg of modulePackages) {
    const name = pkg.manifest.name;
    const artifacts = [
      { what: '浏览器产物', file: 'client.js', rules: CLIENT_FORBIDDEN },
      { what: '宿主产物', file: 'dist/host.js', rules: HOST_FORBIDDEN },
    ];

    for (const artifact of artifacts) {
      const full = join(pkg.dir, artifact.file);
      if (!existsSync(full)) {
        problems.push(`${name}: 找不到${artifact.what} ${artifact.file} —— 先 build 再 check`);
        continue;
      }
      checked += 1;
      const source = readFileSync(full, 'utf8');
      for (const [label, pattern] of artifact.rules) {
        if (pattern.test(source)) {
          problems.push(
            `${name}: ${artifact.what} ${artifact.file} 里出现了${label} —— ` +
              `两个运行时混了（判据是能力：浏览器侧不许碰宿主传输层，宿主侧不许碰 DOM/react）`,
          );
        }
      }

      if (fixtureMarkersIn(source).length > 0) {
        const hits = fixtureMarkersIn(source);
        problems.push(
          `${name}: ${artifact.what} ${artifact.file} 里有夹具（${hits.slice(0, 4).join(' · ')}）—— ` +
            '模块不带夹具：夹具只服务工作台开发者的调试（发布产物里没有它），' +
            '模块自己的 vitest 把几态各喂一遍就够。',
        );
      }

      if (artifact.file === 'client.js') {
        const inlined = inlinedShellRules(source);
        if (inlined.length > 0) {
          problems.push(
            `${name}: ${artifact.what} ${artifact.file} 里内联了 ${inlined.length} 条外壳的 CSS 规则` +
              `（${inlined.slice(0, 3).join(' · ')}）—— 外壳的组件样式只有一份：` +
              'React 原语从 \'react\' 拿、外壳给的东西从 kit 拿（`@dsh-workbench/shared` 根入口是浏览器 barrel，' +
              '它会急切地把 components/** 连样式一起拉进来）。',
          );
        }
      }
    }
  }

  if (problems.length > 0) {
    return { status: 'fail', notes: [], problems };
  }
  if (modulePackages.length === 0) {
    return {
      status: 'skip',
      notes: ['没有模块包（没有声明 dsh.workbench 的包）—— 没有产物可查'],
      problems: [],
    };
  }
  return {
    status: 'pass',
    notes: [`${checked} 份产物 · 浏览器侧无 node 内置 · 宿主侧无 DOM/react · 浏览器侧没有内联的外壳 CSS`],
    problems: [],
  };
}
