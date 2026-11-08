import type { Translate, UnitManifest } from '@dsh-workbench/shared';
import {
  DIY_PACK_TOOLS,
  MANAGE_TOOLS,
  PACK_TARGET_LIMIT,
  WRITE_TOOLS,
} from '@/modules/panels/client';
const WRITING = new Set<string>(WRITE_TOOLS);

function packCountText(label: string, count: number, writes: number, t: Translate): string {
  return `${label} · ${t('approval.toolbox.count', {
    n: String(count),
    r: String(count - writes),
    w: String(writes),
  })}`;
}

function packToolText(id: string, manifests: readonly UnitManifest[], t: Translate): string {
  if (id === 'manage' || id === 'diy') {
    const tools: readonly string[] = id === 'manage' ? MANAGE_TOOLS : DIY_PACK_TOOLS;
    const label = t(id === 'manage' ? 'approval.toolbox.manage' : 'approval.toolbox.diy');
    return packCountText(label, tools.length, tools.filter((name) => WRITING.has(name)).length, t);
  }
  if (id.startsWith('unit:')) {
    const unit = id.slice('unit:'.length);
    const manifest = manifests.find((one) => one.id === unit);
    if (manifest === undefined) return id;
    const tools = manifest.tools ?? [];
    return packCountText(manifest.title?.zh ?? unit, tools.length, tools.filter((tool) => tool.writes).length, t);
  }
  return id;
}

export function toolboxApprovalRows(
  args: Readonly<Record<string, unknown>>,
  manifests: readonly UnitManifest[],
  t: Translate,
): readonly { readonly label: string; readonly value: string }[] {
  const raw = args['targets'];
  const targets = Array.isArray(raw)
    ? raw
        .flatMap((one) => (typeof one === 'string' && one.trim() !== '' ? [one.trim()] : []))
        .slice(0, PACK_TARGET_LIMIT)
    : [];
  return [
    ...targets.map((id) => ({
      label: t('approval.toolbox.pack'),
      value: packToolText(id, manifests, t),
    })),
    { label: t('approval.toolbox.scope'), value: t('approval.toolbox.session') },
    { label: t('approval.toolbox.write'), value: t('approval.toolbox.writeNote') },
  ];
}
