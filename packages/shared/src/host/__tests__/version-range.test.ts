import { describe, expect, it } from 'vitest';
import { checkVersionRange } from '../version-range.js';

describe('checkVersionRange', () => {
  it('空契约与空版本按满足算', () => {
    expect(checkVersionRange(undefined, '1.2.3')).toBe('satisfied');
    expect(checkVersionRange('   ', '0.0.1')).toBe('satisfied');
  });

  it('caret 收下上界以内的版本', () => {
    expect(checkVersionRange('^0.3.0', '0.3.11')).toBe('satisfied');
    expect(checkVersionRange('^0.3.0', '0.4.0')).toBe('unsatisfied');
    expect(checkVersionRange('^0.1.0', '0.3.11')).toBe('unsatisfied');
  });

  it('比较符与畸形契约分得开', () => {
    expect(checkVersionRange('>=0.3.0 <0.4.0', '0.3.11')).toBe('satisfied');
    expect(checkVersionRange('>=0.3.0 <0.4.0', '0.4.0')).toBe('unsatisfied');
    expect(checkVersionRange('nonsense', '0.3.11')).toBe('malformed');
  });
});
