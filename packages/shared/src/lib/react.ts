import type * as ReactTypes from 'react';

const react = require('react') as typeof ReactTypes;

export const h = react.createElement;

export const Fragment = react.Fragment;

export const Component = react.Component;

export const createContext = react.createContext;
export const useContext = react.useContext;

export const useState = react.useState;
export const useEffect = react.useEffect;
export const useLayoutEffect = react.useLayoutEffect;
export const useMemo = react.useMemo;
export const useCallback = react.useCallback;
export const useRef = react.useRef;
export const useSyncExternalStore = react.useSyncExternalStore;

export type { ReactNode, CSSProperties, ChangeEvent } from './react-types.js';
