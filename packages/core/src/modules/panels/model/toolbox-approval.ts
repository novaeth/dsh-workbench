import type { ApprovalCall, ApprovalDetail, ApprovalVerdict } from '@dsh-workbench/shared/host';
import { PACK_TARGET_LIMIT, TOOLBOX_OPEN_TOOL } from '../unit';
import type { Toolbox } from './toolbox';

function pair(zh: string, en: string): ApprovalDetail {
  return { zh, en };
}

function targetsOf(call: ApprovalCall): readonly string[] {
  const raw = (call.arguments as Record<string, unknown> | undefined)?.['targets'];
  if (!Array.isArray(raw)) return [];
  return raw
    .flatMap((one) => (typeof one === 'string' && one.trim() !== '' ? [one.trim()] : []))
    .slice(0, PACK_TARGET_LIMIT);
}

export function toolboxVerdictFor(call: ApprovalCall, toolbox: Toolbox | undefined): ApprovalVerdict | undefined {
  if (call.name !== TOOLBOX_OPEN_TOOL) return undefined;

  const targets = targetsOf(call);
  const workspace = call.workspace ?? null;
  const candidates =
    toolbox === undefined
      ? ''
      : `可用：${toolbox.catalog(workspace).map((pack) => pack.id).join(' / ')}（先调 workbench_toolbox_list 看每个包能干什么）`;
  if (targets.length === 0) {
    return { kind: 'deny', reason: `开工具包要指名 targets（可多个）。${candidates}` };
  }
  const resolved = toolbox?.resolve(targets, workspace);
  const unknown = resolved?.unknown ?? [];
  if (unknown.length > 0) {
    return { kind: 'deny', reason: `这些工具包不存在：${unknown.join('、')}。${candidates}` };
  }
  const hidden = resolved?.hidden ?? [];
  if (hidden.length > 0) {
    return {
      kind: 'deny',
      reason: `这些工具包没在板子上：${hidden.join('、')} —— 先把模块启用到面板上，再开它的工具包。`,
    };
  }
  const packs = resolved?.packs ?? [];
  const labels = packs.map((id) => {
    const found = toolbox?.catalog(workspace).find((pack) => pack.id === id);
    return pair(found?.label.zh ?? String(id), found?.label.en ?? String(id)) satisfies { zh: string; en: string };
  });
  const first = labels[0];
  const question =
    first === undefined
      ? pair('要开启工作台的工具包吗？', 'Open a workbench tool pack?')
      : labels.length === 1
        ? pair(`要开启${first.zh}工具包吗？`, `Open the ${first.en} tool pack?`)
        : pair(
            `要开启${first.zh}等 ${String(labels.length)} 个工具包吗？`,
            `Open ${String(labels.length)} workbench tool packs (${first.en}…)?`,
          );
  return {
    kind: 'ask',
    reason: `agent 要开启工作台工具包：${targets.join('、') || '（没给）'}`,
    question,
    fallback: question,
  };
}
