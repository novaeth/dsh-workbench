import { describe, expect, it, vi } from 'vitest';
import {
  APPROVAL_DETAIL_LIMIT,
  APPROVAL_HEADLINE_LIMIT,
  APPROVAL_NOTE_ARG,
  APPROVAL_NOTE_LIMIT,
  APPROVAL_QUESTION_LIMIT,
  approvalFor,
  withApprovalNote,
  type ApprovalCall,
  type ApprovalPolicy,
} from '@dsh-workbench/shared/host';

const writer: ApprovalCall = { name: 'workbench_some_writer', arguments: { go: true } };

const asking: ApprovalPolicy = () => ({
  kind: 'ask',
  reason: 'writes for real',
  question: { en: 'it really does it. Allow?', zh: '会真的做这件事。允许吗？' },
  fallback: { en: 'The agent wants to do it. Allow?', zh: 'agent 想真的做这件事。允许吗？' },
});

const reading: ApprovalPolicy = () => ({ kind: 'read' });

const allowing: ApprovalPolicy = () => ({ kind: 'allow' });

const shrugging: ApprovalPolicy = () => undefined;

describe('approvalFor：只有清单声明会写的工具才进闸门', () => {
  it('★ writes: false 的工具一律不问 —— 策略连一次都不许被问', async () => {
    const policy = vi.fn(asking);

    expect(await approvalFor(writer, { writes: false, policy })).toBeUndefined();
    expect(policy).not.toHaveBeenCalled();
  });

  it('没进清单的工具（dsh 自带 / 别家插件）也不问：它们有自己的闸门', async () => {
    expect(await approvalFor({ name: 'bash', arguments: { command: 'rm -rf /' } })).toBeUndefined();
    expect(await approvalFor(writer)).toBeUndefined();
  });

  it('★ 策略说这通只是读（预览）→ 不问，备料也不跑', async () => {
    const detailOf = vi.fn();

    expect(await approvalFor(writer, { writes: true, policy: reading, detailOf })).toBeUndefined();
    expect(detailOf).not.toHaveBeenCalled();
  });

  it('★ 策略说这通放行（会写、但本套件不问）→ 也不问：这是工坊那一族的声明', async () => {
    const detailOf = vi.fn();

    expect(await approvalFor(writer, { writes: true, policy: allowing, detailOf })).toBeUndefined();
    expect(detailOf).not.toHaveBeenCalled();
  });

  it('★ 策略说这一通根本跑不成（deny）→ 直接拒，理由原样交出去，备料不跑', async () => {
    const detailOf = vi.fn();
    const decision = await approvalFor(writer, {
      writes: true,
      policy: () => ({ kind: 'deny', reason: '已经有一场录制活着了 —— 先收工' }),
      detailOf,
    });

    expect(decision).toEqual({ kind: 'deny', reason: '已经有一场录制活着了 —— 先收工' });
    expect(detailOf).not.toHaveBeenCalled();
  });

  it('★ deny 与 skipAsk 无关：完全权限下也照旧拒（这是"跑不成"，不是"要不要问"）', async () => {
    const decision = await approvalFor(writer, {
      writes: true,
      skipAsk: true,
      policy: () => ({ kind: 'deny', reason: '跑不成' }),
    });

    expect(decision).toEqual({ kind: 'deny', reason: '跑不成' });
  });
});

