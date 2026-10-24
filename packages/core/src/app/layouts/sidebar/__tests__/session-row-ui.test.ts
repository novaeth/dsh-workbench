import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { scrollEdgesOf } from '@/modules/sessions';

const HERE = new URL('../', import.meta.url);
const read = (name: string): string => readFileSync(new URL(name, HERE), 'utf8');

const VIEW = read('SessionList.tsx');
const CSS = read('../../../shared/styles/sidebar-app.css');

function rule(selector: string): string {
  const start = CSS.indexOf(`${selector} {`);
  return CSS.slice(start, CSS.indexOf('}', start));
}

describe('会话列表行的状态点：尺寸跟 dsh 官方那一行一致', () => {
  it('★ 不传 size：dsh 官方那行也没传 —— ongoing 走它 14px 的转圈，实心态才是 10px', () => {
    expect(VIEW).toContain('<StateDot state={primary.state} />');
    expect(VIEW).not.toMatch(/StateDot state=\{primary\.state\}[^/]*size/);
  });

  it('★ 槽位尺寸与 dsh 官方 Rows.module.css 里那条 slot 一致（16×20，行高 32）', () => {
    const slot = rule('.wb-sessionLeading');

    expect(slot).toMatch(/width:\s*var\(--wb-len-16\)/);
    expect(slot).toMatch(/height:\s*var\(--wb-len-20\)/);
  });
});

