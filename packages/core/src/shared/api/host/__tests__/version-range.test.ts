import { describe, expect, it } from 'vitest';
import { checkVersionRange } from '@dsh-workbench/shared/host';

describe('checkVersionRange', () => {
  it('留空 / 空白 → 任意版本都满足（清单不写 = 跟源走）', () => {
    expect(checkVersionRange(undefined, '1.2.3')).toBe('satisfied');
    expect(checkVersionRange('', '1.2.3')).toBe('satisfied');
    expect(checkVersionRange('   ', '0.0.1')).toBe('satisfied');
  });

  it('精确版本', () => {
    expect(checkVersionRange('1.1.23', '1.1.23')).toBe('satisfied');
    expect(checkVersionRange('1.1.23', '1.1.22')).toBe('unsatisfied');
    expect(checkVersionRange('1.1.23', '1.1.24')).toBe('unsatisfied');
  });

  it('`^`：同大版本；0.x 按 npm 的规矩收窄', () => {
    expect(checkVersionRange('^1.1.20', '1.1.20')).toBe('satisfied');
    expect(checkVersionRange('^1.1.20', '1.9.9')).toBe('satisfied');
    expect(checkVersionRange('^1.1.20', '1.1.19')).toBe('unsatisfied');
    expect(checkVersionRange('^1.1.20', '2.0.0')).toBe('unsatisfied');
    expect(checkVersionRange('^0.2.3', '0.2.9')).toBe('satisfied');
    expect(checkVersionRange('^0.2.3', '0.3.0')).toBe('unsatisfied');
  });

  it('`~`：同小版本', () => {
    expect(checkVersionRange('~1.2.3', '1.2.9')).toBe('satisfied');
    expect(checkVersionRange('~1.2.3', '1.3.0')).toBe('unsatisfied');
    expect(checkVersionRange('~1.2.3', '1.2.2')).toBe('unsatisfied');
  });

  it('比较符与空白分隔的多个比较符（**与**）', () => {
    expect(checkVersionRange('>=1.2.3', '1.2.3')).toBe('satisfied');
    expect(checkVersionRange('>=1.2.3', '1.2.2')).toBe('unsatisfied');
    expect(checkVersionRange('>=1.2.3 <2.0.0', '1.5.0')).toBe('satisfied');
    expect(checkVersionRange('>=1.2.3 <2.0.0', '2.0.0')).toBe('unsatisfied');
    expect(checkVersionRange('>=1.2.3 <2.0.0', '1.2.2')).toBe('unsatisfied');
  });

  it('数字段比大小（1.0.10 比 1.0.9 新），带预发布后缀也按数字段读', () => {
    expect(checkVersionRange('>=1.0.10', '1.0.9')).toBe('unsatisfied');
    expect(checkVersionRange('>=1.0.9', '1.0.10')).toBe('satisfied');
    expect(checkVersionRange('>=1.1.23', '1.1.23-beta.1')).toBe('satisfied');
  });

  it('★ 读不懂 → malformed（不静默放行、也不静默拦人）', () => {
    expect(checkVersionRange('>=nonsense', '1.2.3')).toBe('malformed');
    expect(checkVersionRange('latest', '1.2.3')).toBe('malformed');
    expect(checkVersionRange('^1.2.3', 'not-a-version')).toBe('malformed');
  });
});
