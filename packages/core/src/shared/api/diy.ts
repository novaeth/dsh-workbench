import { DIY_PRESET_ID, DIY_PRESET_SOURCE_DEFAULT, WORKSHOP_RELATIVE } from '@/kernel/contract/diy';

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

export interface DiyDraftOptions {
  readonly agentPreset?: string;
  readonly prompt?: string;
  readonly whenDraftExists?: 'replace';
}

export function diyDraftOptions(
  workspaceId: string,
  workshopId: string | undefined,
  prompt: string | undefined,
): DiyDraftOptions | undefined {
  const preset = diyStartOptions(workspaceId, workshopId)?.agentPreset;
  if (preset === undefined && prompt === undefined) return undefined;
  return {
    ...(preset === undefined ? {} : { agentPreset: preset }),
    ...(prompt === undefined ? {} : { prompt, whenDraftExists: 'replace' as const }),
  };
}

export function workshopPresetUpgrade(input: {
  readonly workshop: boolean;
  readonly blank: boolean;
  readonly preset: unknown;
  readonly defaultPreset?: string | undefined;
}): string | undefined {
  if (!input.workshop || !input.blank) return undefined;
  const preset = typeof input.preset === 'string' ? input.preset : '';
  const unchanged = preset === '' || preset === (input.defaultPreset ?? DIY_PRESET_SOURCE_DEFAULT);
  if (!unchanged) return undefined;
  return DIY_PRESET_ID;
}
