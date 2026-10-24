import { describe, expect, it } from 'vitest';
import { DIY_DEBUG_TOOLS, DIY_LOGS_TOOLS, screenOnlyToolsFor } from '../unit';

describe('Desktop 的 DIY 工具面', () => {
  it('★ 屏调试关了只收 debug + logs，不碰 14 把 read 线', () => {
    expect(screenOnlyToolsFor(true)).toEqual([]);

    const names = screenOnlyToolsFor(false);
    expect(names).toEqual([...DIY_DEBUG_TOOLS, ...DIY_LOGS_TOOLS]);
    expect(names).toContain('workbench_diy_debug_start');
    expect(names).toContain('workbench_diy_logs_watch');
    expect(names).not.toContain('workbench_diy_eval');
    expect(names).not.toContain('workbench_diy_record_prepare');
  });
});
