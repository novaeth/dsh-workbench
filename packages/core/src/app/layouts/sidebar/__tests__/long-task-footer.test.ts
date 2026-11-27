import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const HERE = new URL('../', import.meta.url);
const read = (name: string): string =>
  readFileSync(new URL(name, HERE), 'utf8').replaceAll('\r\n', '\n');

const ACTION = read('LongTaskFooterAction.tsx');
const SHELL = read('Sidebar.tsx');
const CLIENT = read('../../client.tsx');
const CSS = read('LongTaskFooterAction.module.css');

describe('左栏底部的长任务入口：一条入口 + 一张全局长任务表', () => {
  it('★★ 读的是全局长任务那一份，不另起一条轮询', () => {
    expect(ACTION).toContain('useShellLongTasks()');
    expect(ACTION).toContain('if (rows.length === 0) return null;');
  });

  it('★★ 按「工作区 → 单元」分组，每一条都复用外壳的长任务行（读 / 停 / 重查 / 回执全接好）', () => {
    expect(ACTION).toContain('new Map<string, Map<string, ShellLongTaskRow[]>>()');
    expect(ACTION).toContain('byWorkspace.get(row.workspace)');
    expect(ACTION).toContain('units.get(row.unit)');
    expect(ACTION).toContain('pathBase(workspace)');
    expect(ACTION).toContain('IconFolderCloseRegular');
    expect(ACTION).toContain('styles.units');
    expect(ACTION).toContain('styles.unitTitle');
    expect(ACTION).toContain('dense: true');
    expect(CSS).toContain('.units {');
    expect(CSS).toContain('padding-left: var(--wb-len-10)');
    expect(ACTION).toContain('h(SchemaLongTaskView, {');
    expect(ACTION).toContain('stopRouteOf(unit)');
    expect(ACTION).toContain('recheckRouteOf(unit)');
    expect(ACTION).toContain('answerRouteOf(unit)');
  });

  it('★★ 入口挂在左栏底部、排在调试那条之前；不新增槽位注册', () => {
    expect(SHELL).toContain('h(LongTaskFooterAction, { wide, t })');
    expect(SHELL.indexOf('h(LongTaskFooterAction')).toBeLessThan(
      SHELL.indexOf("renderSlot('sidebar.footer.action'"),
    );
    expect(CLIENT).not.toContain('registerLongTaskFooter');
  });

  it('★★ 等待人工处理时点升级成 warning；其余按六态取档（在跑 > 失败 > 完成 > 空闲）', () => {
    expect(ACTION).toContain("row.status === 'needs-human'");
    expect(ACTION).toContain('const states = rows');
    expect(ACTION).toContain("states.includes('ongoing')");
    expect(ACTION).toContain("states.includes('error')");
    expect(ACTION).toContain("states.includes('done')");
    expect(ACTION).toContain("? 'warning'");
  });

  it('★★ 打开面板、行渲染出来才记「看过」：收尾且没看过的行发一次 seen，去重', () => {
    expect(ACTION).toContain('export function ackableLongTaskRows');
    expect(ACTION).toContain('!longTaskIsLive(row.status) && row.seen !== true');
    expect(ACTION).toContain('if (!open) return;');
    expect(ACTION).toContain('seenRouteOf(row.unit)');
    expect(ACTION).toContain('acked.current.has(row.id)');
    expect(ACTION).toContain('acked.current.add(row.id)');
    expect(ACTION).toContain('if (!outcome.ok) acked.current.delete(row.id);');
  });

  it('★ 轮询按「有没有活任务」分档：有活 1.5 秒，全收尾 10 秒', () => {
    const hook = read('../../../shared/hooks/use-shell-long-tasks.ts');
    expect(hook).toContain('longTaskPollMs(rows.some((row) => longTaskIsLive(row.status)))');
  });

  it('★★ 宽态占满一整格：外壳撑满一行，行高 / 圆角跟底部那几格对齐', () => {
    expect(CSS).toMatch(/\.anchorWide\s*\{[^}]*flex:\s*0 0 100%/);
    expect(CSS).toMatch(/\.entryWide\s*\{[^}]*min-height:\s*var\(--wb-len-36\)/);
    expect(CSS).toMatch(/\.entryWide\s*\{[^}]*border-radius:\s*var\(--dsw-radius-md\)/);
    expect(ACTION).toContain('wide === true ? styles.anchorWide : styles.anchor');
  });
});
