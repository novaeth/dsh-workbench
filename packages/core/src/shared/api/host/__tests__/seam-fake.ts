import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DshShell } from '@dsh-workbench/shared';
import { createSeam, type Seam } from '@dsh-workbench/shared/host';

const ROOT = join(tmpdir(), 'wb-seam-test');

export function fakeSeamOf(shell: DshShell): Seam {
  return createSeam({
    shell,
    runtimeRoot: ROOT,
    grantOf: () => ({ mode: 'workspace-write', workspaceRoot: ROOT }),
  });
}
