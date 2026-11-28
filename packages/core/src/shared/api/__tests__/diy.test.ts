import { describe, expect, it } from 'vitest';
import {
  DIY_PRESET_ID,
  WORKSHOP_PAST_TITLES,
  WORKSHOP_RELATIVE,
  WORKSHOP_TITLE,
  diyDraftOptions,
  diyStartOptions,
  isWorkshopPath,
  workshopPresetUpgrade,
} from '../diy';

describe('DIY 这三个常量', () => {
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

describe('diyDraftOptions（点「创建模块」跳过去时输入框里的示例）', () => {
  it('★ 工坊里：preset 与示例提示词一起给（只给 preset 就丢了那句示例）', () => {
    expect(diyDraftOptions('w-diy', 'w-diy', '创建一个模块')).toEqual({
      agentPreset: DIY_PRESET_ID,
      prompt: '创建一个模块',
      whenDraftExists: 'replace',
    });
  });

  it('普通工作区不套 preset，但示例提示词照给', () => {
    expect(diyDraftOptions('w-app', 'w-diy', '创建一个模块')).toEqual({
      prompt: '创建一个模块',
      whenDraftExists: 'replace',
    });
  });

  it('没有提示词时退回原来的 preset 行为（别把空串塞进输入框）', () => {
    expect(diyDraftOptions('w-diy', 'w-diy', undefined)).toEqual({ agentPreset: DIY_PRESET_ID });
    expect(diyDraftOptions('w-diy', 'w-diy', undefined)).not.toHaveProperty('whenDraftExists');
    expect(diyDraftOptions('w-app', undefined, undefined)).toBeUndefined();
  });
});

describe('workshopPresetUpgrade（dsh 自己起的工坊会话补模式）', () => {
  it('★ 工坊里的空白、从没选过模式 → 补 DIY（新用户首启那条会话就是这一档）', () => {
    expect(workshopPresetUpgrade({ workshop: true, blank: true, preset: undefined })).toBe(DIY_PRESET_ID);
    expect(workshopPresetUpgrade({ workshop: true, blank: true, preset: null })).toBe(DIY_PRESET_ID);
  });

  it('★ dsh 建会话时把默认模式写进 header（standard）—— 那不算"用户选过"，照样补 DIY', () => {
    expect(workshopPresetUpgrade({ workshop: true, blank: true, preset: 'standard' })).toBe(DIY_PRESET_ID);
    expect(
      workshopPresetUpgrade({ workshop: true, blank: true, preset: 'standard', defaultPreset: 'standard' }),
    ).toBe(DIY_PRESET_ID);
    expect(
      workshopPresetUpgrade({ workshop: true, blank: true, preset: 'minimal', defaultPreset: 'minimal' }),
    ).toBe(DIY_PRESET_ID);
  });

  it('用户选了别的模式就不碰（宿主默认不是 standard 时，选 standard 也照此算）', () => {
    expect(workshopPresetUpgrade({ workshop: true, blank: true, preset: 'ptc' })).toBeUndefined();
    expect(
      workshopPresetUpgrade({ workshop: true, blank: true, preset: 'standard', defaultPreset: 'ptc' }),
    ).toBeUndefined();
  });

  it('开跑之后不改（dsh 已锁模式）/ 别的项目一条都不碰', () => {
    expect(workshopPresetUpgrade({ workshop: true, blank: false, preset: undefined })).toBeUndefined();
    expect(workshopPresetUpgrade({ workshop: false, blank: true, preset: undefined })).toBeUndefined();
  });
});
