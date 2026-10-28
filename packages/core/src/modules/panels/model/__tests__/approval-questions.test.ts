import { describe, expect, it } from 'vitest';
import { copiesOf } from '../approval-questions';

describe('发布审批的问句', () => {
  it('每个出口都有中英问句，且都点到模块名', () => {
    const copies = copiesOf('工作台模块 [probe]', 'the workbench module [probe]');
    for (const target of ['team', 'public', 'tarball', 'git', 'market', 'local']) {
      expect(copies[target]?.zh).toContain('工作台模块 [probe]');
      expect(copies[target]?.en).toContain('the workbench module [probe]');
    }
  });

  it('市场那条说清产物与索引一起提交', () => {
    expect(copiesOf('模块', 'module').market?.zh).toContain('产物与索引');
  });
});
