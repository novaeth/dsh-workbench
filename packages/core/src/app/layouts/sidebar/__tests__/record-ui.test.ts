import { readFileSync } from 'node:fs';
import type { RecordState } from '@dsh-workbench/shared/host';
import { describe, expect, it } from 'vitest';
import type { Translate } from '@dsh-workbench/shared';
import { zh } from '@dsh-workbench/shared';

import { recordFooterView } from '../RecordFooterAction';
import { RECORD_FOOTER_ID, RECORD_FOOTER_ORDER } from '../record-footer';
import { DIY_RECORD_FACT, DIY_RECORD_ROUTE } from '@/shared/hooks/use-diy-record';

const HERE = new URL('../', import.meta.url);
const read = (name: string): string => readFileSync(new URL(name, HERE), 'utf8');

const FOOTER = read('RecordFooterAction.tsx');
const FOOTER_CSS = read('RecordFooterAction.module.css');
const REGISTER = read('record-footer.tsx');
const HOOK = read('../../../shared/hooks/use-diy-record.ts');
const CLIENT = read('../../../app/client.tsx');

const t: Translate = (key, params) => {
  const template = (zh as Record<string, string>)[key] ?? key;
  return Object.entries(params ?? {}).reduce(
    (text, [name, value]) => text.replace(`{${name}}`, String(value)),
    template,
  );
};

const state = (over: Partial<RecordState> = {}): RecordState => {
  const now = Date.now();
  return {
    phase: 'armed',
    sessionId: 's1',
    workspace: '/w/workbench/diy',
    unit: 'inventory',
    name: 'Inventory',
    url: 'https://inventory.example.com/env',
    title: '',
    action: '发布',
    expect: null,
    captureFile: '/w/workbench/diy/shots/rec-inventory.jsonl',
    startedAt: now,
    t0: null,
    t1: null,
    shots: [],
    shotsSeen: 0,
    shotTries: null,
    beats: 0,
    beatMs: 0,
    at: now,
    ...over,
  };
};