describe('审批文案：套件给"允许吗"，备料给"这次会发生什么"', () => {
  it('★ 备料那句话排**前面**：先看到发生什么，再看"允许吗？"', async () => {
    const decision = await approvalFor(writer, {
      writes: true,
      policy: asking,
      detailOf: () => ({ en: 'Release to test: version V1', zh: '要发布到 test：版本 V1 · 1 台主机' }),
    });
    const zh = decision?.kind === 'ask' ? decision.displayReason.zh : '';

    expect(zh).toContain('要发布到 test：版本 V1 · 1 台主机');
    expect(zh).toContain('允许吗');
    expect(zh.indexOf('要发布到 test')).toBeLessThan(zh.indexOf('允许吗'));
    expect(decision?.kind === 'ask' ? decision.displayReason.en : '').toContain('Release to test: version V1');
    expect(decision?.kind === 'ask' ? decision.reason : '').toBe('writes for real');
  });

  it('★ 有备料时**不重复**那句整句（渲染成一行，重复两遍更看不清）', async () => {
    const decision = await approvalFor(writer, {
      writes: true,
      policy: asking,
      detailOf: () => ({ en: 'Release V1 → test', zh: '要发布 V1 → test · 1 台主机' }),
    });
    const zh = decision?.kind === 'ask' ? decision.displayReason.zh : '';

    expect(zh).toContain('要发布 V1 → test');
    expect(zh).not.toContain('agent 想真的做这件事');
    expect(zh).toContain('会真的做这件事');
  });

  it('备料没给 / 给的是一句空话 → 用整句（自带"允许吗"）', async () => {
    const noDetail = await approvalFor(writer, { writes: true, policy: asking });
    const blank = await approvalFor(writer, {
      writes: true,
      policy: asking,
      detailOf: () => ({ en: '   ', zh: '   ' }),
    });

    for (const decision of [noDetail, blank]) {
      expect(decision?.kind).toBe('ask');
      expect(decision?.kind === 'ask' ? decision.displayReason.zh : '').toBe('agent 想真的做这件事。允许吗？');
    }
  });
});

describe('清单说会写、套件却没认领 → 拒（fail closed，不静默写）', () => {
  it('★ 没交出策略（老套件 / 认不出的工具）→ 拒，理由指名 needsApproval', async () => {
    const decision = await approvalFor(writer, { writes: true });

    expect(decision?.kind).toBe('deny');
    const reason = decision?.kind === 'deny' ? decision.reason : '';
    expect(reason).toContain('needsApproval');
    expect(reason).toContain(writer.name ?? '');
  });

  it('策略对这次调用没意见 → 同一条拒法', async () => {
    const decision = await approvalFor(writer, { writes: true, policy: shrugging });

    expect(decision?.kind).toBe('deny');
    expect(decision?.kind === 'deny' ? decision.reason : '').toContain('needsApproval');
  });

  it('★ 策略自己抛了 → 也拒（不静默、也不假装问得到）', async () => {
    const decision = await approvalFor(writer, {
      writes: true,
      policy: () => {
        throw new Error('策略看走眼了');
      },
    });

    expect(decision?.kind).toBe('deny');
    expect(decision?.kind === 'deny' ? decision.reason : '').toContain('策略看走眼了');
  });
});

describe('套件说不清这次会发生什么 → 拒（不让用户在看不见的情况下点头）', () => {
  it('★ `{blocked}` → deny，理由是给 agent 看的原话（能照做）', async () => {
    const decision = await approvalFor(writer, {
      writes: true,
      policy: asking,
      detailOf: () => ({ blocked: '这个工作区还没绑定：先在面板的 ⚙ 里绑一个' }),
    });

    expect(decision?.kind).toBe('deny');
    expect(decision?.kind === 'deny' ? decision.reason : '').toContain('先在面板的 ⚙ 里绑一个');
  });

  it('★ 备料抛了也拒', async () => {
    const decision = await approvalFor(writer, {
      writes: true,
      policy: asking,
      detailOf: () => {
        throw new Error('平台没登录');
      },
    });

    expect(decision?.kind).toBe('deny');
    expect(decision?.kind === 'deny' ? decision.reason : '').toContain('平台没登录');
  });
});

