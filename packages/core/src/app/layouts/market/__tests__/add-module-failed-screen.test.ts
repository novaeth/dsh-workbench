import { describe, expect, it, vi } from 'vitest';
import { zh, type Translate } from '@dsh-workbench/shared';
import { AddModuleDialog } from '../AddModuleDialog';
import { ADD_MODULE_MOCKS, stateOfMock } from '../add-module-mock';
import type { AddModuleState } from '../use-add-module';

const t = ((key: string, params?: Readonly<Record<string, string>>) => {
  let text = (zh as Record<string, string>)[key] ?? key;
  for (const [name, value] of Object.entries(params ?? {})) text = text.replace(`{${name}}`, value);
  return text;
}) as unknown as Translate;

const holder = vi.hoisted(() => ({ state: undefined as unknown as AddModuleState }));

vi.mock('@/shared/dev-surface', () => ({
  devSurface: {
    useStrips: () => ({ current: undefined, strip: null }),
    addModuleState: (base: unknown) => base,
  },
}));

vi.mock('../use-add-module', () => ({
  useAddModule: () => holder.state,
}));

interface ComponentElement {
  readonly type: (props: Record<string, unknown>) => unknown;
  readonly props: Record<string, unknown>;
}

function invoke(node: unknown): unknown {
  const element = node as unknown as ComponentElement;
  return element.type(element.props);
}

function texts(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return out;
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    for (const item of node) texts(item, out);
    return out;
  }
  const props = (node as { props?: { children?: unknown } }).props;
  if (props !== undefined && props.children !== undefined) {
    texts(props.children, out);
    return out;
  }
  const type = (node as { type?: unknown }).type;
  if (typeof type === 'function') {
    texts((type as (input: unknown) => unknown)(props ?? {}), out);
  }
  return out;
}

interface ScreenButton {
  readonly label: string;
  readonly onClick: (() => void) | undefined;
}

function buttonsOf(node: unknown, out: ScreenButton[] = []): ScreenButton[] {
  if (
    node === null ||
    node === undefined ||
    typeof node === 'boolean' ||
    typeof node === 'string' ||
    typeof node === 'number'
  ) {
    return out;
  }
  if (Array.isArray(node)) {
    for (const item of node) buttonsOf(item, out);
    return out;
  }
  const props = (node as { props?: Record<string, unknown> }).props;
  if (props === undefined) return out;
  const onClick = props['onClick'];
  if (typeof onClick === 'function') {
    out.push({ label: texts(props['children']).join('|'), onClick: onClick as () => void });
  }
  if (props['children'] !== undefined) {
    buttonsOf(props['children'], out);
    return out;
  }
  const type = (node as { type?: unknown }).type;
  if (typeof type === 'function') {
    buttonsOf((type as (input: unknown) => unknown)(props), out);
  }
  return out;
}

function stateOf(id: string): AddModuleState {
  const mock = ADD_MODULE_MOCKS.find((one) => one.id === id);
  if (mock === undefined) throw new Error(`夹具里没有 ${id}`);
  return stateOfMock({ choices: [] } as unknown as AddModuleState, mock);
}

function screenOf(state: AddModuleState, onClose: () => void): { body: string; buttons: ScreenButton[] } {
  holder.state = state;
  const modal = invoke(AddModuleDialog({ t, open: true, onClose, onInstalled: () => undefined }));
  const props = (modal as unknown as { props: { children?: unknown; footer?: unknown } }).props;
  return { body: texts(props.children).join('|'), buttons: buttonsOf(props.footer) };
}

describe('添加模块：宿主只回了一句话时那一屏（原本正文全空、只剩关闭）', () => {
  it('★ 失败原因画在正文里，失败的那条命令也一并给出来', () => {
    const state = stateOf('failed-host');
    const { body } = screenOf(state, () => undefined);

    expect(body).toContain(zh['panels.market.add.failedTitle']);
    expect(body).toContain(state.failure ?? '');
    expect(body).toContain(zh['panels.market.add.details']);
    expect(body).toContain(state.installFailure?.command ?? '');
  });

  it('★ 这一屏给得出下一步：更换安装源 / 重试 / 关闭 都接着真动作', () => {
    const edit = vi.fn();
    const install = vi.fn();
    const onClose = vi.fn();
    const { buttons } = screenOf({ ...stateOf('failed-host'), edit, install }, onClose);
    const labels = buttons.map((one) => one.label);

    expect(labels).toContain(zh['panels.market.add.changeRegistry']);
    expect(labels).toContain(zh['panels.market.add.retry']);
    expect(labels).toContain(zh['panels.market.add.close']);

    const pick = (label: string): ScreenButton | undefined => buttons.find((one) => one.label === label);
    pick(zh['panels.market.add.changeRegistry'])?.onClick?.();
    pick(zh['panels.market.add.retry'])?.onClick?.();
    pick(zh['panels.market.add.close'])?.onClick?.();

    expect(edit).toHaveBeenCalledTimes(1);
    expect(install).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('宿主回了结构化失败（有 change）照旧走原来那一屏，不被新分支抢走', () => {
    const { body } = screenOf(stateOf('failed-pnpm'), () => undefined);

    expect(body).toContain(zh['panels.market.add.failedTitle']);
    expect(body).toContain(zh['panels.market.add.failureGeneric']);
    expect(body).toContain('ERR_PNPM_FETCH_404');
  });

  it('装成了的那一屏照旧说装好了，也不多出重试 / 更换安装源', () => {
    const { body, buttons } = screenOf(stateOf('done-applied'), () => undefined);
    const labels = buttons.map((one) => one.label);

    expect(body).toContain(zh['panels.market.add.tookEffect']);
    expect(labels).not.toContain(zh['panels.market.add.retry']);
    expect(labels).not.toContain(zh['panels.market.add.changeRegistry']);
  });
});