describe('左栏底部那一格：四态各说各的话', () => {
  it('★★ 等他出手 ⇒ "取证交接 · 等你出手" + 请他按开始/结束，只有「取消」', () => {
    const view = recordFooterView(state(), t);

    expect(view.label).toBe('取证交接 · 等你出手');
    expect(view.note).toContain('开始录制');
    expect(view.note).toContain('结束录制');
    expect(view.acts.map((one) => one.intent)).toEqual(['stop']);
    expect(view.acts[0]?.label).toBe('取消');
  });

  it('★★ 录制中 ⇒ 「停」（浮条被导航干掉时的逃生口），指引说清"先取再收"', () => {
    const view = recordFooterView(state({ phase: 'recording', t0: 1000 }), t);

    expect(view.label).toBe('录制中');
    expect(view.note).toContain('先取再收');
    expect(view.acts.map((one) => one.intent)).toEqual(['halt']);
    expect(view.acts[0]?.label).toBe('停');
  });

  it('★★ 录制中 + 拍过 ⇒ 那句里并上张数；没拍过 ⇒ 那半句一个字都不出现（不许"已拍 0 张"）', () => {
    const none = recordFooterView(state({ phase: 'recording', t0: 1000 }), t);
    expect(none.note).not.toContain('已拍');
    expect(none.label).toBe('录制中');
    expect(none.acts.map((one) => one.intent)).toEqual(['halt']);

    const one = recordFooterView(
      state({ phase: 'recording', t0: 1000, shots: [{ n: 1, at: 5, path: '/w/shots/rec-shot-inventory-1.png' }] }),
      t,
    );
    expect(one.note).toContain('「截图」');
    expect(one.note).toContain('已拍 1 张');
    expect(one.label).toBe('录制中');
    expect(one.acts.map((one) => one.intent)).toEqual(['halt']);

    const two = recordFooterView(
      state({
        phase: 'recording',
        t0: 1000,
        shots: [
          { n: 1, at: 5, path: '/w/shots/rec-shot-inventory-1.png' },
          { n: 2, at: 9, path: '/w/shots/rec-shot-inventory-2.png', error: 'opencli 报了个错' },
        ],
      }),
      t,
    );
    expect(two.note).toContain('已拍 2 张');
  });

  it('★★ 那一句只归「录制中」：等在那一页（armed）时不许带张数（他还没地方按截图）', () => {
    const view = recordFooterView(
      state({ shots: [{ n: 1, at: 5, path: '/w/shots/rec-shot-inventory-1.png' }] }),
      t,
    );
    expect(view.note).not.toContain('已拍');
  });

  it('★★ 录完 ⇒ 只报状态、一颗键都没有（agent 自己来取、自己收工）', () => {
    const view = recordFooterView(state({ phase: 'finished', t0: 1000, t1: 2000 }), t);

    expect(view.label).toBe('录制完成');
    expect(view.acts).toEqual([]);
    expect(view.note).not.toContain('看结果');
    expect(view.note).not.toContain('「收工」');
  });

  it('★★ 没有那一场 ⇒ 整个不渲染（回 null，不留空行）', () => {
    expect(FOOTER).toContain('if (state === null) return null;');
  });

  it('★★ hook 一律在早退之前（否则第一帧与第二帧的 hook 数不一样 ⇒ 整格被摘掉）', () => {
    const early = FOOTER.indexOf('if (state === null) return null;');
    expect(early).toBeGreaterThan(0);
    for (const hook of ['useDiyRecordState()', 'useDiyRecordAct()']) {
      const at = FOOTER.indexOf(hook);
      expect(at).toBeGreaterThan(0);
      expect(at).toBeLessThan(early);
    }
  });

  it('★★ 展开态用 tooltip 说指引、那一行只说状态；折叠轨才用浮层', () => {
    expect(FOOTER).toContain('<Tip');
    expect(FOOTER).toContain('<HoverCard');
    expect(FOOTER).toContain('styles.entryLine');
    expect(FOOTER).toContain('{view.label}');
  });

  it('★★ 两颗色：等出手 / 录制中黄（在等他），录完绿；只有黄的那两态呼吸', () => {
    expect(FOOTER).toContain("state.phase === 'finished' ? 'done' : 'warning'");
    expect(FOOTER).toContain("state.phase === 'armed' ? styles.pulse : undefined");
    expect(FOOTER_CSS).toContain('--dsw-alias-state-warn-primary');
    expect(FOOTER_CSS).toContain('--dsw-alias-state-success-primary');
    expect(FOOTER_CSS).toContain('@keyframes wb-record-breathe');
    expect(FOOTER_CSS).toContain('prefers-reduced-motion');
    expect(FOOTER).not.toContain('<svg');
  });

  it('★★ 形状跟侧栏自己的行同款（36 高、radius md、margin 0 var(--wb-len-2)、padding var(--wb-len-7) var(--wb-len-8)）', () => {
    expect(FOOTER_CSS).toContain('min-height: var(--wb-len-36)');
    expect(FOOTER_CSS).toContain('border-radius: var(--dsw-radius-md)');
    expect(FOOTER_CSS).toContain('margin: 0 var(--wb-len-2)');
    expect(FOOTER_CSS).toContain('padding: var(--wb-len-7) var(--wb-len-8)');
  });

  it('★ 那一行放不下就省略号，不换行；折叠轨里退成一颗 36×36 的圆点', () => {
    expect(FOOTER_CSS).toContain('text-overflow: ellipsis');
    expect(FOOTER_CSS).toContain('white-space: nowrap');
    expect(FOOTER_CSS).toContain('border-radius: 50%');
    expect(FOOTER).toContain('actionRail');
  });

  it('★★ 这一格只读状态 + 三个键是**用户自己按**的：不许出现工具名，也不许伪造用户消息', () => {
    expect(FOOTER).not.toContain('workbench_diy_record');
    expect(FOOTER).toContain('role="status"');
    expect(FOOTER).toContain('act.send({ intent: one.intent })');
    expect(FOOTER).not.toContain("role: 'user'");
    expect(HOOK).not.toContain("role: 'user'");
    expect(HOOK).toContain('useHostWrite<{ text?: string }>(');
  });

  it('★★ 屏是用户的：这一格不切工作区、不代他动屏（没有 useEffect）', () => {
    expect(FOOTER).not.toContain('selectProject');
    expect(FOOTER).not.toContain('useEffect');
    expect(REGISTER).not.toContain('selectProject');
  });

  it('★★ 登记进 sidebar.footer.action：id 与 order 写死（排在调试那一格后面），不注入任何"能动手"的东西', () => {
    expect(RECORD_FOOTER_ID).toBe('workbench-record');
    expect(RECORD_FOOTER_ID).not.toBe('workbench-debug');
    expect(RECORD_FOOTER_ORDER).toBeGreaterThan(0);
    expect(REGISTER).toContain('registerRecordFooter');
    expect(REGISTER).toContain("ctx.slots.inject('sidebar.footer.action'");
    expect(REGISTER).toContain('order: RECORD_FOOTER_ORDER');
    expect(REGISTER).toContain('locale: LOCALE_NS');
    expect(REGISTER).not.toContain('inject:');
    expect(CLIENT).toContain('registerRecordFooter(ctx)');
  });
});

describe('读宿主那条只读路由：走唯一那条读路径，不冒充面板取数', () => {
  it('★★ 路由与事实名各一处真相，且显式关掉"面板取数上报"', () => {
    expect(DIY_RECORD_ROUTE).toBe('panels/diy-record');
    expect(DIY_RECORD_FACT).toBe('diy-record');
    expect(HOOK).toContain('useApiResource');
    expect(HOOK).toContain('report: false');
    expect(HOOK).not.toContain('apiGet');
  });

  it('★★ 刷新中不许回 null：那一格会先卸载再挂回来 ⇒ 整条闪一下', () => {
    expect(HOOK).toContain('if (read.value === undefined) return null;');
    expect(HOOK).not.toContain("if (read.phase !== 'ready') return null;");
  });
});