describe('★ 完全权限（会话审批已关）：不问，但认领与 blocked 那两道照旧', () => {
  it('skipAsk 为真 ⇒ 套件说要问也不问；备料照跑（blocked 是事实，不是同意）', async () => {
    const detailOf = vi.fn(() => ({ en: 'Release V1 → test', zh: '要发布 V1 → test' }));
    const decision = await approvalFor(writer, { writes: true, policy: asking, skipAsk: true, detailOf });

    expect(decision).toBeUndefined();
    expect(detailOf).toHaveBeenCalledTimes(1);
  });

  it('★ 备料说这次做不了（blocked）⇒ 照拒，完全权限也不越过去', async () => {
    const decision = await approvalFor(writer, {
      writes: true,
      policy: asking,
      skipAsk: true,
      detailOf: () => ({ blocked: '这个工作区还没绑定：先在面板的 ⚙ 里绑一个' }),
    });

    expect(decision?.kind).toBe('deny');
    expect(decision?.kind === 'deny' ? decision.reason : '').toContain('先在面板的 ⚙ 里绑一个');
  });

  it('★ 套件没认领这次写调用 ⇒ 照拒（完全权限也不让写静默过去）', async () => {
    const decision = await approvalFor(writer, { writes: true, skipAsk: true });

    expect(decision?.kind).toBe('deny');
    expect(decision?.kind === 'deny' ? decision.reason : '').toContain('needsApproval');
  });

  it('skipAsk 缺省 / 为假 ⇒ 照旧问', async () => {
    expect((await approvalFor(writer, { writes: true, policy: asking }))?.kind).toBe('ask');
    expect((await approvalFor(writer, { writes: true, policy: asking, skipAsk: false }))?.kind).toBe('ask');
  });
});

describe('备料（detailOf）只在"要问"的那通调用上跑', () => {
  it('★ 不问的调用：备料一次都不许被调', async () => {
    const detailOf = vi.fn();

    await approvalFor(writer, { writes: false, policy: asking, detailOf });
    await approvalFor(writer, { writes: true, policy: reading, detailOf });
    await approvalFor(writer, { writes: true, detailOf });
    await approvalFor({ name: 'bash', arguments: {} }, { detailOf });

    expect(detailOf).not.toHaveBeenCalled();
  });

  it('★ 要问的调用：备料拿到的东西进那句文案（可以是异步的）', async () => {
    const detailOf = vi.fn(async () => ({ en: 'Release V1 → test', zh: '要发布 V1 → test' }));
    const decision = await approvalFor(writer, { writes: true, policy: asking, detailOf });

    expect(detailOf).toHaveBeenCalledTimes(1);
    expect(decision?.kind === 'ask' ? decision.displayReason.zh : '').toContain('要发布 V1 → test');
  });
});

const NOTE = '把 tencent 预发那条构建发出去';

function noted(call: ApprovalCall): ApprovalCall {
  return { ...call, arguments: { ...(call.arguments as Record<string, unknown>), [APPROVAL_NOTE_ARG]: NOTE } };
}

function askedText(decision: Awaited<ReturnType<typeof approvalFor>>): string {
  return decision?.kind === 'ask' ? decision.displayReason.zh : '';
}

