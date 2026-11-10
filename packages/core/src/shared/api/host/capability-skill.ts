import type { DshHostContext } from '@dsh-workbench/shared';
import { TOOLBOX_SERVICE, type ToolboxCapability, type ToolboxPort } from '@dsh-workbench/shared/host';
import { toolScopeContextOf } from './tool-scope';

interface SkillRegistry {
  register(skill: ToolboxCapability): () => void;
}

const registered = new WeakSet<object>();

function skillsOf(agent: unknown): SkillRegistry | undefined {
  const handle = typeof agent === 'object' && agent !== null ? (agent as { ctx?: unknown }) : undefined;
  const ctx = typeof handle?.ctx === 'object' && handle.ctx !== null ? handle.ctx : undefined;
  const service = (ctx as { get?<T>(name: string): T | undefined } | undefined)?.get?.<SkillRegistry>('skills');
  return service?.register === undefined ? undefined : service;
}

export function registerCapabilitySkill(ctx: DshHostContext, agent: unknown): void {
  if (typeof agent !== 'object' || agent === null || registered.has(agent)) return;
  try {
    const brief = ctx.get<ToolboxPort>(TOOLBOX_SERVICE)?.capabilityBrief?.(toolScopeContextOf(agent)?.workspace ?? null);
    if (brief === undefined) return;
    const skills = skillsOf(agent);
    if (skills === undefined) {
      ctx.logger?.info?.('[dsh-workbench] 这个 dsh 没有 skills 服务：能力索引不进 skill 目录');
      return;
    }
    skills.register(brief);
    registered.add(agent);
  } catch (error) {
    ctx.logger?.warn?.(`[dsh-workbench] 注册能力索引 skill 失败：${String(error)}`);
  }
}
