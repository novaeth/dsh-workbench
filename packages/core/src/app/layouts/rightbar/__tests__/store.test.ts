import { afterEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEY_RIGHTBAR, STORAGE_KEY_RIGHTBAR_COLUMN } from '@dsh-workbench/shared';
import {
  createRightbarStore,
  pressedColumns,
  readFlag,
  writeFlag,
  RIGHTBAR_DEFAULT_COLUMN,
  RIGHTBAR_DEFAULT_EXPANDED,
  type RightbarPersistence,
  type RightbarState,
} from '../store';

function memoryPersistence(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const writes: Array<[string, string]> = [];
  const persistence: RightbarPersistence = {
    readFlag: (key, fallback) => {
      const raw = data.get(key);
      if (raw === undefined) return fallback;
      return raw === 'true';
    },
    writeFlag: (key, value) => {
      writes.push([key, String(value)]);
      data.set(key, String(value));
    },
    readText: (key) => data.get(key) ?? null,
    writeText: (key, value) => {
      if (value === null) data.delete(key);
      else data.set(key, value);
    },
  };
  return { persistence, writes, data };
}

describe('createRightbarStore', () => {
  it('默认展开（产品是"对话常驻 + 旁边看数据"）', () => {
    const store = createRightbarStore(memoryPersistence().persistence);
    expect(store.getSnapshot().expanded).toBe(RIGHTBAR_DEFAULT_EXPANDED);
    expect(store.getSnapshot().trail).toEqual([{ kind: 'board' }]);
  });

  it('记住的状态盖过默认值', () => {
    const store = createRightbarStore(memoryPersistence({ [STORAGE_KEY_RIGHTBAR]: 'false' }).persistence);
    expect(store.getSnapshot().expanded).toBe(false);
  });

  it('脏值不把面板打开：只有字面量 true 才算展开', () => {
    const store = createRightbarStore(memoryPersistence({ [STORAGE_KEY_RIGHTBAR]: 'yes' }).persistence);
    expect(store.getSnapshot().expanded).toBe(false);
  });

  it('切换展开会写回存储', () => {
    const { persistence, writes } = memoryPersistence();
    const store = createRightbarStore(persistence);

    store.toggleExpanded();
    expect(store.getSnapshot().expanded).toBe(false);
    expect(writes).toEqual([[STORAGE_KEY_RIGHTBAR, 'false']]);

    store.toggleExpanded();
    expect(store.getSnapshot().expanded).toBe(true);
    expect(writes.at(-1)).toEqual([STORAGE_KEY_RIGHTBAR, 'true']);
  });

  it('设置成同一个值不写存储、不通知', () => {
    const { persistence, writes } = memoryPersistence();
    const store = createRightbarStore(persistence);
    let notified = 0;
    store.subscribe(() => {
      notified += 1;
    });

    store.setExpanded(RIGHTBAR_DEFAULT_EXPANDED);
    expect(writes).toEqual([]);
    expect(notified).toBe(0);
  });

  it('导航：推进一层 → 回退 → 再推进', () => {
    const store = createRightbarStore(memoryPersistence().persistence);

    store.open({ kind: 'issues' });
    expect(store.getSnapshot().trail).toEqual([{ kind: 'board' }, { kind: 'issues' }]);

    store.back();
    expect(store.getSnapshot().trail).toEqual([{ kind: 'board' }]);
  });

  it('栈底回退不动（看板是根）', () => {
    const store = createRightbarStore(memoryPersistence().persistence);
    const before = store.getSnapshot();
    store.back();
    expect(store.getSnapshot()).toBe(before);
  });

  it('面包屑回退：goTo 截断而不是压栈', () => {
    const store = createRightbarStore(memoryPersistence().persistence);
    store.open({ kind: 'issues' });

    store.goTo(0);
    expect(store.getSnapshot().trail).toEqual([{ kind: 'board' }]);

    store.open({ kind: 'issues' });
    expect(store.getSnapshot().trail).toEqual([{ kind: 'board' }, { kind: 'issues' }]);
  });

  it('goTo 越界忽略', () => {
    const store = createRightbarStore(memoryPersistence().persistence);
    const before = store.getSnapshot();
    store.goTo(-1);
    store.goTo(9);
    expect(store.getSnapshot()).toBe(before);
  });

  it('连续打开同一层不重复入栈', () => {
    const store = createRightbarStore(memoryPersistence().persistence);
    store.open({ kind: 'issues' });
    const after = store.getSnapshot();
    store.open({ kind: 'issues' });
    expect(store.getSnapshot()).toBe(after);
    expect(store.getSnapshot().trail).toHaveLength(2);
  });

  it('订阅能收到通知，退订后不再收到', () => {
    const store = createRightbarStore(memoryPersistence().persistence);
    let notified = 0;
    const unsubscribe = store.subscribe(() => {
      notified += 1;
    });

    store.open({ kind: 'issues' });
    expect(notified).toBe(1);

    unsubscribe();
    store.open({ kind: 'issues' });
    expect(notified).toBe(1);
  });

  it('快照引用在没变化时保持稳定（React 靠它判断要不要重渲染）', () => {
    const store = createRightbarStore(memoryPersistence().persistence);
    const first = store.getSnapshot();
    expect(store.getSnapshot()).toBe(first);

    store.open({ kind: 'issues' });
    expect(store.getSnapshot()).not.toBe(first);
  });

  it('默认占工作台那一列（官方右栏要用户点了才上位）', () => {
    const store = createRightbarStore(memoryPersistence().persistence);
    expect(store.getSnapshot().column).toBe(RIGHTBAR_DEFAULT_COLUMN);
  });

  it('记住的列盖过默认值', () => {
    const store = createRightbarStore(
      memoryPersistence({ [STORAGE_KEY_RIGHTBAR_COLUMN]: 'dsh' }).persistence,
    );
    expect(store.getSnapshot().column).toBe('dsh');
  });

  it('脏值回落到工作台那一列：只有字面量 dsh 才算让位', () => {
    const store = createRightbarStore(
      memoryPersistence({ [STORAGE_KEY_RIGHTBAR_COLUMN]: 'official' }).persistence,
    );
    expect(store.getSnapshot().column).toBe(RIGHTBAR_DEFAULT_COLUMN);
  });

  it('切列写回存储并通知；同一列第二次切不动', () => {
    const { persistence, writes, data } = memoryPersistence();
    const store = createRightbarStore(persistence);
    let notified = 0;
    store.subscribe(() => {
      notified += 1;
    });

    store.setColumn('dsh');
    expect(store.getSnapshot().column).toBe('dsh');
    expect(data.get(STORAGE_KEY_RIGHTBAR_COLUMN)).toBe('dsh');
    expect(notified).toBe(1);

    store.setColumn('dsh');
    expect(notified).toBe(1);

    store.setColumn('workbench');
    expect(store.getSnapshot().column).toBe('workbench');
    expect(writes).toEqual([]);
    expect(notified).toBe(2);
  });

  it('切列不动展开态，展开态也不动列', () => {
    const { persistence } = memoryPersistence();
    const store = createRightbarStore(persistence);

    store.setColumn('dsh');
    expect(store.getSnapshot().expanded).toBe(RIGHTBAR_DEFAULT_EXPANDED);

    store.toggleExpanded();
    expect(store.getSnapshot().column).toBe('dsh');
    expect(store.getSnapshot().expanded).toBe(!RIGHTBAR_DEFAULT_EXPANDED);
  });
});