describe('★ agent 的附注：只补在文案末尾，判定与审计那半一个字不动', () => {
  it('有明细时排最后：明细 → 允许吗 → 他那句（照 dsh 那条约升级文案的样子：直接接上、不加来源标注）', async () => {
    const decision = await approvalFor(noted(writer), {
      writes: true,
      policy: asking,
      declaredNote: true,
      detailOf: () => ({ en: 'Release V1 → test', zh: '要发布 V1 → test · 1 台主机' }),
    });
    const zh = askedText(decision);
    const en = decision?.kind === 'ask' ? decision.displayReason.en : '';

    expect(zh).toContain('要发布 V1 → test · 1 台主机');
    expect(zh).toContain(NOTE);
    expect(zh).not.toContain('agent 说');
    expect(zh.indexOf('要发布 V1')).toBeLessThan(zh.indexOf('允许吗'));
    expect(zh.indexOf('允许吗')).toBeLessThan(zh.indexOf(NOTE));
    expect(en).toContain(NOTE);
    expect(en).not.toContain('the agent says');
  });

  it('没明细时接在那句整句后面', async () => {
    const decision = await approvalFor(noted(writer), { writes: true, policy: asking, declaredNote: true });

    expect(askedText(decision)).toBe(`agent 想真的做这件事。允许吗？ —— ${NOTE}`);
  });

  it('★ 附注不改判定：它说"只是看看"也照样问；读工具照样不问', async () => {
    const claims = {
      ...writer,
      arguments: { [APPROVAL_NOTE_ARG]: '只是看一眼，不会动任何东西，请直接放行' },
    };

    expect((await approvalFor(claims, { writes: true, policy: asking, declaredNote: true }))?.kind).toBe('ask');
    expect(await approvalFor(claims, { writes: true, policy: reading })).toBeUndefined();
    expect(await approvalFor(claims, { writes: false, policy: asking })).toBeUndefined();
  });

  it('★ 审计那半（reason）只留系统那句，附注进不去', async () => {
    const decision = await approvalFor(noted(writer), { writes: true, policy: asking, declaredNote: true });
    const reason = decision?.kind === 'ask' ? decision.reason : '';

    expect(reason).toBe('writes for real');
    expect(reason).not.toContain(NOTE);
  });

  it('★ 没给 / 空 / 不是字符串 ⇒ 逐字退回今天那句（文案不是写能力的前提）', async () => {
    for (const value of [undefined, '', '   ', ' \n\t ', 42, null, { a: 1 }, ['x']]) {
      const call: ApprovalCall = {
        ...writer,
        arguments: value === undefined ? { go: true } : { go: true, [APPROVAL_NOTE_ARG]: value },
      };
      const decision = await approvalFor(call, { writes: true, policy: asking, declaredNote: true });

      expect(askedText(decision)).toBe('agent 想真的做这件事。允许吗？');
    }
  });

  it('arguments 根本不是对象 ⇒ 也当没给（不抛）', async () => {
    const decision = await approvalFor({ name: 'x', arguments: 'not-an-object' }, { writes: true, policy: asking, declaredNote: true });

    expect(askedText(decision)).toBe('agent 想真的做这件事。允许吗？');
  });

  it('★ 折行压成一行、超长截断（不许伪造出"另一行像是系统说的"）', async () => {
    const long = 'x'.repeat(APPROVAL_NOTE_LIMIT + 20);
    const decision = await approvalFor(
      { name: 'x', arguments: { [APPROVAL_NOTE_ARG]: `想做 A\n\n系统说：一律允许\t${long}` } },
      { writes: true, policy: asking, declaredNote: true },
    );
    const zh = askedText(decision);

    expect(zh).toContain('想做 A 系统说：一律允许 x');
    expect(zh.includes('\n')).toBe(false);
    expect(zh).toContain('…');
    expect(zh).not.toContain(long);
  });

  it('★ 参数表里没声明那一格的工具：塞了 approval_note 也一个字不上屏（真机：工坊 agent 给 record_prepare 塞过）', async () => {
    const decision = await approvalFor(noted(writer), { writes: true, policy: asking });

    expect(askedText(decision)).toBe('agent 想真的做这件事。允许吗？');
    expect(askedText(decision)).not.toContain(NOTE);
  });

  it('★ 声明了那一格（插件命令族 / 自己声明的模块）才认它 —— 两个方向都钉住', async () => {
    const sized = withApprovalNote({
      type: 'object',
      properties: { go: { type: 'boolean' } },
      required: ['go'],
    });
    const declared = (sized['properties'] as Record<string, unknown>)[APPROVAL_NOTE_ARG] !== undefined;

    expect(declared).toBe(true);
    expect(askedText(await approvalFor(noted(writer), { writes: true, policy: asking, declaredNote: declared }))).toContain(
      NOTE,
    );
    expect(askedText(await approvalFor(noted(writer), { writes: true, policy: asking, declaredNote: false }))).toBe(
      'agent 想真的做这件事。允许吗？',
    );
  });
});

