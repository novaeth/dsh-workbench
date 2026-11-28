import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const unit = manifest?.dsh?.workbench?.unit;

if (unit !== 'fixture') {
  console.error(`module-fixture: 清单里的 unit 不是 fixture（${String(unit)}）`);
  process.exit(1);
}
