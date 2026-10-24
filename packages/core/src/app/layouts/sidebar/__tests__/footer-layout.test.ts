import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const HERE = new URL('../', import.meta.url);
const read = (name: string): string => readFileSync(new URL(name, HERE), 'utf8');

const RECORD = read('RecordFooterAction.module.css');
const DEBUG = read('DebugFooterAction.module.css');
const SHELL = read('../../../shared/styles/sidebar.css');

describe('左栏底部那两颗状态：各自占一行', () => {
  it('★★ 录制与调试各占一行（组件里每一格撑满一行 + 外壳容器可换行）', () => {
    for (const [who, sheet] of [
      ['录制', RECORD],
      ['调试', DEBUG],
    ] as const) {
      expect(sheet, `${who}那一格的 .slot 要撑满一行`).toMatch(/\.slot\s*\{[^}]*flex:\s*0 0 100%/);
      expect(sheet, `${who}那一格里的块也要撑满一行`).toMatch(/\.slot > \*\s*\{[^}]*flex:\s*0 0 100%/);
    }
    expect(SHELL).toContain('.wb-footerActions{display:flex;flex-wrap:wrap');
  });
});
