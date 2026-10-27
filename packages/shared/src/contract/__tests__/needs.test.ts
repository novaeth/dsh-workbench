import { describe, expect, it } from 'vitest';
import {
  NEED_KINDS,
  NEED_KIND_SPECS,
  SUPPLY_SOURCE_KINDS,
  needProblemsOf,
  needsProblemsOf,
} from '../needs.js';

const npm = { kind: 'npm', package: '@acme/plugin-demo', registryDefault: 'https://registry.test/' };
const base = { kind: 'lib', name: 'demo', purpose: '测试', sources: [npm] };

function errorsOf(need: unknown): readonly string[] {
  return needProblemsOf('demo', need, 0).errors;
}

describe('needs 校验矩阵', () => {
  it('★ 四种 kind 的最小声明都过；注册表与 NEED_KINDS 一一对应', () => {
    expect(
      needsProblemsOf('demo', [
        { kind: 'bin', name: 'gitops', purpose: '部署' },
        { kind: 'extension', runtime: 'opencli', name: 'demo', purpose: '面板', sources: [npm] },
        base,
        { kind: 'env', name: 'DSH_TOKEN', secret: true, purpose: '只读接口' },
      ]).errors,
    ).toEqual([]);
    expect(Object.keys(NEED_KIND_SPECS).sort()).toEqual([...NEED_KINDS].sort());
  });

  it('未知 kind / 未知 source.kind → 红，并点名', () => {
    const unknownKind = errorsOf({ kind: 'mcp', name: 'x', purpose: '测试' });
    expect(unknownKind.join(' ')).toContain('needs[0].kind 不认识');
    const unknownSource = errorsOf({ ...base, sources: [{ kind: 'tarball', url: 'x' }] });
    expect(unknownSource.join(' ')).toContain('sources[0].kind 不认识');
    expect(new Set(Object.values(NEED_KIND_SPECS).flatMap((spec) => spec.sources))).toEqual(
      new Set(SUPPLY_SOURCE_KINDS),
    );
  });

  it('bin / env 写了 sources → 红（没有安装路径）', () => {
    expect(errorsOf({ kind: 'bin', name: 'x', purpose: '测试', sources: [npm] }).join(' ')).toContain(
      '不支持 sources',
    );
    expect(errorsOf({ kind: 'env', name: 'X', purpose: '测试', sources: [npm] }).join(' ')).toContain(
      '不支持 sources',
    );
  });

  it('lib 只认 npm 源；sources 空数组 → 红（不代装就整条删掉）', () => {
    expect(errorsOf({ ...base, sources: [{ kind: 'git', url: 'github:acme/demo' }] }).join(' ')).toContain(
      '只支持 npm',
    );
    expect(errorsOf({ ...base, sources: [] }).join(' ')).toContain('空数组');
  });

  it('必填项：purpose、extension.runtime、name、required 类型、id 空串', () => {
    expect(errorsOf({ ...base, purpose: '' }).join(' ')).toContain('purpose 没写');
    expect(errorsOf({ kind: 'extension', name: 'x', purpose: '测试' }).join(' ')).toContain('runtime 没写');
    expect(errorsOf({ ...base, name: '' }).join(' ')).toContain('name 没写');
    expect(errorsOf({ ...base, required: 'yes' }).join(' ')).toContain('required 要是布尔');
    expect(errorsOf({ ...base, id: '' }).join(' ')).toContain('id 是空串');
  });

  it('★ need 内未知字段只是警告；x- 前缀直接忽略（不为可选字段升协议版本）', () => {
    const read = needProblemsOf('demo', { ...base, future: 1, 'x-vendor': true }, 0);
    expect(read.errors).toEqual([]);
    expect(read.warnings.join(' ')).toContain('不认识的字段 future');
    expect(read.warnings.join(' ')).not.toContain('x-vendor');
  });

  it('没写 needs → 空表不报', () => {
    expect(needsProblemsOf('demo', undefined)).toEqual({ errors: [], warnings: [] });
  });
});
