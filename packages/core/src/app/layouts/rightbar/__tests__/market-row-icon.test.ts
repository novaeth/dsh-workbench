import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { IconBrandMark, IconModuleMark, IconNpm, IconOpencli } from '@dsh-workbench/shared';
import {
  marketRowKind,
  packageIcon,
  sharedRowKind,
  type PackageKind,
} from '../market-row-icon';
import type { MarketRow } from '../market-row-types';
import type { SharedRow } from '../market-rows';

const KINDS: readonly PackageKind[] = ['module', 'plugin', 'lib', 'workbench'];

function typeOf(kind: PackageKind): unknown {
  return (packageIcon(kind) as { type?: unknown }).type;
}

function moduleRow(extra: Partial<MarketRow> = {}): MarketRow {
  return {
    id: 'x',
    titleKey: 'x.title',
    state: 'installed',
    canInstall: false,
    canUpdate: false,
    canUninstall: false,
    ...extra,
  };
}

function sharedRow(kind: 'plugin' | 'lib'): SharedRow {
  return { id: `${kind}:x`, kind, label: 'x', usedByKeys: [], state: 'installed', canUpdate: false };
}

describe('包那一类行的图标', () => {
  it('★ 四种类型各有各的图标（模块 / opencli 插件 / npm 包 / 工作台自己）', () => {
    const types = KINDS.map(typeOf);

    for (const [index, type] of types.entries()) expect(type, KINDS[index]).toBeTruthy();
    expect(new Set(types).size).toBe(KINDS.length);
  });

  it('四枚一样大（行上那处方块里不许有大有小）', () => {
    for (const kind of KINDS) {
      expect((packageIcon(kind) as { props?: { size?: number } }).props?.size, kind).toBe(18);
    }
  });

  it('模块行：默认是模块；插件行是插件；工作台那一行是工作台自己', () => {
    expect(marketRowKind(moduleRow())).toBe('module');
    expect(marketRowKind(moduleRow({ local: true }))).toBe('module');
    expect(marketRowKind(moduleRow({ plugin: true }))).toBe('plugin');
    expect(marketRowKind(moduleRow({ workbench: true }))).toBe('workbench');
    expect(marketRowKind(moduleRow({ workbench: true, plugin: true }))).toBe('workbench');
  });

  it('共用依赖那些行：插件一份、普通 npm 包另一份', () => {
    expect(sharedRowKind(sharedRow('plugin'))).toBe('plugin');
    expect(sharedRowKind(sharedRow('lib'))).toBe('lib');
  });

  it('★ 工作台那一行用的是工作台自己的标（显示器里放鲸鱼尾巴）', () => {
    expect((packageIcon('workbench') as { type?: unknown }).type).toBe(IconBrandMark);
  });

  it('★ 模块那枚是我们自己的彩色标（不是单色四宫格、也不是插件/npm 那两枚）', () => {
    expect((packageIcon('module') as { type?: unknown }).type).toBe(IconModuleMark);
  });

  it('★ 那枚模块标自带品牌渐变（要改成跟行上一样单色：把 fill 换成 currentColor）', () => {
    const shell = IconModuleMark({ size: 16 }) as { props: { children: unknown } };
    const flat = JSON.stringify(shell.props.children);

    expect(flat).toContain('workbench-module-mark');
    expect(flat).toContain('#3b82f6');
    expect(flat).toContain('#14b8a6');
  });

  it('★ opencli 插件那枚用的是 opencli 的终端方块（不是箱子、也不是 npm 字标）', () => {
    expect((packageIcon('plugin') as { type?: unknown }).type).toBe(IconOpencli);
  });

  it('★ npm 包那枚用的是 npm 自己的字标（不是模块的四宫格、也不是插件图）', () => {
    expect((packageIcon('lib') as { type?: unknown }).type).toBe(IconNpm);
  });

  it('★ 那枚字标保留 npm 的品牌红（要改成跟行上一样单色：把 fill 换成 currentColor）', () => {
    const shell = IconNpm({ size: 16 }) as {
      props: { children: { props: { fill?: string } } };
    };

    expect(shell.props.children.props.fill).toBe('#CB3837');
  });

  it('★ 两条行渲染都按类型取图标（哪天又写死一枚，这里就红）', () => {
    expect(readFileSync(new URL('../market-section.tsx', import.meta.url), 'utf8')).toContain(
      'packageIcon(marketRowKind(row))',
    );
    expect(readFileSync(new URL('../SharedSection.tsx', import.meta.url), 'utf8')).toContain(
      'packageIcon(sharedRowKind(row))',
    );
  });
});
