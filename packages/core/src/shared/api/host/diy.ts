import type { DshHostContext } from '@dsh-workbench/shared';
import { join } from 'node:path';
import { workbenchRoot } from '@dsh-workbench/shared/host';

export function workshopPathOf(_ctx: DshHostContext): string | null {
  try {
    return join(workbenchRoot(), 'diy');
  } catch {
    return null;
  }
}
