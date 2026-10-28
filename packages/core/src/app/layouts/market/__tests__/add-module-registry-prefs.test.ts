import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  STORAGE_KEY_MARKET_REGISTRY,
  STORAGE_KEY_MARKET_REGISTRY_CUSTOM,
} from '@dsh-workbench/shared';
import { registryOptions } from '../add-module-text';
import {
  DEFAULT_REGISTRY_CHOICE,
  parseRegistryChoice,
  readRegistryPrefs,
  reconcileRegistryChoice,
  writeRegistryChoice,
  writeRegistryCustom,
} from '../add-module-registry-prefs';

function memoryStorage(entries: Record<string, string> = {}) {
  const data = new Map(Object.entries(entries));
  return {
    data,
    storage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
    },
  };
}

function useStorage(entries: Record<string, string> = {}) {
  const fake = memoryStorage(entries);
  vi.stubGlobal('window', { localStorage: fake.storage });
  return fake;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseRegistryChoice', () => {
  it('没存过、存的不是 JSON、不是那三种 kind → 都当默认源', () => {
    expect(parseRegistryChoice(null)).toEqual(DEFAULT_REGISTRY_CHOICE);
    expect(parseRegistryChoice('not json')).toEqual(DEFAULT_REGISTRY_CHOICE);
    expect(parseRegistryChoice('null')).toEqual(DEFAULT_REGISTRY_CHOICE);
    expect(parseRegistryChoice('"custom"')).toEqual(DEFAULT_REGISTRY_CHOICE);
    expect(parseRegistryChoice('{"kind":"mirror"}')).toEqual(DEFAULT_REGISTRY_CHOICE);
  });

  it('★ 默认源与自定义地址不依赖 value；URL 源只认 http(s) 并去掉两头的空白', () => {
    expect(parseRegistryChoice('{"kind":"default","value":"https://r.example/"}')).toEqual(
      DEFAULT_REGISTRY_CHOICE,
    );
    expect(parseRegistryChoice('{"kind":"custom"}')).toEqual({ kind: 'custom', value: '' });
    expect(parseRegistryChoice('{"kind":"url","value":"  https://r.example/  "}')).toEqual({
      kind: 'url',
      value: 'https://r.example/',
    });
    expect(parseRegistryChoice('{"kind":"url","value":"r.example"}')).toEqual(DEFAULT_REGISTRY_CHOICE);
    expect(parseRegistryChoice('{"kind":"url"}')).toEqual(DEFAULT_REGISTRY_CHOICE);
  });
});

describe('readRegistryPrefs', () => {
  it('没存过 → 默认源 + 空地址（不崩）', () => {
    useStorage();
    expect(readRegistryPrefs()).toEqual({ choice: DEFAULT_REGISTRY_CHOICE, custom: '' });
  });

  it('localStorage 不可用（隐私模式）→ 同样给默认，不崩', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('denied');
        },
      },
    });
    expect(readRegistryPrefs()).toEqual({ choice: DEFAULT_REGISTRY_CHOICE, custom: '' });
  });

  it('★ 选过的源与上次填的私有地址一起读回来', () => {
    useStorage({
      [STORAGE_KEY_MARKET_REGISTRY]: '{"kind":"custom","value":""}',
      [STORAGE_KEY_MARKET_REGISTRY_CUSTOM]: '  https://npm.corp.example/private/  ',
    });
    expect(readRegistryPrefs()).toEqual({
      choice: { kind: 'custom', value: '' },
      custom: 'https://npm.corp.example/private/',
    });
  });

  it('★ 上次填的地址原样读回来（是不是合法地址由输入框自己判，不在这一层丢字）', () => {
    useStorage({ [STORAGE_KEY_MARKET_REGISTRY_CUSTOM]: '  https://npm.corp.example/private/  ' });
    expect(readRegistryPrefs().custom).toBe('https://npm.corp.example/private/');
    useStorage({ [STORAGE_KEY_MARKET_REGISTRY_CUSTOM]: 'npm.corp.example' });
    expect(readRegistryPrefs().custom).toBe('npm.corp.example');
  });
});

