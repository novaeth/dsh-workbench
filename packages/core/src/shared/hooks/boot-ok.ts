import { apiPost } from '@dsh-workbench/shared';
import { BOOT_OK_ROUTE } from '@/kernel/contract/boot-ok';

let reported = false;

export function reportBootOk(
  post: (route: string, body: Record<string, unknown>) => Promise<unknown> = apiPost,
): void {
  if (reported) return;
  reported = true;
  void post(BOOT_OK_ROUTE, {}).catch(() => undefined);
}