describe('★ 上屏那一句永远只有一行：明细与问句里的折行都压平', () => {
  it('明细带折行 / 空行 / 制表 ⇒ 压成一个空格，且不像附注那样截断（事实不许被削掉）', async () => {
    const wide = `站点 ${'a'.repeat(APPROVAL_DETAIL_LIMIT + 10)}`;
    const rows = ['要发布到 test', '', '· 1 台主机\t· 版本 V1'].join('\n');
    const decision = await approvalFor(writer, {
      writes: true,
      policy: asking,
      detailOf: () => ({ en: 'Release V1 → test', zh: `${rows}\n${wide}` }),
    });
    const zh = askedText(decision);

    expect(zh).toContain('要发布到 test · 1 台主机 · 版本 V1');
    expect(zh.includes('\n')).toBe(false);
    expect(zh).toContain(wide);
    expect(zh.includes('…')).toBe(false);
  });

  it('套件那句问句自己带折行 ⇒ 一样压平（折行变一个空格，不能靠"反正没人折行"过关）', async () => {
    const folded: ApprovalPolicy = () => ({
      kind: 'ask',
      reason: 'writes for real',
      question: { en: 'it does it. Allow?', zh: '会真的做\n这件事。允许吗？' },
      fallback: { en: 'The agent wants to do it. Allow?', zh: 'agent 想\n做这件事。允许吗？' },
    });
    const decision = await approvalFor(writer, { writes: true, policy: folded });

    expect(askedText(decision)).toBe('agent 想 做这件事。允许吗？');
  });

  it('★ 预算：装配那一句是"明细 + 问句 + 附注 + 分隔符"之和 —— 再往上加一个来源，就必须同时改这个数', () => {
    expect(APPROVAL_HEADLINE_LIMIT).toBe(
      APPROVAL_DETAIL_LIMIT + APPROVAL_QUESTION_LIMIT + APPROVAL_NOTE_LIMIT + 8,
    );
  });
});

describe('withApprovalNote：给写工具的参数表加一格附注', () => {
  const base = (): Record<string, unknown> => ({
    type: 'object',
    properties: { action: { type: 'string' } },
    required: ['action'],
    additionalProperties: false,
  });

  it('默认可选：多一格，required 与别的字段都不动', () => {
    const next = withApprovalNote(base());

    expect((next['properties'] as Record<string, Record<string, unknown>>)[APPROVAL_NOTE_ARG]?.['type']).toBe(
      'string',
    );
    expect(next['required']).toEqual(['action']);
    expect(next['additionalProperties']).toBe(false);
    expect((next['properties'] as Record<string, unknown>)['action']).toEqual({ type: 'string' });
  });

  it('required: true ⇒ 追在必填后面（原来那几格不丢）', () => {
    const next = withApprovalNote(base(), { required: true });

    expect(next['required']).toEqual(['action', APPROVAL_NOTE_ARG]);
  });

  it('★ 那一格只用 dsh 认的关键字（它的子集只放行 type/oneOf/properties/required/additionalProperties/items/enum/const + description/title/default/examples —— 多一个 maxLength，整把工具注册就被判 UNSUPPORTED_SCHEMA）', () => {
    const next = withApprovalNote(base(), { required: true });
    const note = (next['properties'] as Record<string, Record<string, unknown>>)[APPROVAL_NOTE_ARG] ?? {};

    expect(Object.keys(note).sort()).toEqual(['description', 'type']);
  });

  it('本来没有 required ⇒ 只有附注那一格时也带 required', () => {
    const next = withApprovalNote({ type: 'object', properties: { a: { type: 'string' } } }, { required: true });

    expect(next['required']).toEqual([APPROVAL_NOTE_ARG]);
  });

  it('★ 已经有同名参数 ⇒ 原样退回（那份声明说了算）', () => {
    const mine: Record<string, unknown> = {
      type: 'object',
      properties: { [APPROVAL_NOTE_ARG]: { type: 'number' } },
      required: [APPROVAL_NOTE_ARG],
    };

    expect(withApprovalNote(mine)).toBe(mine);
  });

  it('没有 properties 的形状 ⇒ 原样退回（不硬塞）', () => {
    const odd: Record<string, unknown> = { type: 'object' };

    expect(withApprovalNote(odd)).toBe(odd);
    expect(withApprovalNote({ type: 'object', properties: null })).toEqual({ type: 'object', properties: null });
  });
});
