import type { DshHostContext } from '@dsh-workbench/shared/host';
import { TOOLBOX_SERVICE, type ToolboxCapability, type ToolboxPort } from '@dsh-workbench/shared/host';
import { toolScopeContextOf } from './tool-scope';

const RUNTIME_SOURCE = 'runtime';

interface SkillRegistration extends ToolboxCapability {
  readonly source: string;
}

interface SkillRegistry {
  register(skill: SkillRegistration): () => void;
}

const registered = new WeakSet<object>();

function skillsOf(agent: unknown): SkillRegistry | undefined {
  const handle = typeof agent === 'object' && agent !== null ? (agent as { ctx?: DshHostContext }) : undefined;
  const service = handle?.ctx?.get('skills') as SkillRegistry | undefined;
  return service?.register === undefined ? undefined : service;
}

export function registerCapabilitySkill(ctx: DshHostContext, agent: unknown): void {
  if (typeof agent !== 'object' || agent === null || registered.has(agent)) return;
  try {
    const brief = (ctx.get(TOOLBOX_SERVICE) as ToolboxPort | undefined)?.capabilityBrief?.(
      toolScopeContextOf(agent)?.workspace ?? null,
    );
    if (brief === undefined) return;
    const skills = skillsOf(agent);
    if (skills === undefined) {
      ctx.logger?.info?.('[dsh-workbench] 这个 dsh 没有 skills 服务：能力索引不进 skill 目录');
      return;
    }
    skills.register({ ...brief, source: RUNTIME_SOURCE });
    registered.add(agent);
  } catch (error) {
    ctx.logger?.warn?.(`[dsh-workbench] 注册能力索引 skill 失败：${String(error)}`);
  }
}
