export const DIY_PRESET_ID = 'workbench-diy';

export const WORKSHOP_RELATIVE = 'workbench/diy';

export const WORKSHOP_TITLE = '工作台DIY';

export const WORKSHOP_PAST_TITLES: readonly string[] = ['DIY 工坊', '工作台自带 · DIY 模块住这儿'];

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
