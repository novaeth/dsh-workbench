import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DIY_PRESET_ID,
  WORKSHOP_PAST_TITLES,
  WORKSHOP_RELATIVE,
  WORKSHOP_TITLE,
  diyStartOptions,
  isWorkshopPath,
  workshopPresetUpgrade,
} from '../diy';

describe('DIY 这三个常量', () => {
  it('preset id 与生成的那份补丁对得上（两处各写一遍就会漂：点了造模块却不是 DIY 模式）', () => {
    const patch = readFileSync(fileURLToPath(new URL('../../../../preset/diy.patch.yml', import.meta.url)), 'utf8');
    expect(patch).toContain(`        id: ${DIY_PRESET_ID}`);
  });

  it('工坊的新名字不在"旧名字"名单里（否则每次启动都改名，永远改不干净）', () => {
    expect(WORKSHOP_TITLE).not.toBe('');
    expect(WORKSHOP_PAST_TITLES).not.toContain(WORKSHOP_TITLE);
  });
});

describe('isWorkshopPath', () => {
  it('认出工坊那一条（宿主登记时用的就是同一个相对路径）', () => {
    expect(isWorkshopPath(`/Users/you/.dsh/${WORKSHOP_RELATIVE}`)).toBe(true);
  });

  it('认 windows 分隔符与结尾斜杠（同一份数据两种写法）', () => {
    expect(isWorkshopPath('C:\\Users\\you\\.dsh\\workbench\\diy')).toBe(true);
    expect(isWorkshopPath(`/Users/you/.dsh/${WORKSHOP_RELATIVE}/`)).toBe(true);
  });

  it('形近的路径不算（少一段、多一个字母、只叫 diy 的用户目录都不是工坊）', () => {
    expect(isWorkshopPath('/Users/you/.dsh/workbench')).toBe(false);
    expect(isWorkshopPath('/Users/you/.dsh/workbench/diyy')).toBe(false);
    expect(isWorkshopPath('/Users/you/项目/diy')).toBe(false);
    expect(isWorkshopPath('')).toBe(false);
  });
});

describe('diyStartOptions（新会话往哪儿落）', () => {
  it('★ 工坊那条工作区 → 必须带 preset（不带就是普通模式，症状是"在工坊里新建会话没进 DIY"）', () => {
    expect(diyStartOptions('w-diy', 'w-diy')).toEqual({ agentPreset: DIY_PRESET_ID });
  });

  it('别的项目一条都不带（普通会话不该被套上 DIY 能力面）', () => {
    expect(diyStartOptions('w-app', 'w-diy')).toBeUndefined();
    expect(diyStartOptions('w-app', undefined)).toBeUndefined();
    expect(diyStartOptions('', undefined)).toBeUndefined();
  });

  it('工坊还没登记成工作区时不猜（工坊不在列表里 → 谁都当普通工作区）', () => {
    expect(diyStartOptions('w-diy', undefined)).toBeUndefined();
  });
});

describe('workshopPresetUpgrade（dsh 自己起的工坊会话补模式）', () => {
  it('★ 工坊里的空白、从没选过模式 → 补 DIY（新用户首启那条会话就是这一档）', () => {
    expect(workshopPresetUpgrade({ workshop: true, blank: true, preset: undefined })).toBe(DIY_PRESET_ID);
    expect(workshopPresetUpgrade({ workshop: true, blank: true, preset: null })).toBe(DIY_PRESET_ID);
  });

  it('用户显式选过就不碰（标准模式记的是 standard，不是空）', () => {
    expect(workshopPresetUpgrade({ workshop: true, blank: true, preset: 'standard' })).toBeUndefined();
    expect(workshopPresetUpgrade({ workshop: true, blank: true, preset: 'cordis' })).toBeUndefined();
  });

  it('开跑之后不改（dsh 已锁模式）/ 别的项目一条都不碰', () => {
    expect(workshopPresetUpgrade({ workshop: true, blank: false, preset: undefined })).toBeUndefined();
    expect(workshopPresetUpgrade({ workshop: false, blank: true, preset: undefined })).toBeUndefined();
  });
});