describe('会话行与 dsh 0.2.x 的官方行（ui-workspace / Rows）逐条对齐', () => {
  it('★ 行是树项：role="treeitem" + aria-selected；列表是 role="tree"（dsh 的 SessionNodeItem）', () => {
    expect(VIEW).toContain('role="treeitem"');
    expect(VIEW).toContain('aria-selected={active}');
    expect(VIEW).toContain('role="tree"');
    expect(VIEW).not.toContain('aria-current');
  });

  it('★ 空白会话不给时间与 ⋯，悬停卡里也不给时间（dsh 那三处都是 `!row.blank &&`）', () => {
    expect(VIEW.match(/node\.blank \? null : \(/g)).toHaveLength(3);
    expect(VIEW.match(/className="wb-sessionTime"/g)).toHaveLength(1);
    expect(VIEW.match(/className="wb-rowActions"/g)).toHaveLength(1);
  });

  it('★ 整行套 dsh 的 HoverCard：800ms、可复制，悬停槽只在卡里渲染', () => {
    expect(VIEW).toContain('<HoverCard');
    expect(VIEW).toContain('openDelayMs={800}');
    expect(VIEW).toContain("copyLabel={t('session.copy')}");
    expect(VIEW).toContain("copiedLabel={t('hover.copied')}");
    expect(VIEW).toContain("renderSlot('sidebar.session.row.hover', { sessionId: node.id })");
    expect(VIEW).toContain('relativeTimeAgo(node.updatedAt, t)');
  });

  it('★ 悬停卡里是各行自己的状态行：StateDot + 那句完整的话', () => {
    expect(VIEW).toContain('className="wb-sessionHoverStatus"');
    expect(rule('.wb-sessionHoverTitle')).toContain('--dsw-static-neutral-bluish-00');
    expect(rule('.wb-sessionHoverTime')).toContain('--dsw-static-neutral-bluish-300');
    expect(rule('.wb-sessionHoverStatus')).toContain('--dsw-static-neutral-bluish-400');
  });

  it('★ 等交互时尾格换成人话「待审批」，且那一格 aria-hidden（播报交给状态点）', () => {
    expect(VIEW).toContain('{trailing ?? relativeTimeCompact(node.updatedAt, t)}');
    expect(VIEW).toMatch(/aria-hidden=\{trailing === undefined \? undefined : true\}/);
  });

  it('★ 置顶排在时间之后，且是实心针（dsh：time → PinnedIndicator，IconPinFillRegular 14）', () => {
    expect(VIEW.indexOf('wb-sessionTime')).toBeGreaterThan(-1);
    expect(VIEW.indexOf('wb-sessionTime')).toBeLessThan(VIEW.indexOf('wb-sessionPin'));
    expect(VIEW).toContain('<IconPinFillRegular size={14} />');
    expect(VIEW).not.toContain('IconPinOutlineRegular');
    expect(rule('.wb-sessionPin')).toMatch(/color:\s*var\(--dsw-alias-label-caption\)/);
  });

  it('★ 行内动作排是 dsh 那一排：gap 15、⋯ 16×16 / radius xs / tertiary → 悬停 primary', () => {
    expect(rule('.wb-rowActions')).toMatch(/gap:\s*var\(--wb-len-15\)/);
    const button = rule('.wb-rowActions .wb-iconButton');
    expect(button).toMatch(/width:\s*var\(--wb-len-16\)/);
    expect(button).toMatch(/height:\s*var\(--wb-len-16\)/);
    expect(button).toMatch(/border-radius:\s*var\(--dsw-radius-xs\)/);
    expect(button).toMatch(/color:\s*var\(--dsw-alias-label-tertiary\)/);
    expect(rule('.wb-rowActions .wb-iconButton:hover')).toMatch(
      /color:\s*var\(--dsw-alias-label-primary\)/,
    );
  });

  it('★ 悬停时标题自己爬（dsh 的三条 mask + hover 下 text-overflow: clip）', () => {
    expect(VIEW).toContain('requestAnimationFrame');
    expect(VIEW).toContain("title.scrollTo({ left, behavior: 'instant' })");
    expect(VIEW).toContain('prefers-reduced-motion: reduce');
    expect(CSS).toContain('.wb-sessionTitle[data-scrolled] {');
    expect(CSS).toContain('.wb-sessionTitle[data-clipped] {');
    expect(CSS).toContain('.wb-sessionTitle[data-scrolled][data-clipped] {');
    expect(CSS).toMatch(
      /@media \(hover: hover\) \{\s*\.wb-sessionRow:hover \.wb-sessionTitle,[\s\S]*?text-overflow: clip;/,
    );
  });

  it('★ 行仍然不被压缩：flex 列里的每一项（HoverCard 的壳）都是 flex: none', () => {
    expect(rule('.wb-sessions > *')).toMatch(/flex:\s*none/);
    expect(rule('.wb-sessionRow')).toMatch(/flex:\s*none/);
  });
});

describe('滚动区两端的淡出：跟 dsh 的 TurnNavigator 同一套 24px mask', () => {
  it('★ 两端状态由滚动量算（scrollEdgesOf），挂在**滚动容器自己**的类上', () => {
    expect(VIEW).toContain('scrollEdgesOf');
    expect(VIEW).toContain('const edges = useScrollEdges(listRef, rows)');
    expect(VIEW).toContain("edges.canScrollUp && 'wb-fadeTop'");
    expect(VIEW).toContain("edges.canScrollDown && 'wb-fadeBottom'");
    expect(VIEW).toContain('ref={listRef}');
  });

  it('★ 滚动、容器尺寸、行数变化都要重算（否则到头了还挂着一层淡出）', () => {
    expect(VIEW).toContain("element.addEventListener('scroll', sync, { passive: true })");
    expect(VIEW).toContain('new ResizeObserver(sync)');
    expect(VIEW).toContain('}, [list, rows]);');
  });

  it('★ mask 三条齐（只上 / 只下 / 两端都有），淡出宽度 24px，不透明端用 --wb-static-mask-opaque', () => {
    const top = rule('.wb-sessions.wb-fadeTop');
    const bottom = rule('.wb-sessions.wb-fadeBottom');
    const both = rule('.wb-sessions.wb-fadeTop.wb-fadeBottom');

    expect(top).toContain('transparent 0');
    expect(top).toMatch(/var\(--wb-static-mask-opaque\) var\(--wb-len-24\)/);
    expect(bottom).toContain('transparent 100%');
    expect(bottom).toMatch(/calc\(100% - var\(--wb-len-24\)\)/);
    expect(both).toContain('transparent 0');
    expect(both).toContain('transparent 100%');
    expect(both).toMatch(/var\(--wb-static-mask-opaque\) var\(--wb-len-24\)/);
    expect(both).toMatch(/var\(--wb-static-mask-opaque\) calc\(100% - var\(--wb-len-24\)\)/);
  });

  it('★ 两端都没得滚时列表上没有 mask 类（内容短于视口 = 一点淡出都不该有）', () => {
    expect(rule('.wb-sessions')).not.toContain('mask-image');
    expect(scrollEdgesOf({ scrollTop: 0, scrollHeight: 200, clientHeight: 300 })).toEqual({
      canScrollUp: false,
      canScrollDown: false,
    });
  });
});
