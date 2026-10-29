import { describe, expect, expectTypeOf, it } from 'vitest';
import type { FormFieldOf, FormProps } from '../FormTypes.js';

type Draft = { readonly env: string; readonly branch?: string };

type Submitted = Parameters<FormProps<Draft>['onSubmit']>[0];
type EnvField = Extract<FormFieldOf<Draft>, { readonly key: 'env' }>;
type BranchField = Extract<FormFieldOf<Draft>, { readonly key: 'branch' }>;
type AcceptedKeys = Pick<FormFieldOf<Draft>, 'key'>['key'];
type StrangerKeyAccepted = { readonly key: 'nope' } extends Pick<FormFieldOf<Draft>, 'key'> ? true : false;

const draft: FormFieldOf<Draft> = {
  key: 'env',
  label: '环境',
  value: 'stage',
  onChange: (next) => void next.trim(),
  control: (binding) => binding.value,
};

describe('Form<Values> 把每一格的键与值钉住（这几条由 tsc 核，`vitest run` 跑的是最后那条 expect）', () => {
  it('★ 键只取 Values 的键、值只取那一键的类型；会隐藏的键写成可选键，提交表跟着带上 undefined', () => {
    expectTypeOf<AcceptedKeys>().toEqualTypeOf<'env' | 'branch'>();
    expectTypeOf<StrangerKeyAccepted>().toEqualTypeOf<false>();
    expectTypeOf<EnvField['value']>().toEqualTypeOf<string>();
    expectTypeOf<EnvField['onChange']>().toEqualTypeOf<(next: string) => void>();
    expectTypeOf<BranchField['value']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<Submitted>().toEqualTypeOf<Readonly<Draft>>();
    expectTypeOf<Submitted['branch']>().toEqualTypeOf<string | undefined>();
    expect(draft.key).toBe('env');
  });
});
