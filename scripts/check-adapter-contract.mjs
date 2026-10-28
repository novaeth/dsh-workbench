import { adapterContractGaps } from '../packages/shared/dist/host.js';
import { createAdapterSet as defaultSet } from '../packages/adapters-default/dist/index.js';
import { createAdapterSet as chromeMcpSet } from '../packages/adapters-chrome-mcp/dist/index.js';

const ctx = { get: () => undefined };

const sets = [
  { name: '@dsh-workbench/adapters-default', make: () => defaultSet(ctx) },
  { name: '@dsh-workbench/adapters-chrome-mcp', make: () => chromeMcpSet(ctx, { server: 'chrome-devtools-mcp' }) },
];

let failed = 0;
for (const item of sets) {
  let set;
  try {
    set = item.make();
  } catch (error) {
    failed += 1;
    console.error(`✖ ${item.name} 造不出来：${error instanceof Error ? error.message : String(error)}`);
    continue;
  }
  const gaps = adapterContractGaps(set, ctx);
  if (gaps.length === 0) {
    console.log(`✔ ${item.name} 过契约（${set.id}@${set.version}）`);
    continue;
  }
  failed += 1;
  console.error(`✖ ${item.name} 不过契约：`);
  for (const gap of gaps) console.error(`  · ${gap}`);
}

if (failed > 0) {
  console.error(`✖ 适配器契约：${failed}/${sets.length} 份集合没通过`);
  process.exit(1);
}
console.log(`✔ 适配器契约：${sets.length} 份集合都通过同一份判据（成员 / 能力 / health / data / 布局）`);
