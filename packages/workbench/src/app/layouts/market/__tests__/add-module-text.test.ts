import { describe, expect, it } from 'vitest';
import { dictionaries, zh } from '@dsh-workbench/shared';
import type { Translate } from '@dsh-workbench/shared';
import { RESTART_REASONS, type BundleChange } from '@/shared/api/bundle-install';
import {
  GUIDE_ITEMS,
  customRegistryAllowed,
  failureCode,
  failureReason,
  failureReasonKey,
  heldWizardPhase,
  optionLabel,
  previewOf,
  registryName,
  problemKey,
  registryOf,
  restartWhy,
  restartWhyKey,
  registryOptions,
  resultKindOf,
  supplyKey,
  verdictKey,
} from '../add-module-text';

const t = ((key: string, params?: Readonly<Record<string, string>>) => {
  let text = (zh as Record<string, string>)[key] ?? key;
  for (const [name, value] of Object.entries(params ?? {})) text = text.replace(`{${name}}`, value);
  return text;
}) as unknown as Translate;

const change = (over: Partial<BundleChange> = {}): BundleChange => ({
  application: 'failed',
  stage: 'install',
  changed: false,
  target: 'x',
  ...over,
});

describe('添加模块浮层：文案与来源选项（按 dsh 插件页的骨架）', () => {
  it('来源列表：宿主配的源在前、它的回退源跟上、「用默认」排最后、自定义地址最后（与 dsh 同序）', () => {
    const options = registryOptions({
      registry: 'https://registry.npmmirror.com/',
      fallbackRegistries: [],
      resolved: null,
    });
    expect(options.map((option) => option.choice.kind)).toEqual(['url', 'default', 'custom']);
  });

  it('★ 认识的源带上名字与主机（照 dsh 的「{name}（{host}）」），不认识的原样显示主机', () => {
    const options = registryOptions({
      registry: 'https://registry.npmmirror.com/',
      fallbackRegistries: [
        'https://registry.npmjs.org/',
        'https://npm.corp.example/',
        'https://registry.npmmirror.com/',
      ],
      resolved: null,
    });
    expect(options.map((option) => optionLabel(option, t))).toEqual([
      '中国大陆镜像源（registry.npmmirror.com）',
      'npm 官方源（registry.npmjs.org）',
      'npm.corp.example',
      '默认安装源（registry.npmjs.org）',
      '自定义地址',
    ]);
  });

  it('★ 「默认」按宿主解析到的源显示名字，且与它去重成一项（真机那组的形状）', () => {
    const options = registryOptions({
      registry: null,
      fallbackRegistries: ['https://registry.npmmirror.com/'],
      resolved: 'https://registry.npmmirror.com/',
    });
    expect(options.map((option) => option.choice.kind)).toEqual(['default', 'custom']);
    expect(registryName(options[0]!, t)).toBe('中国大陆镜像源');
    expect(optionLabel(options[0]!, t)).toBe('中国大陆镜像源（registry.npmmirror.com）');
  });

  it('★ 两边都不知道时才是「默认安装源」，主机落 npm 官方源（dsh 的 registryText 那一支）', () => {
    const options = registryOptions({ registry: null, fallbackRegistries: [], resolved: null });
    expect(options.map((option) => option.choice.kind)).toEqual(['default', 'custom']);
    expect(registryName(options[0]!, t)).toBe('默认安装源');
    expect(optionLabel(options[0]!, t)).toBe('默认安装源（registry.npmjs.org）');
  });

  it('自定义地址：必须 http(s)，否则不给宿主（免得把垃圾串当源发出去）', () => {
    expect(customRegistryAllowed('https://npm.corp.example/')).toBe(true);
    expect(customRegistryAllowed('http://npm.corp.example/')).toBe(true);
    expect(customRegistryAllowed('npm.corp.example')).toBe(false);
    expect(registryOf({ kind: 'custom', value: '' }, 'https://npm.corp.example/')).toBe(
      'https://npm.corp.example/',
    );
    expect(registryOf({ kind: 'custom', value: '' }, 'npm.corp.example')).toBeUndefined();
    expect(registryOf({ kind: 'default', value: '' }, '')).toBeUndefined();
    expect(registryOf({ kind: 'url', value: 'https://r.example/' }, '')).toBe('https://r.example/');
  });

  it('★ 引导那三块（包名 / Git / 本地目录）的每个键都在字典里（动态键扫不到，这里钉住）', () => {
    const missing: string[] = [];
    for (const item of GUIDE_ITEMS) {
      for (const key of [item.titleKey, item.exampleKey, item.hintKey]) {
        if (!(key in zh)) missing.push(key);
      }
    }
    expect(missing).toEqual([]);
    expect(GUIDE_ITEMS).toHaveLength(3);
  });

  it('九种预检拒因各有各的话（照 dsh 的 installProblem*）', () => {
    const problems = [
      'invalid-spec',
      'already-installed',
      'not-found',
      'not-a-package',
      'not-a-bundle',
      'not-a-workbench-module',
      'not-a-module-or-plugin',
      'network',
      'unknown',
    ] as const;
    const keys = problems.map(problemKey);
    expect(new Set(keys).size).toBe(problems.length);
    for (const key of keys) expect(key in zh, key).toBe(true);
  });

  it('★ 新拒因说人话：外壳 / 协议 / 声明 / 清单 / apiVersion 一个都不许出现（ADR-0038 §2.6.1 那条）', () => {
    const banned = ['外壳', '协议', '声明', '清单', 'apiVersion'];
    const reasonKey = failureReasonKey('not-a-module-or-plugin');
    expect(reasonKey).toBeDefined();
    const seen = [
      t(problemKey('not-a-module-or-plugin')),
      t('panels.market.add.failed', { reason: t(reasonKey ?? '') }),
    ];

    for (const text of seen) {
      for (const word of banned) expect(text, `${word} in ${text}`).not.toContain(word);
      expect(text).toContain('opencli');
    }
  });

  it('★ 「不是组合包」那句只留给判不出的两种（git / tarball）：说清这两种看不出它是什么，并指向包名 / 本地目录', () => {
    const sentence = t('panels.market.add.problemNotBundle', { reason: '没有 cordis.patch.yml' });

    expect(sentence).toContain('git');
    expect(sentence).toContain('tarball');
    expect(sentence).toContain('包名');
    expect(sentence).toContain('本地目录');
    expect(sentence).toContain('判断不出');
  });

  it('★ 按包名来的插件**不再**落到那句：两语言都不许再说"插件不走这个入口 / 改用包名"（那正是自相矛盾的来源）', () => {
    const banned: Readonly<Record<'zh' | 'en', readonly string[]>> = {
      zh: ['不走这里', '不走这个入口', '改用包名'],
      en: ['does not go through here', 'use its package name instead'],
    };
    for (const language of ['zh', 'en'] as const) {
      const sentence = dictionaries[language]['panels.market.add.problemNotBundle'] ?? '';
      for (const word of banned[language]) expect(sentence, `${language}: ${word}`).not.toContain(word);
      expect(sentence, language).toContain('tarball');
    }
  });

  it('★ 预检那两态各画各的：模块态带简介、插件态带插件名（同一个浮层、同一条装的路）', () => {
    const module = previewOf(
      {
        status: 'accepted',
        kind: 'registry',
        name: '@dsh-workbench/module-hello',
        version: '0.1.2',
        description: '最小样本模块',
        bundle: true,
        registry: 'https://r.example/',
      },
      'fallback',
    );
    expect(module).toEqual({
      kind: 'module',
      name: '@dsh-workbench/module-hello',
      version: '0.1.2',
      description: '最小样本模块',
      registry: 'https://r.example/',
    });

    const plugin = previewOf(
      {
        status: 'plugin',
        pkg: 'opencli-plugin-dashboards',
        pluginName: 'dashboards',
        version: '1.0.16',
        registry: null,
      },
      'fallback',
    );
    expect(plugin).toEqual({
      kind: 'plugin',
      name: 'opencli-plugin-dashboards',
      version: '1.0.16',
      description: '',
      registry: '',
      pluginName: 'dashboards',
    });
    expect(previewOf({ status: 'accepted', kind: 'path', bundle: null, registry: null }, 'fallback')).toMatchObject({
      kind: 'module',
      name: 'fallback',
    });
  });

  it('★ 装完那句话按结果分档：插件这一档排在"要重启"前面，永远不说重启', () => {
    const at = (application: string, supplyState = 'no-needs', plugin = false): string =>
      resultKindOf({
        change: change({ application: application as BundleChange['application'] }),
        supplyState,
        plugin,
      });

    expect(at('applied', 'no-needs', true)).toBe('plugin');
    expect(at('applied')).toBe('took-effect');
    expect(at('failed')).toBe('failed');
    expect(at('restart-required')).toBe('restart');
    expect(at('cancelled')).toBe('quiet');
    expect(at('applied', 'not-a-module')).toBe('quiet');
  });

  it('★ 要重启时连「为什么」一起说出来：五种理由各有自己一句人话，中英都有，参数也填上了', () => {
    for (const reason of RESTART_REASONS) {
      const key = `panels.market.add.restartWhy.${reason}`;
      expect(restartWhyKey(reason), reason).toBe(key);
      expect((zh as Record<string, string>)[key], reason).toBeTruthy();
      expect(dictionaries.en[key as never], reason).toBeTruthy();
      expect((zh as Record<string, string>)[key], reason).not.toContain('{');
    }

    const why = restartWhy(change({ application: 'restart-required', restartReason: 'package-moved' }), t);
    expect(why).toContain('为什么这一版要重启');
    expect(why).toContain((zh as Record<string, string>)['panels.market.add.restartWhy.package-moved']);

    expect(restartWhyKey(undefined)).toBeUndefined();
    expect(restartWhy(change({ application: 'restart-required' }), t)).toBeUndefined();
    expect(restartWhy(change({ application: 'applied', restartReason: 'no-hmr' }), t)).toBeTruthy();
  });

  it('★ 检测态要看得见（ADR-0022 的可见下限）：检测完那一小会儿还是"检测中"，别的相位不许被按住', () => {
    expect(heldWizardPhase('inspecting', true)).toBe('inspecting');
    expect(heldWizardPhase('preview', true)).toBe('inspecting');
    expect(heldWizardPhase('idle', true)).toBe('inspecting');
    expect(heldWizardPhase('preview', false)).toBe('preview');
    expect(heldWizardPhase('idle', false)).toBe('idle');
    expect(heldWizardPhase('installing', true)).toBe('installing');
    expect(heldWizardPhase('result', true)).toBe('result');
  });

  it('失败原因：错误码优先、其次 pnpm 的失败种类、最后才是 application；Git 直连失败单独一类', () => {
    expect(
      failureCode(
        change({
          errorCode: 'disk-full',
          packageResult: { exitCode: 1, output: '', truncated: false, logPath: '', kind: 'build-blocked' },
        }),
      ),
    ).toBe('disk-full');
    expect(failureCode(change({ failedAt: 'spec-host' }))).toBe('spec-host');
    expect(failureReasonKey('build-blocked')).toBe('panels.market.add.failureBuildBlocked');
    expect(failureReasonKey('already-installed')).toBe('panels.market.add.failureInstalled');
    expect(failureReasonKey('something-new')).toBeUndefined();
    expect(failureReason('disk-full', 'failed', t)).toBe('磁盘空间不足，安装已停止');
    expect(failureReason('failed', 'failed', t)).toBe('没成功，但它没说是为什么（详情见安装输出的那一行）');
    expect(failureReason('some-new-code', 'failed', t)).toBe('some-new-code');
  });

  it('供给四种说法各一，no-needs 不说话', () => {
    expect(supplyKey('installed')).toBeUndefined();
    expect(supplyKey('pending-restart')).toBe('panels.market.add.supplyPending');
    expect(supplyKey('failed')).toBe('panels.market.add.supplyFailed');
    expect(supplyKey('not-a-module')).toBe('panels.market.add.notModule');
    expect(supplyKey('no-needs')).toBeUndefined();
  });

  it('结果话术：cancelled 不说成失败', () => {
    expect(verdictKey(change({ application: 'applied' }))).toBe('panels.market.add.doneApplied');
    expect(verdictKey(change({ application: 'restart-required' }))).toBe('panels.market.add.doneRestart');
    expect(verdictKey(change({ application: 'cancelled' }))).toBe('panels.market.add.cancelled');
    expect(verdictKey(change({ stage: 'remove', application: 'applied' }))).toBe(
      'panels.market.add.removed',
    );
    expect(verdictKey(change({ stage: 'remove', application: 'restart-required' }))).toBe(
      'panels.market.add.removedRestart',
    );
    expect(verdictKey(change({ application: 'failed' }))).toBe('panels.market.add.failed');
  });
});
