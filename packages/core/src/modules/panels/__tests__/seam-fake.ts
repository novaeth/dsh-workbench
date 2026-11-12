import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DshShell } from '@dsh-workbench/shared/host';
import { createSeam, type Seam, type SeamMode } from '@dsh-workbench/shared/host';

export const SEAM_TEST_ROOT = join(tmpdir(), 'wb-seam-test');

export function fakeSeamOf(
  shell: DshShell,
  options: { readonly workspaceRoot?: string | undefined; readonly mode?: SeamMode | undefined } = {},
): Seam {
  const mode = options.mode ?? 'workspace-write';
  const workspaceRoot = options.workspaceRoot ?? SEAM_TEST_ROOT;
  return createSeam({
    shell,
    runtimeRoot: SEAM_TEST_ROOT,
    ceiling: mode,
    grantOf: () => ({ mode, workspaceRoot }),
  });
}
