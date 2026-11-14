import { describe, expect, it } from 'vitest';
import { createSeam } from '@dsh-workbench/shared/host';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import type { RequestPlan, SubmitPlanOptions } from '@dsh-workbench/shared/host';
import { createDataReader } from '../index.js';

const origin = 'https://oa.example.com';

const plan: RequestPlan = {
  origin,
  steps: [
    {
      name: 'create',
      request: { method: 'POST', path: '/api/create', body: { title: 'x' } },
      response: { kind: 'json', path: 'id' },
    },
    {
      name: 'update',
      request: { method: 'POST', path: '/api/update', body: { id: '{{create}}', state: 'done' } },
      response: { kind: 'json' },
    },
  ],
};

function readerOf(
  replies: Parameters<typeof createFakeShell>[0],
  extra: { saveBytes?: (input: { data: Uint8Array; contentType: string; name: string }) => Promise<unknown> } = {},
) {
  const fake = createFakeShell(replies);
  return {
    fake,
    reader: createDataReader({
      seam: createSeam({ shell: fake.shell, runtimeRoot: '/tmp/wb-submit' }),
      channel: false,
      ...extra,
    }),
  };
}

function optionsOf(overrides: Partial<SubmitPlanOptions> = {}): SubmitPlanOptions {
  return {
    idempotencyKey: 'idem-1',
    confirm: () => true,
    ...overrides,
  };
}

