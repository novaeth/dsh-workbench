import { describe, expect, it } from 'vitest';
import { PROVISION_ACTIONS, parseProvisionBody, provisionTargetOf } from '../provision.js';

describe('provision 请求体：每类动作各有各的目标字段', () => {
  it('每个声明过的动作都分得出去一个目标字段（加动作忘了配就会红）', () => {
    expect(PROVISION_ACTIONS.map((action) => [action, provisionTargetOf(action)])).toEqual([
      ['install', 'unit'],
      ['update', 'unit'],
      ['uninstall', 'unit'],
      ['install-bundle', 'spec'],
      ['update-bundle', 'unit'],
      ['remove-bundle', 'name'],
      ['cancel-install', 'requestId'],
      ['update-dependency', 'id'],
      ['update-plugin', 'name'],
      ['uninstall-plugin', 'name'],
      ['update-workbench', 'name'],
    ]);
  });

  it('老三种动作照旧只认 unit / id，请求里不多带字段', () => {
    expect(parseProvisionBody({ action: 'install', unit: ' issues ' })).toEqual({
      ok: true,
      request: { action: 'install', unit: 'issues' },
    });
    expect(parseProvisionBody({ action: 'update-dependency', id: 'plugin:demo' })).toEqual({
      ok: true,
      request: { action: 'update-dependency', id: 'plugin:demo' },
    });
  });

  it('install-bundle：spec 必填，registry / approvedBuilds 可选且会清空串', () => {
    expect(parseProvisionBody({ action: 'install-bundle', spec: '@a/b@1.2.3' })).toEqual({
      ok: true,
      request: { action: 'install-bundle', spec: '@a/b@1.2.3' },
    });
    expect(
      parseProvisionBody({
        action: 'install-bundle',
        spec: '@a/b',
        registry: ' https://r.example/ ',
        approvedBuilds: ['esbuild', '', 7, 'sharp'],
      }),
    ).toEqual({
      ok: true,
      request: { action: 'install-bundle', spec: '@a/b', registry: 'https://r.example/', approvedBuilds: ['esbuild', 'sharp'] },
    });
  });

  it('remove-bundle / cancel-install 各认各的字段', () => {
    expect(parseProvisionBody({ action: 'remove-bundle', name: '@a/b' })).toEqual({
      ok: true,
      request: { action: 'remove-bundle', name: '@a/b' },
    });
    expect(parseProvisionBody({ action: 'cancel-install', requestId: 'req-1' })).toEqual({
      ok: true,
      request: { action: 'cancel-install', requestId: 'req-1' },
    });
  });

  it('用户装的那两笔插件动作按包名认目标（凭台账记的那个包名）', () => {
    expect(parseProvisionBody({ action: 'update-plugin', name: ' opencli-plugin-inventory ' })).toEqual({
      ok: true,
      request: { action: 'update-plugin', name: 'opencli-plugin-inventory' },
    });
    expect(parseProvisionBody({ action: 'uninstall-plugin', name: 'opencli-plugin-inventory' })).toEqual({
      ok: true,
      request: { action: 'uninstall-plugin', name: 'opencli-plugin-inventory' },
    });
    expect(parseProvisionBody({ action: 'uninstall-plugin', unit: 'panels' })).toEqual({
      ok: false,
      code: 'workbench/no-name',
      message: '缺少 name',
    });
  });

  it('更新工作台自己按包名认目标（界面把它自己那个包名交上来）', () => {
    expect(parseProvisionBody({ action: 'update-workbench', name: ' @dsh-workbench/core ' })).toEqual({
      ok: true,
      request: { action: 'update-workbench', name: '@dsh-workbench/core' },
    });
    expect(parseProvisionBody({ action: 'update-workbench', unit: 'panels' })).toEqual({
      ok: false,
      code: 'workbench/no-name',
      message: '缺少 name',
    });
  });

  it('拿错字段不算数（spec 动作给了 unit 也要打回）', () => {
    expect(parseProvisionBody({ action: 'install-bundle', unit: 'issues' })).toEqual({
      ok: false,
      code: 'workbench/no-spec',
      message: '缺少 spec',
    });
    expect(parseProvisionBody({ action: 'install', spec: 'x' })).toEqual({
      ok: false,
      code: 'workbench/no-unit',
      message: '缺少 unit',
    });
    expect(parseProvisionBody({ action: 'remove-bundle', name: '   ' })).toEqual({
      ok: false,
      code: 'workbench/no-name',
      message: '缺少 name',
    });
    expect(parseProvisionBody({ action: 'cancel-install' })).toEqual({
      ok: false,
      code: 'workbench/no-request-id',
      message: '缺少 requestId',
    });
  });

  it('不认识的 action / 不是对象 / 空体 → 都是 bad-action', () => {
    for (const body of [{ action: 'destroy' }, {}, null, 'nonsense', undefined]) {
      const parsed = parseProvisionBody(body);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) expect(parsed.code).toBe('workbench/bad-action');
    }
    const parsed = parseProvisionBody({ action: 'destroy' });
    if (!parsed.ok) expect(parsed.message).toContain('不认识的 action：destroy');
  });
});
