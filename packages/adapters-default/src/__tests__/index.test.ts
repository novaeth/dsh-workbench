import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSeam } from '@dsh-workbench/shared/host';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import { DEFAULT_ADAPTERS, createAdapterSet, createSupplyPort } from '../index.js';

const dirs: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('adapters-default', () => {
  it('defaults to the six host adapters', () => {
    expect(DEFAULT_ADAPTERS.map((adapter) => adapter.id)).toEqual([
      'opencli',
      'browser',
      'supply',
      'profile',
      'probe',
      'data',
    ]);
  });
});

describe('supply port', () => {
  it('only exposes the port members, not the whole adapters-default namespace', () => {
    const supply = createSupplyPort();
    expect('profileModules' in supply).toBe(true);
    expect('startSelfUpdate' in supply).toBe(true);
    expect('createDataReader' in supply).toBe(false);
    expect('createOpencli' in supply).toBe(false);
    expect('probeUnits' in supply).toBe(false);
    expect('DEFAULT_ADAPTERS' in supply).toBe(false);
  });
});

describe('默认适配器集合', () => {
  it('createAdapterSet 就是 AdapterSet 的一份完整实现', () => {
    const set = createAdapterSet({ get: () => undefined } as never);
    expect(set.apiVersion).toBe(2);
    expect(set.supply).toBe(set.modules);
    expect(typeof set.probe.probeUnits).toBe('function');
    expect(typeof set.runtime.seed).toBe('function');
    expect(typeof set.data.submitPlan).toBe('function');
    expect(typeof set.plugins.createUnits).toBe('function');
    expect(typeof set.actions.configSyncHandler).toBe('function');
  });

  it('工厂不写 root：seed 由宿主 apply 调一次', () => {
    const home = mkdtempSync(join(tmpdir(), 'wb-default-set-'));
    dirs.push(home);
    vi.stubEnv('DSH_HOME', home);
    createAdapterSet({ get: () => undefined } as never);
    expect(readdirSync(home)).toEqual([]);
  });
});

describe('默认适配器 · 附件', () => {
  it('图片走 saveImage；saveFile 抛错时回退 saveImage', async () => {
    const fake = createFakeShell([
      {
        stdout: JSON.stringify({
          ok: true,
          steps: { shot: { ok: true, value: { base64: 'aGk=', size: 2, contentType: 'image/png' } } },
        }),
      },
      {
        stdout: JSON.stringify({
          ok: true,
          steps: { doc: { ok: true, value: { base64: 'aGk=', size: 2, contentType: 'application/pdf' } } },
        }),
      },
    ]);
    const calls: string[] = [];
    const attachments = {
      saveImage: async () => {
        calls.push('image');
        return { attachmentId: 'img-1' };
      },
      saveFile: async () => {
        calls.push('file');
        throw new Error('文件附件没开');
      },
    };
    const ctx = { get: (key: string) => (key === 'attachments' ? attachments : undefined) } as never;
    const set = createAdapterSet(ctx, {
      seam: createSeam({ shell: fake.shell, runtimeRoot: '/tmp/wb-default-att2' }),
    });
    const shot = await set.data.plan({
      origin: 'https://x.example.com',
      steps: [{ name: 'shot', request: { method: 'GET', path: '/s' }, response: { kind: 'bytes', saveAs: 'attachment' } }],
    });
    expect(shot['shot']).toMatchObject({ ok: true, data: { attachmentId: 'img-1' } });
    const doc = await set.data.plan({
      origin: 'https://x.example.com',
      steps: [{ name: 'doc', request: { method: 'GET', path: '/d' }, response: { kind: 'bytes', saveAs: 'attachment' } }],
    });
    expect(doc['doc']).toMatchObject({ ok: true, data: { attachmentId: 'img-1' } });
    expect(calls).toEqual(['image', 'file', 'image']);
  });

  it('bytes.saveAs 走宿主 attachments.saveFile', async () => {
    const fake = createFakeShell([
      {
        stdout: JSON.stringify({
          ok: true,
          steps: { file: { ok: true, value: { base64: 'aGk=', size: 2, contentType: 'text/plain' } } },
        }),
      },
    ]);
    const saved: Array<{ data: Uint8Array; mediaType: string; name?: string }> = [];
    const attachments = {
      saveFile: async (input: { data: Uint8Array; mediaType: string; name?: string }) => {
        saved.push(input);
        return { attachmentId: 'a-1' };
      },
    };
    const ctx = {
      get: (key: string) => (key === 'attachments' ? attachments : undefined),
    } as never;
    const set = createAdapterSet(ctx, {
      seam: createSeam({ shell: fake.shell, runtimeRoot: '/tmp/wb-default-att' }),
    });
    const out = await set.data.plan({
      origin: 'https://x.example.com',
      steps: [
        {
          name: 'file',
          request: { method: 'GET', path: '/f' },
          response: { kind: 'bytes', saveAs: 'attachment' },
        },
      ],
    });
    expect(saved).toHaveLength(1);
    expect(saved[0]?.name).toBe('file');
    expect(out['file']).toMatchObject({ ok: true, data: { attachmentId: 'a-1' } });
  });
});
