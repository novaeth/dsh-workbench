import { useCallback, useState } from 'react';
import { mockModeOn } from '@/shared/hooks/mock-mode';

export interface PickableFixture {
  readonly id: string;
  readonly label: string;
}

export interface FixturePickOptions<T extends PickableFixture> {
  readonly fixtures: readonly T[];
  readonly selected?: string | null | undefined;
  readonly onSelect?: ((id: string | null) => void) | undefined;
  readonly enabled?: boolean | undefined;
  readonly initial?: string | null | undefined;
}

export interface FixturePick<T extends PickableFixture> {
  readonly enabled: boolean;
  readonly active: string | null;
  readonly current: T | undefined;
  pick(id: string | null): void;
  readonly nonce: number;
  readonly index: number;
}

export function useFixturePick<T extends PickableFixture>(options: FixturePickOptions<T>): FixturePick<T> {
  const controlled = options.selected !== undefined || options.onSelect !== undefined;
  const [ownActive, setOwnActive] = useState<string | null>(options.initial ?? null);
  const [nonce, setNonce] = useState(0);
  const [on] = useState(() => mockModeOn(window.location.search));
  const enabled = options.enabled ?? on;

  const active = controlled ? (options.selected ?? null) : ownActive;
  const pick = useCallback(
    (id: string | null): void => {
      if (!controlled) setOwnActive(id);
      options.onSelect?.(id);
      setNonce((value) => value + 1);
    },
    [controlled, options],
  );

  return {
    enabled,
    active,
    current: options.fixtures.find((fixture) => fixture.id === active),
    pick,
    nonce,
    index: options.fixtures.findIndex((fixture) => fixture.id === active),
  };
}
