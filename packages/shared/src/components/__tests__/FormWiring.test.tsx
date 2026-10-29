import { describe, expect, it, vi } from 'vitest';
import type { FormField, FormProps, FormValue } from '../FormTypes.js';
import { Form } from '../Form.js';

function field(key: string, value: FormValue, validate?: FormField['validate']): FormField {
  return {
    key,
    label: key,
    value,
    onChange: () => {},
    control: (binding) => `${key}:${binding.id}:${String(binding.invalid)}:${String(binding.disabled)}`,
    ...(validate === undefined ? {} : { validate }),
  };
}

vi.mock('../../lib/react.js', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../lib/react.js');
  return {
    ...actual,
    useState: (initial: unknown) => [typeof initial === 'function' ? (initial as () => unknown)() : initial, () => {}],
    useRef: (initial: unknown) => ({ current: initial ?? null }),
    useEffect: () => {},
  };
});

describe('Form 的接线（hooks 换成假的，在 node 里当函数调）', () => {
  function formEvent(): { preventDefault: () => void; prevented: () => boolean } {
    let prevented = false;
    return {
      preventDefault: () => {
        prevented = true;
      },
      prevented: () => prevented,
    };
  }

  function submitHandlerOf(props: FormProps): (event: { preventDefault: () => void }) => void {
    const node = Form(props) as unknown as { props: { onSubmit: (event: { preventDefault: () => void }) => void } };
    return node.props.onSubmit;
  }

  function propsOfForm(onSubmit: (values: Readonly<Record<string, FormValue>>) => void, over: Partial<FormProps> = {}): FormProps {
    return { fields: [field('env', 'prod')], onSubmit, submit: { label: '保存' }, ...over };
  }

  it('★ 没错那一拍：preventDefault（不用浏览器默认提交）并调 onSubmit(values) 一次', () => {
    const seen: (Readonly<Record<string, FormValue>>)[] = [];
    const event = formEvent();

    submitHandlerOf(propsOfForm((values) => void seen.push(values)))(event);

    expect(event.prevented()).toBe(true);
    expect(seen).toEqual([{ env: 'prod' }]);
  });

  it('★ 有错那一拍：不调 onSubmit', () => {
    const onSubmit = vi.fn();
    const fields = [field('project', '', () => '这个项目不存在')];

    submitHandlerOf(propsOfForm(onSubmit, { fields }))({ preventDefault: () => {} });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('★ busy 时 Enter / 点提交都不提交（隐式提交也走这道闸）', () => {
    const onSubmit = vi.fn();

    submitHandlerOf(propsOfForm(onSubmit, { busy: true }))({ preventDefault: () => {} });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('★ disabled 时也不提交（没改动可存那颗钮禁着，回车同样进不来）', () => {
    const onSubmit = vi.fn();

    submitHandlerOf(propsOfForm(onSubmit, { disabled: true }))({ preventDefault: () => {} });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('★ 不可见那格不进 values（过滤发生在提交那一拍）', () => {
    const seen: (Readonly<Record<string, FormValue>>)[] = [];
    const fields = [field('env', 'prod'), { ...field('secret', 'shh'), visible: false }];

    submitHandlerOf(propsOfForm((values) => void seen.push(values), { fields }))({ preventDefault: () => {} });

    expect(seen).toEqual([{ env: 'prod' }]);
  });
});