describe('writeRegistryChoice', () => {
  it('★ 只写认识的形状：custom / http(s) 的 url / 其余落回默认', () => {
    const fake = useStorage();
    writeRegistryChoice({ kind: 'custom', value: '' });
    expect(fake.data.get(STORAGE_KEY_MARKET_REGISTRY)).toBe('{"kind":"custom","value":""}');

    writeRegistryChoice({ kind: 'url', value: '  https://r.example/npm/  ' });
    expect(fake.data.get(STORAGE_KEY_MARKET_REGISTRY)).toBe(
      '{"kind":"url","value":"https://r.example/npm/"}',
    );

    writeRegistryChoice({ kind: 'url', value: 'r.example' });
    expect(fake.data.get(STORAGE_KEY_MARKET_REGISTRY)).toBe('{"kind":"default","value":""}');

    writeRegistryChoice({ kind: 'default', value: 'https://r.example/' });
    expect(fake.data.get(STORAGE_KEY_MARKET_REGISTRY)).toBe('{"kind":"default","value":""}');
  });
});

describe('writeRegistryCustom', () => {
  it('★ 每敲一个字都记下来（下次接着填），两头空白不要', () => {
    const fake = useStorage();
    writeRegistryCustom(' https://npm.corp.example/ ');
    expect(fake.data.get(STORAGE_KEY_MARKET_REGISTRY_CUSTOM)).toBe('https://npm.corp.example/');

    writeRegistryCustom('https://npm.corp.example/priv');
    expect(fake.data.get(STORAGE_KEY_MARKET_REGISTRY_CUSTOM)).toBe('https://npm.corp.example/priv');

    writeRegistryCustom('https://npm.');
    expect(fake.data.get(STORAGE_KEY_MARKET_REGISTRY_CUSTOM)).toBe('https://npm.');
  });

  it('清空输入 → 连记住的地址一起删掉', () => {
    const fake = useStorage({ [STORAGE_KEY_MARKET_REGISTRY_CUSTOM]: 'https://r.example/' });
    writeRegistryCustom('   ');
    expect(fake.data.has(STORAGE_KEY_MARKET_REGISTRY_CUSTOM)).toBe(false);
  });

  it('localStorage 不可用（隐私模式）不崩', () => {
    vi.stubGlobal('window', {
      localStorage: {
        setItem: () => {
          throw new Error('denied');
        },
      },
    });
    expect(() => writeRegistryCustom('https://r.example/')).not.toThrow();
  });
});

describe('reconcileRegistryChoice', () => {
  const choices = registryOptions({
    registry: 'https://registry.npmmirror.com/',
    fallbackRegistries: [],
    resolved: null,
  });

  it('★ 存过的源现在还在列表里 → 保持用户那次选择', () => {
    const choice = { kind: 'url', value: 'https://registry.npmmirror.com/' } as const;
    expect(reconcileRegistryChoice(choice, choices)).toEqual(choice);
  });

  it('★ 存的源宿主已经不再提供（换过 profile 配置）→ 落回默认，不拿旧地址去发请求', () => {
    expect(reconcileRegistryChoice({ kind: 'url', value: 'https://gone.example/' }, choices)).toEqual(
      DEFAULT_REGISTRY_CHOICE,
    );
  });

  it('默认源与自定义地址不用对列表（列表里永远有这两项）', () => {
    expect(reconcileRegistryChoice(DEFAULT_REGISTRY_CHOICE, [])).toEqual(DEFAULT_REGISTRY_CHOICE);
    expect(reconcileRegistryChoice({ kind: 'custom', value: '' }, [])).toEqual({
      kind: 'custom',
      value: '',
    });
  });
});