describe('pressedColumns', () => {
  const state = (column: RightbarState['column'], expanded: boolean): RightbarState => ({
    column,
    expanded,
    trail: [{ kind: 'board' }],
  });

  it('亮的是「那一列正开着」的那颗，不是「上次点过的」那颗', () => {
    expect(pressedColumns(state('workbench', true), true)).toEqual({ workbench: true, dsh: false });
    expect(pressedColumns(state('workbench', false), true)).toEqual({ workbench: false, dsh: false });
    expect(pressedColumns(state('dsh', true), true)).toEqual({ workbench: false, dsh: true });
    expect(pressedColumns(state('dsh', false), false)).toEqual({ workbench: false, dsh: false });
  });

  it('没占着右栏的那一列不看它自己的开合（不亮）', () => {
    expect(pressedColumns(state('workbench', true), true).dsh).toBe(false);
    expect(pressedColumns(state('dsh', true), true).workbench).toBe(false);
  });
});

describe('布尔开关（localStorage 那一层）', () => {
  const fakeWindow = () => {
    const data = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => data.set(key, value),
        removeItem: (key: string) => data.delete(key),
      },
    });
    return data;
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('没存过时读回默认值', () => {
    fakeWindow();
    expect(readFlag('missing', true)).toBe(true);
    expect(readFlag('missing', false)).toBe(false);
  });

  it('按字面量往返', () => {
    fakeWindow();
    writeFlag('on', true);
    writeFlag('off', false);
    expect(readFlag('on', false)).toBe(true);
    expect(readFlag('off', true)).toBe(false);
  });

  it('只有字面量 "true" 算真：脏数据不因为"非空"就把开关打开', () => {
    fakeWindow();
    writeFlag('weird', true);
    window.localStorage.setItem('weird', 'yes');
    expect(readFlag('weird', true)).toBe(false);
    expect(readFlag('never', true)).toBe(true);
  });
});
