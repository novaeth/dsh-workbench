import { describe, expect, it } from 'vitest';
import { componentsTool, registerComponentsTool } from '../diy-components';
import { DIY_COMPONENTS_TOOL, READ_TOOLS, WRITE_TOOLS } from '../../unit';

describe('workbench_diy_components · 工具形状', () => {
  it('★ 名字是那一把、四个参数（name / scope / bucket / all），scope 只认两个面，而且只归读侧（不写东西、不用点头）', () => {
    const tool = componentsTool({} as never);

    expect(tool.name).toBe(DIY_COMPONENTS_TOOL);
    expect(tool.description.length).toBeGreaterThan(10);
    const properties = (tool.parameters as { properties: Record<string, { enum?: readonly string[] }> }).properties;
    expect(Object.keys(properties)).toEqual(['name', 'scope', 'bucket', 'all']);
    expect(properties['scope']?.enum).toEqual(['kit', 'primitives', 'tokens']);
    expect(READ_TOOLS).toContain(DIY_COMPONENTS_TOOL);
    expect(WRITE_TOOLS).not.toContain(DIY_COMPONENTS_TOOL);
  });

  it('注册恰好一把，并回一个能撤销的 disposer', () => {
    const seen: Array<{ name?: string }> = [];
    const tools = {
      register: (definition: { name?: string }) => {
        seen.push(definition);
        return () => {};
      },
    };

    const disposers = registerComponentsTool({} as never, tools as never);

    expect(seen.map((one) => one.name)).toEqual([DIY_COMPONENTS_TOOL]);
    expect(disposers).toHaveLength(1);
    expect(typeof disposers[0]).toBe('function');
  });
});
