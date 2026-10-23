import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { Fragment, h, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from './react.js';

describe('react 入口', () => {
  it('h 就是 React.createElement（同一个引用，不是包装）', () => {
    expect(h).toBe(React.createElement);
  });

  it('h 造出真正的 React 元素', () => {
    const element = h('div', { className: 'x' }, 'hi') as { type: string; props: Record<string, unknown> };
    expect(element.type).toBe('div');
    expect(element.props.className).toBe('x');
    expect(element.props.children).toBe('hi');
    expect(React.isValidElement(element)).toBe(true);
  });

  it('Fragment 与 hooks 都是 React 自己的', () => {
    expect(Fragment).toBe(React.Fragment);
    expect(useState).toBe(React.useState);
    expect(useEffect).toBe(React.useEffect);
    expect(useLayoutEffect).toBe(React.useLayoutEffect);
    expect(useMemo).toBe(React.useMemo);
    expect(useCallback).toBe(React.useCallback);
    expect(useRef).toBe(React.useRef);
  });
});
