import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const API_VERSION = 3;

const DEFAULT_FACES = { host: 'src/host.ts', client: 'src/client.tsx' };

export async function migrate({ root, args = [] }) {
  const dryRun = args.includes('--dry-run');
  const file = join(root, 'package.json');
  if (!existsSync(file)) {
    console.error(`这里没有 package.json：${root}`);
    process.exit(2);
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`package.json 不是合法 JSON：${error.message}`);
    process.exit(2);
  }

  const dsh = manifest.dsh;
  const workbench = dsh?.workbench;
  if (workbench === undefined) {
    console.error('这个包没声明 dsh.workbench：先 cd 到模块目录再跑（或加 --cwd <模块目录>）');
    process.exit(2);
  }

  const changes = [];
  if (workbench.apiVersion !== API_VERSION) {
    changes.push(`dsh.workbench.apiVersion：${JSON.stringify(workbench.apiVersion)} → ${String(API_VERSION)}`);
    workbench.apiVersion = API_VERSION;
  }

  if (dsh.workbenchFaces === undefined) {
    changes.push(`dsh.workbenchFaces：补默认 ${DEFAULT_FACES.host} / ${DEFAULT_FACES.client}`);
    dsh.workbenchFaces = { ...DEFAULT_FACES };
  } else {
    for (const [kind, fallback] of Object.entries(DEFAULT_FACES)) {
      if (typeof dsh.workbenchFaces[kind] === 'string' && dsh.workbenchFaces[kind] !== '') continue;
      changes.push(`dsh.workbenchFaces.${kind}：补 ${fallback}`);
      dsh.workbenchFaces[kind] = fallback;
    }
  }

  for (const [kind, rel] of Object.entries(dsh.workbenchFaces)) {
    if (!existsSync(join(root, rel))) {
      console.warn(`⚠ workbenchFaces.${kind} 指的 ${rel} 不存在 —— 先把这个入口建出来`);
    }
  }

  if (changes.length === 0) {
    console.log('已经是当前代：清单不用改。');
  } else if (dryRun) {
    console.log(`会改 ${String(changes.length)} 处（--dry-run 没写）：`);
    for (const one of changes) console.log(`  · ${one}`);
  } else {
    writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`改好 ${String(changes.length)} 处：`);
    for (const one of changes) console.log(`  · ${one}`);
  }

  if (workbench.card === null || workbench.card === undefined) {
    console.log('清单 card 是 null / 缺：如果 client.js 真登记了卡，跑 `check --only cards` 看 —— 补 `"card": { "order": … }` 或去掉那张卡的登记。');
  }
  console.log('源码类迁移不自动改：`check` 会逐条点名（kit 成员、裸控件、apiVersion 之外的协议字段），照提示改源码。');
}
