import type { ApiError } from '@dsh-workbench/shared';

export interface ResourceState<T> {
  readonly phase: 'idle' | 'loading' | 'ready' | 'error';
  readonly value?: T;
  readonly error?: ApiError;
  readonly at?: number;
}

export const IDLE: ResourceState<never> = { phase: 'idle' };
export const LOADING: ResourceState<never> = { phase: 'loading' };

export interface TaggedState<T> {
  readonly identity: string;
  readonly state: ResourceState<T>;
}

export function resourceViewOf<T>(
  enabled: boolean,
  current: TaggedState<T>,
  identity: string,
): ResourceState<T> {
  if (!enabled) return IDLE;
  return current.identity === identity ? current.state : LOADING;
}
