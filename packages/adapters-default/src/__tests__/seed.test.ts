import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DshHostContext } from '@dsh-workbench/shared/host';
import { createSeam, WORKBENCH_SEAM } from '@dsh-workbench/shared/host';
import { createFakeProcesses, createFakeShell } from '@dsh-workbench/shared/testing';
import { createRuntimePort } from '../runtime-port.js';

const roots: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wb-default-set-'));
  roots.push(dir);
  return dir;
}

describe('运行时自举走执行缝', () => {
  it('★ seed 用宿主域的 spawn 起自举脚本（不再自己 detached 起进程）', async () => {
    const home = tempRoot();
    const path = process.env['PATH'];
    vi.stubEnv('DSH_HOME', home);
    const processes = createFakeProcesses([{}]);
    const seam = createSeam({
      shell: createFakeShell([{}]).shell,
      runtimeRoot: '/tmp/wb-seam-test',
      allowHost: true,
      processes: processes.host,
    });
    const ctx = {
      get: (key: string) => (key === WORKBENCH_SEAM ? seam : undefined),
    } as unknown as DshHostContext;
    try {
      createRuntimePort().seed(ctx, { corePackageUrl: import.meta.url, log: () => {} });
      await new Promise((resolve) => setTimeout(resolve, 0));
    } finally {
      if (path === undefined) delete process.env['PATH'];
      else process.env['PATH'] = path;
    }

    expect(seam.facts().filter((fact) => fact.verb === 'spawn')).toHaveLength(1);
    expect(processes.calls).toHaveLength(1);
    expect(processes.calls[0]?.file).toBe('bash');
    expect(processes.calls[0]?.args[0]).toContain('seed-workshop.sh');
    expect(processes.children[0]?.unrefed).toBe(true);
  });
});
