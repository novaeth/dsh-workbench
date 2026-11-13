import { describe, expect, it } from 'vitest';
import { TOOLBOX_CLOSE_TOOL, TOOLBOX_LIST_TOOL, TOOLBOX_OPEN_TOOL } from '../unit';
import { capabilityBriefOf } from '../model/capability-brief';
import type { PackEntry } from '../model/toolbox';

function pack(id: PackEntry['id'], kind: PackEntry['kind']): PackEntry {
  return {
    id,
    label: { zh: id, en: id },
    hint: '',
    tools: [],
    alwaysOn: [],
    writes: 0,
    kind,
  };
}

describe('能力索引：写的是一句话索引进 skill 目录', () => {
  it('★ 名字是 kebab-case、描述非空且不超 dsh 的 500 字上限', () => {
    const brief = capabilityBriefOf([pack('manage', 'shell'), pack('unit:board-x', 'unit')]);

    expect(brief.name).toBe('workbench-capabilities');
    expect(brief.description.length).toBeGreaterThan(0);
    expect(brief.description.length).toBeLessThanOrEqual(500);
    expect(brief.content.length).toBeGreaterThan(0);
  });

  it('★ 带活的包 id：这台机器上有什么就写什么', () => {
    const brief = capabilityBriefOf([
      pack('manage', 'shell'),
      pack('diy', 'shell'),
      pack('unit:board-x', 'unit'),
      pack('mcp:chrome', 'mcp'),
    ]);

    for (const id of ['manage', 'diy', 'unit:board-x', 'mcp:chrome']) expect(brief.description).toContain(id);
  });

  it('id 短、装得下时一个都不截', () => {
    const many = Array.from({ length: 20 }, (_one, index) => pack(`unit:u${String(index)}` as PackEntry['id'], 'unit'));

    const brief = capabilityBriefOf(many);

    expect(brief.description).toContain('unit:u0');
    expect(brief.description).toContain('unit:u19');
    expect(brief.description.length).toBeLessThanOrEqual(500);
  });

  it('★ 任意真实长度的包 id 都守得住 dsh 的 500 字硬上限，且下一步不许被截掉', () => {
    for (const width of [12, 16, 20, 21, 24, 26, 27, 28, 32, 40, 48, 60]) {
      const unit = (index: number) =>
        pack(`unit:${'x'.repeat(width)}-${String(index)}` as PackEntry['id'], 'unit');
      const brief = capabilityBriefOf([
        pack('manage', 'shell'),
        pack('diy', 'shell'),
        ...Array.from({ length: 15 }, (_one, index) => unit(index)),
        pack('mcp:chrome-devtools' as PackEntry['id'], 'mcp'),
      ]);

      expect(brief.description.length, `id 宽 ${String(width)}：${String(brief.description.length)} 字`).toBeLessThanOrEqual(500);
      expect(brief.description).toContain(TOOLBOX_LIST_TOOL);
      expect(brief.description).toContain(TOOLBOX_OPEN_TOOL);
    }
  });

  it('装不下时交代总数，且被点名的 id 仍然在挑得出来的那些里', () => {
    const many = Array.from({ length: 30 }, (_one, index) =>
      pack(`unit:workbench-sample-module-${String(index)}` as PackEntry['id'], 'unit'),
    );

    const brief = capabilityBriefOf(many);

    expect(brief.description).toContain('等 30 个包');
    expect(brief.description).toContain('unit:workbench-sample-module-0');
    expect(brief.description.length).toBeLessThanOrEqual(500);
  });

  it('正文给出可执行的下一步：先 list 再 open，用完 close', () => {
    const brief = capabilityBriefOf([pack('manage', 'shell')]);

    expect(brief.content).toContain(TOOLBOX_LIST_TOOL);
    expect(brief.content).toContain(TOOLBOX_OPEN_TOOL);
    expect(brief.content).toContain(TOOLBOX_CLOSE_TOOL);
    expect(brief.content).toContain('mcp:<server>');
  });

  it('★ 写明 DIY 模式的会话里 manage / diy 默认已开（否则模型会去白开一次）', () => {
    const brief = capabilityBriefOf([pack('manage', 'shell'), pack('diy', 'shell')]);

    expect(brief.content).toContain('workbench-diy');
    expect(brief.content).toContain('默认已开');
  });
});
