import { describe, expect, it } from 'vitest';
import {
  asNumber,
  asRecord,
  asText,
  OUTPUT,
  plainJson,
  showOrReason,
  verdictOf,
  workspaceOf,
} from './diy-context';
import type { DshHostContext, DshToolRunContext, DshWorkspaceRecord } from '@dsh-workbench/shared';
import type { BundleChange } from '@/kernel/contract/bundle-install';
import type { PanelsService } from './service';

describe('工坊工具那一层共用的小东西', () => {
  it('参数取值：字符串去空格、数字认字符串写法、认不出的当没给', () => {
    expect(asText('  demo  ')).toBe('demo');
    expect(asText(42)).toBe('');
    expect(asNumber(3)).toBe(3);
    expect(asNumber('3.5')).toBe(3.5);
    expect(asNumber('  ')).toBeUndefined();
    expect(asNumber('abc')).toBeUndefined();
    expect(asRecord(null)).toEqual({});
    expect(asRecord({ a: 1 })).toEqual({ a: 1 });
  });

  it('★ 出去的形状必须是 lossless JSON：显式 undefined 会让整把工具判失败', () => {
    const value = { unit: 'demo', panel: { ok: true }, nothing: undefined };

    expect(JSON.stringify(plainJson(value))).not.toContain('nothing');
    expect(structuredClone(plainJson(value))).toStrictEqual(plainJson(value));
  });

  it('安装结果那句话按四支走（已生效 / 要重启 / 被盖住 / 取消 / 没装上）', () => {
    const change = (over: Partial<BundleChange>): BundleChange =>
      ({ application: 'applied', stage: 'install', changed: true, target: 'demo', ...over }) as BundleChange;

    expect(verdictOf(change({}))).toContain('已生效');
    expect(verdictOf(change({ application: 'restart-required' }))).toContain('要重启一次');
    expect(verdictOf(change({ application: 'overridden' }))).toContain('盖住');
    expect(verdictOf(change({ application: 'cancelled' }))).toContain('取消');
    expect(verdictOf(change({ application: 'failed', errorCode: 'boom' }))).toContain('没装上（boom）');
  });

  it('上板那一步失败不抛，把原因原样带出来（下一步才有话可说）', () => {
    const ok = { show: () => {} } as unknown as PanelsService;
    const bad = {
      show: () => {
        throw new Error('这个单元不在花名册里');
      },
    } as unknown as PanelsService;

    expect(showOrReason(ok, 'demo', '/w/a')).toEqual({ ok: true });
    expect(showOrReason(bad, 'demo', '/w/a')).toEqual({ ok: false, reason: '这个单元不在花名册里' });
  });

  it('输出的渲染口：拿 text 那一段，缺了才退回 JSON', () => {
    const rendered = OUTPUT.render({}, { text: '一句话', unit: 'demo' });
    expect(rendered).toEqual([{ type: 'text', text: '一句话' }]);
    expect(String(OUTPUT.render({}, { unit: 'demo' })[0]?.['text'])).toContain('"unit"');
  });
});

describe('DIY 落在这条会话登记的工作区上（不猜、不回落到工坊）', () => {
  const root = '/Users/x/项目/modules-repo';

  function ctxOf(record: DshWorkspaceRecord | undefined): DshHostContext {
    return {
      get: (name: string) =>
        name === 'workspaceRegistry'
          ? {
              resolveByPath: async (dir: string) => {
                if (record !== undefined && dir === record.path) return record;
                throw new Error(`ENOENT: ${dir}`);
              },
            }
          : undefined,
    } as unknown as DshHostContext;
  }

  function execAt(cwd: string): DshToolRunContext {
    return { agent: { session: { header: { cwd } } } } as unknown as DshToolRunContext;
  }

  it('★★ 取会话登记的根 —— cwd 在子目录里也落到工作区根', async () => {
    const ctx = ctxOf({ id: 'w1', path: root, title: 'modules-repo' });

    expect(await workspaceOf(ctx, execAt(`${root}/packages/module-inventory`))).toEqual({ root, title: 'modules-repo' });
  });

  it('★ 登记表里没有这条会话的根就如实拒，话说清要先选一个工作区', async () => {
    const ctx = ctxOf(undefined);

    await expect(workspaceOf(ctx, execAt('/Users/x/项目/没登记'))).rejects.toThrow(/登记工作区[\s\S]*选一个工作区/);
  });
});