describe('DataReader.submitPlan', () => {
  it('逐步确认、写、保存前一步结果；带幂等键', async () => {
    const { fake, reader } = readerOf([
      { stdout: JSON.stringify({ ok: true, steps: { create: { ok: true, value: 'c-1' } } }) },
      { stdout: JSON.stringify({ ok: true, steps: { update: { ok: true, value: { done: true } } } }) },
    ]);
    const confirmed: string[] = [];
    const events: string[] = [];
    const out = await reader.submitPlan(plan, optionsOf({
      confirm: (step) => {
        confirmed.push(step.name);
        return true;
      },
      onStep: (step) => events.push(step.name),
    }));

    expect(confirmed).toEqual(['create', 'update']);
    expect(events).toEqual(['create', 'update']);
    expect(out['create']).toMatchObject({ ok: true, data: 'c-1' });
    expect(out['update']).toMatchObject({ ok: true, data: { done: true } });
    expect(fake.commands()).toHaveLength(2);
    const scripts = fake.commands();
    expect(scripts[0]).toContain('Idempotency-Key');
    expect(scripts[0]).toContain('idem-1:create');
    expect(scripts[1]).toContain('"create":{"value":"c-1"}');
  });

  it('写计划的 bytes 响应也能落附件', async () => {
    const saved: Array<{ data: Uint8Array; contentType: string; name: string }> = [];
    const { reader } = readerOf(
      [
        {
          stdout: JSON.stringify({
            ok: true,
            steps: { create: { ok: true, value: { base64: 'aGk=', size: 2, contentType: 'text/plain' } } },
          }),
        },
      ],
      {
        saveBytes: async (input) => {
          saved.push(input);
          return { attachmentId: 'a-1' };
        },
      },
    );
    const out = await reader.submitPlan(
      { ...plan, steps: [{ ...plan.steps[0]!, response: { kind: 'bytes', saveAs: 'attachment' } }] },
      optionsOf({ confirm: () => true }),
    );
    expect(saved).toHaveLength(1);
    expect(Buffer.from(saved[0]!.data).toString('utf8')).toBe('hi');
    expect(out['create']).toMatchObject({ ok: true, data: { attachmentId: 'a-1' } });
  });

  it('确认返回 false：不写，后面标 skipped', async () => {
    const { fake, reader } = readerOf([]);
    let calls = 0;
    const out = await reader.submitPlan(plan, optionsOf({
      confirm: () => {
        calls += 1;
        return false;
      },
    }));
    expect(calls).toBe(1);
    expect(fake.commands()).toEqual([]);
    expect(out['create']).toMatchObject({ ok: false, error: { code: 'skipped', pageCode: 'declined' } });
    expect(out['update']).toMatchObject({ ok: false, error: { code: 'skipped' } });
  });

  it('GET / 分页在写计划里直接拒', async () => {
    const { reader } = readerOf([]);
    const bad: RequestPlan = { ...plan, steps: [{ name: 'read', request: { method: 'GET', path: '/x' } }] };
    const out = await reader.submitPlan(bad, optionsOf());
    expect(out['read']).toMatchObject({ ok: false, error: { code: 'invalid-request' } });
    const paged: RequestPlan = { ...plan, steps: [{ ...plan.steps[0]!, repeat: { over: '1..2' } }] };
    const pagedOut = await reader.submitPlan(paged, optionsOf());
    expect(pagedOut['create']).toMatchObject({ ok: false, error: { code: 'invalid-request' } });
  });

  it('步骤自己带了 Idempotency-Key：直接拒，不静默覆盖', async () => {
    const { reader, fake } = readerOf([]);
    const withHeader: RequestPlan = {
      ...plan,
      steps: [{ ...plan.steps[0]!, request: { ...plan.steps[0]!.request, headers: { 'Idempotency-Key': 'mine' } } }],
    };
    const out = await reader.submitPlan(withHeader, optionsOf());
    expect(out['create']).toMatchObject({ ok: false, error: { code: 'invalid-request' } });
    expect(fake.commands()).toEqual([]);
  });

  it('幂等键为空：不确认、不发命令', async () => {
    const { fake, reader } = readerOf([]);
    const out = await reader.submitPlan(plan, optionsOf({ idempotencyKey: '  ' }));
    expect(fake.commands()).toEqual([]);
    expect(out['create']).toMatchObject({ ok: false, error: { code: 'invalid-request' } });
  });

  it('写失败不重试；后面的步标 skipped', async () => {
    const { fake, reader } = readerOf([{ exitCode: 1, stderr: 'boom' }]);
    const out = await reader.submitPlan(plan, optionsOf());
    expect(fake.commands()).toHaveLength(1);
    expect(out['create']).toMatchObject({ ok: false });
    expect(out['update']).toMatchObject({ ok: false, error: { code: 'skipped' } });
  });

  it('onStep 抛错不影响已写步骤的结果', async () => {
    const { reader } = readerOf([
      { stdout: JSON.stringify({ ok: true, steps: { create: { ok: true, value: 'c-1' } } }) },
      { stdout: JSON.stringify({ ok: true, steps: { update: { ok: true, value: 'u-1' } } }) },
    ]);
    const out = await reader.submitPlan(
      plan,
      optionsOf({
        onStep: () => {
          throw new Error('观察者自己炸了');
        },
      }),
    );
    expect(out['create']).toMatchObject({ ok: true, data: 'c-1' });
    expect(out['update']).toMatchObject({ ok: true, data: 'u-1' });
  });

  it('确认挂住时 abort：按 false 收口，不发命令', async () => {
    const { fake, reader } = readerOf([]);
    const controller = new AbortController();
    const pending = reader.submitPlan(
      plan,
      optionsOf({
        signal: controller.signal,
        confirm: () => new Promise<boolean>(() => {}),
      }),
    );
    await Promise.resolve();
    controller.abort();
    const out = await pending;
    expect(fake.commands()).toEqual([]);
    expect(out['create']).toMatchObject({ ok: false, error: { code: 'aborted', pageCode: 'aborted' } });
  });

  it('开始前已停止：不确认、不发命令', async () => {
    const { fake, reader } = readerOf([]);
    const controller = new AbortController();
    controller.abort();
    const out = await reader.submitPlan(plan, optionsOf({ signal: controller.signal }));
    expect(fake.commands()).toEqual([]);
    expect(out['create']).toMatchObject({ ok: false, error: { code: 'aborted' } });
  });
});
