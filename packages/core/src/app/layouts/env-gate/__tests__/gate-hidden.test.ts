import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const TOGGLED = ['actions', 'commandRow', 'bridge'];
const SRC = path.resolve(__dirname, '../../../../');

function allCss(dir: string): string {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      if (entry.name === 'node_modules') return [];
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return allCss(full);
      return entry.name.endsWith('.css') ? [fs.readFileSync(full, 'utf8')] : [];
    })
    .join('\n');
}

describe('gate 的 hidden 语义', () => {
  const css = allCss(SRC);

  for (const className of TOGGLED) {
    it(`.${className}[hidden] 在样式表里有 display:none`, () => {
      const rule = new RegExp(`\\.${className}\\[hidden\\][^{]*\\{[^}]*display:\\s*none`, 's');
      expect(css).toMatch(rule);
    });
  }
});
