import { apiGet } from '@dsh-workbench/shared';
import type { SidebarEditionSnapshot } from '@/kernel/contract/sidebar-edition';
import { SIDEBAR_EDITION_ROUTE } from '@/kernel/contract/sidebar-edition';

export async function readSidebarEdition(): Promise<SidebarEditionSnapshot | undefined> {
  try {
    const answer = await apiGet<SidebarEditionSnapshot>(SIDEBAR_EDITION_ROUTE);
    return answer.ok ? answer : undefined;
  } catch {
    return undefined;
  }
}
