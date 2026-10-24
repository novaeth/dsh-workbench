import { DIY_PRESET_ID, WORKSHOP_RELATIVE } from '@/kernel/contract/diy';

export { DIY_PRESET_ID, WORKSHOP_PAST_TITLES, WORKSHOP_RELATIVE, WORKSHOP_TITLE } from '@/kernel/contract/diy';


export function isWorkshopPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  return normalized.endsWith(`/${WORKSHOP_RELATIVE}`);
}

export interface DiyStartOptions {
  readonly agentPreset: string;
}

export function diyStartOptions(workspaceId: string, workshopId: string | undefined): DiyStartOptions | undefined {
  return workshopId !== undefined && workshopId === workspaceId ? { agentPreset: DIY_PRESET_ID } : undefined;
}

export function workshopPresetUpgrade(input: {
  readonly workshop: boolean;
  readonly blank: boolean;
  readonly preset: unknown;
}): string | undefined {
  if (!input.workshop || !input.blank) return undefined;
  if (input.preset !== undefined && input.preset !== null) return undefined;
  return DIY_PRESET_ID;
}
