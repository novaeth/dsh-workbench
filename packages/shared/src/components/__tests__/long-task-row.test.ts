import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const HERE = new URL('../', import.meta.url);
const read = (name: string): string => readFileSync(new URL(name, HERE), 'utf8');

const ROW = read('LongTaskRow.tsx');
const CSS = read('LongTaskRow.css');

describe('两按停止钮：接线（这仓的组件测试是 node 环境，读源码断言）', () => {
  it('★★ 不给 stop ⇒ 那颗钮整个不出现；文件里也再没有第二颗 button', () => {
    const gate = ROW.indexOf('{stop === undefined ? null : (');
    const button = ROW.indexOf('<button');

    expect(ROW).toContain('const stop = props.stop;');
    expect(gate).toBeGreaterThan(0);
    expect(button).toBeGreaterThan(gate);
    expect(ROW.indexOf('<button', button + 1)).toBe(-1);
  });

  it('★★ 住在 .wb-longTaskHead 里、最右边那颗（margin-left: auto）', () => {
    const head = ROW.indexOf('className="wb-longTaskHead"');
    const button = ROW.indexOf('<button');
    const close = ROW.indexOf('</p>', button);

    expect(head).toBeGreaterThan(0);
    expect(button).toBeGreaterThan(head);
    expect(close).toBeGreaterThan(button);
    expect(CSS).toContain('margin-left: auto');
  });

  it('★★ 两按只走 longTaskStopPress(longTaskStopStage({ armed, busy }))：arm 上膛 / fire 落膛并 onStop / ignore 不动', () => {
    expect(ROW).toContain('longTaskStopPress(longTaskStopStage({ armed, busy }))');
    expect(ROW).toContain('onClick={onStopPress}');
    expect(ROW).toContain("if (press === 'ignore') return;");
    expect(ROW).toContain("if (press === 'arm') {");
    expect(ROW).toContain('setArmed(true);');
    expect(ROW).toMatch(/setArmed\(false\);\s*stop\.onStop\(\);/);
  });

  it('★★ onBlur 落膛（焦点一走就退回没上膛）', () => {
    expect(ROW).toContain('onBlur={() => setArmed(false)}');
  });

  it('★★ 上膛后 3 秒自己落膛：用 LONG_TASK_STOP_ARM_MS，卸载 / 落膛都清掉计时器', () => {
    expect(ROW).toContain("from '../api/long-task.js'");
    expect(ROW).toContain('setTimeout(() => setArmed(false), LONG_TASK_STOP_ARM_MS)');
    expect(ROW).toContain('clearTimeout(timer)');
    expect(ROW).toContain('}, [armed]);');
  });

  it('★★ data-stop-state 交出那一档（照 dsh 的 data-kill-state）', () => {
    expect(ROW).toContain('data-stop-state={longTaskStopStage({ armed, busy })}');
  });

  it('★★ busy 时 disabled；上膛时多一个 span 显示 askLabel；三句词全部由调用点给', () => {
    expect(ROW).toContain('const busy = stop?.busy === true;');
    expect(ROW).toContain('disabled={busy}');
    expect(ROW).toContain('<span className="wb-longTaskStopLabel">{stop.askLabel}</span>');
    expect(ROW).toContain('aria-label={armed ? stop.armedLabel ?? stop.askLabel : stop.label}');
    expect(ROW).toContain('<IconStopFillRegular size={12} />');
    expect(ROW).toContain('type="button"');
    expect(ROW).not.toContain('Translate');
  });

  it('★★ failed 非空 ⇒ 在 problem 那行后面再画一行（wb-longTaskStopWhy）', () => {
    const problem = ROW.indexOf('className="wb-longTaskProblem"');
    const why = ROW.indexOf('className="wb-longTaskStopWhy"');

    expect(ROW).toContain("const stopWhy = stop?.failed ?? '';");
    expect(ROW).toContain('className="wb-longTaskStopWhy">{stopWhy}');
    expect(problem).toBeGreaterThan(0);
    expect(why).toBeGreaterThan(problem);
  });

  it('★★ 没有 stop 的行一个像素都不变：既要的规则一个字没动，新规则也只在带钮的行上起作用', () => {
    expect(CSS).toContain('.wb-longTaskHeadline {\n  margin: 0;');
    expect(CSS).toContain('.wb-longTaskLink {\n  flex: none;\n}');
    expect(CSS).toContain('.wb-longTaskHead {');
  });
});

describe('两按停止钮：样式跟 dsh 那颗钮同款（组件自带，同目录一份 .css）', () => {
  it('★★ 四个类都在同目录那份 .css 里', () => {
    for (const cls of [
      '.wb-longTaskStop {',
      '.wb-longTaskStopArmed,',
      '.wb-longTaskStopLabel {',
      '.wb-longTaskStopWhy {',
    ]) {
      expect(CSS).toContain(cls);
    }
  });

  it('★★ 上膛变宽（width: auto），取值照 dsh：error 45% 边框 + 12% 底 + gap 4 + padding 0 7px', () => {
    expect(CSS).toMatch(/\.wb-longTaskStopArmed[\s\S]*width: auto/);
    expect(CSS).toContain('color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, transparent)');
    expect(CSS).toContain('color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent)');
    expect(CSS).toContain('gap: var(--wb-len-4)');
    expect(CSS).toContain('padding: 0 var(--wb-len-7)');
  });

  it('★★ 上膛那颗字 11px / 18px；失败那行 error 色', () => {
    expect(CSS).toContain('font-size: var(--dsw-font-xxxs-11-font-size)');
    expect(CSS).toContain('line-height: var(--wb-line-18)');
    expect(CSS).toMatch(/\.wb-longTaskStopWhy \{[\s\S]*--dsw-alias-state-error-primary/);
  });

  it('★ 一格注释都没有，颜色不写字面值（尺寸走 --wb-len-*）', () => {
    expect(CSS).not.toContain('/*');
    expect(CSS).not.toContain('#');
    expect(CSS).toContain('var(--wb-len-20)');
    expect(CSS).not.toMatch(/(^|[^a-z-])rgb\(/);
  });
});
