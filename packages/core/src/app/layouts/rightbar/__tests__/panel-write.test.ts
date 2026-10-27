import { describe, expect, it } from 'vitest';
import { machineBoardSignature, nextPending, panelBoardSignature } from '../panel-write';

const row = (id: string, shown: boolean, source: 'default' | 'user') => ({ id, shown, source });

describe('写完要等面板读回来（禁用挂在读数上，不是挂在写响应上）', () => {
  it('★ 同一份读数 → 同一个签名（否则每个渲染都会自己解禁）', () => {
    const units = [row('a', true, 'user')];
    const plugins = [row('plugin:x', false, 'user')];

    expect(panelBoardSignature(units, plugins, true)).toBe(panelBoardSignature(units, plugins, true));
    expect(panelBoardSignature([], [], false)).toBe('||0');
  });

  it('★ 开 / 关 / 勾默认 / 顺序 / 插件行 / 有没有自己那份板：读数里任一处变了，签名就变', () => {
    const base = panelBoardSignature([row('a', true, 'user'), row('b', false, 'user')], [], false);

    expect(panelBoardSignature([row('a', false, 'user'), row('b', false, 'user')], [], false)).not.toBe(base);
    expect(panelBoardSignature([row('a', true, 'default'), row('b', false, 'user')], [], false)).not.toBe(base);
    expect(panelBoardSignature([row('b', false, 'user'), row('a', true, 'user')], [], false)).not.toBe(base);
    expect(
      panelBoardSignature([row('a', true, 'user'), row('b', false, 'user')], [row('plugin:x', true, 'user')], false),
    ).not.toBe(base);
    expect(panelBoardSignature([row('a', true, 'user'), row('b', false, 'user')], [], true)).not.toBe(base);
  });

  it('★ 机器级默认板：名单与"几个工作区改过"变了才变，名单次序不算（它的读法本来就没次序）', () => {
    expect(machineBoardSignature(['b', 'a'], {})).toBe(machineBoardSignature(['a', 'b'], {}));
    expect(machineBoardSignature([], { a: 1, b: 2 })).toBe(machineBoardSignature([], { b: 2, a: 1 }));
    expect(machineBoardSignature(['a'], { a: 1 })).not.toBe(machineBoardSignature(['a'], {}));
    expect(machineBoardSignature(['a'], {})).not.toBe(machineBoardSignature([], {}));
  });

  it('★ 读数变了才解禁；还没变、或本来就没在等 → 继续按住 / 保持不动', () => {
    expect(nextPending('x', 'x')).toBe('x');
    expect(nextPending('x', 'y')).toBeNull();
    expect(nextPending(null, 'x')).toBeNull();
  });
});
