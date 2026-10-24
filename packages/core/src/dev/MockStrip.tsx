import { createElement as h } from 'react';

import '@/shared/styles/mock-strip.css';

export function MockStrip({
  mocks,
  index,
  onPick,
  note,
  real,
}: {
  readonly mocks: readonly { readonly id: string; readonly label: string }[];
  readonly index: number;
  readonly onPick: (next: number) => void;
  readonly note?: string;
  readonly real?: { readonly label: string; readonly active: boolean; readonly onPick: () => void } | undefined;
}) {
  return (
    <div className="wb-mockStrip">
      <span className="wb-mockNote">{note ?? '夹具：只切状态，不发请求'}</span>
      {real === undefined ? null : (
        <button
          type="button"
          className={`wb-mockChip${real.active ? ' wb-mockChipOn' : ''}`}
          onClick={real.onPick}
        >
          {real.label}
        </button>
      )}
      {mocks.map((mock, at) => (
        <button
          key={mock.id}
          type="button"
          className={`wb-mockChip${at === index ? ' wb-mockChipOn' : ''}`}
          onClick={() => onPick(at)}
        >
          {mock.label}
        </button>
      ))}
    </div>
  );
}
