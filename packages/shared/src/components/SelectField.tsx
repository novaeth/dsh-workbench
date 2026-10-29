import type { KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from 'react';
import type { MenuEntry, MenuItem } from '@deepseek-ai/dsh-client-ui-primitives';
import { h, useEffect, useMemo, useRef, useState } from '../lib/react.js';
import { IconSearchOutlineRegular, Menu } from '@deepseek-ai/dsh-client-ui-primitives';
import { selectLoadingNode, selectTriggerNode } from './SelectFieldNodes.js';
import { Field } from './Field.js';
import { TextField } from './TextField.js';
import './SelectField.css';

/** 一个候选项：值、人看的标签，可带搜索词、图标、分组与禁用标记。 */
export interface SelectFieldOption {
  readonly value: string;
  readonly label: ReactNode;
  readonly searchText?: string | undefined;
  readonly icon?: ReactNode | undefined;
  readonly group?: string | undefined;
  readonly disabled?: boolean | undefined;
}

/** 名单读不到时的退路：值 + 变更回调，`SelectField` 会由下拉改成手填输入框。 */
export interface SelectFieldFallback {
  readonly value: string;
  readonly onChange: (next: string) => void;
}

/** 列表底部固定那一条（如"添加工作区"）：文案 + 可选图标。 */
export interface SelectFieldFooter {
  readonly label: ReactNode;
  readonly icon?: ReactNode | undefined;
}

/** `SelectField` 的契约：值、候选、变更回调，外加搜索 / 分组 / 加载 / 空态 / 页脚那一整套开关。 */
export interface SelectFieldProps {
  readonly value: string;
  readonly options: readonly SelectFieldOption[];
  readonly onChange: (value: string) => void;
  readonly label?: ReactNode | undefined;
  readonly hint?: ReactNode | undefined;
  readonly icon?: ReactNode | undefined;
  readonly renderValue?: ((current: SelectFieldOption | undefined) => ReactNode) | undefined;
  readonly placeholder?: ReactNode | undefined;
  readonly search?: boolean | undefined;
  readonly searchLabel?: string | undefined;
  readonly searchPlaceholder?: string | undefined;
  readonly filter?: ((option: SelectFieldOption, query: string) => boolean) | undefined;
  readonly emptyText?: string | ((query: string) => string) | undefined;
  readonly open?: boolean | undefined;
  readonly onOpenChange?: ((open: boolean) => void) | undefined;
  readonly disabled?: boolean | undefined;
  readonly invalid?: boolean | undefined;
  readonly loading?: boolean | undefined;
  readonly loadingText?: string | undefined;
  readonly fallback?: SelectFieldFallback | undefined;
  readonly footer?: SelectFieldFooter | undefined;
  readonly onFooter?: (() => void) | undefined;
  readonly selection?: 'check' | 'fill' | undefined;
  readonly variant?: 'ghost' | 'boxed' | undefined;
  readonly iconOnly?: boolean | undefined;
  readonly ariaLabel?: string | undefined;
  readonly title?: string | undefined;
  readonly id?: string | undefined;
  readonly name?: string | undefined;
  readonly className?: string | undefined;
  readonly menuClassName?: string | undefined;
}

const FOOTER_ID = '__wb-select-footer__';
const EMPTY_ID = '__wb-select-empty__';

function mergeClass(...parts: readonly (string | undefined)[]): string {
  return parts.filter((one) => one !== undefined && one !== '').join(' ');
}

function triggerClassOf(variantClass: string | undefined, iconOnly: boolean): string {
  return mergeClass('wb-selectTrigger', variantClass, iconOnly ? 'wb-selectIconOnly' : undefined);
}

function itemOf(option: SelectFieldOption): MenuItem {
  return {
    id: option.value,
    label: option.label,
    ...(option.icon === undefined ? {} : { icon: option.icon }),
    ...(option.disabled === true ? { disabled: true } : {}),
  };
}

function selectValueNode(
  current: SelectFieldOption | undefined,
  renderValue: SelectFieldProps['renderValue'],
  placeholder: ReactNode,
): ReactNode {
  if (current === undefined) {
    return <span className="wb-selectPlaceholder">{placeholder ?? '—'}</span>;
  }
  return renderValue === undefined ? current.label : renderValue(current);
}

function searchNode(args: {
  readonly boxRef: RefObject<HTMLSpanElement | null>;
  readonly className: string;
  readonly id: string | undefined;
  readonly name: string | undefined;
  readonly ariaLabel: string | undefined;
  readonly placeholder: string | undefined;
  readonly query: string;
  readonly onQuery: (next: string) => void;
  readonly onKey: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
}): ReactNode {
  return (
    <span ref={args.boxRef} className={args.className}>
      <span className="wb-selectSearchIcon">
        <IconSearchOutlineRegular size={14} />
      </span>
      <TextField
        id={args.id}
        name={args.name}
        className="wb-selectSearchInput"
        aria-label={args.ariaLabel}
        placeholder={args.placeholder}
        value={args.query}
        onChange={(event) => args.onQuery(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          args.onKey(event);
        }}
      />
    </span>
  );
}

function menuNode(args: {
  readonly open: boolean;
  readonly listClassName: string;
  readonly anchor: ReactNode;
  readonly selection: 'check' | 'fill';
  readonly selectedId: string | undefined;
  readonly items: readonly MenuEntry[];
  readonly footer: readonly MenuEntry[] | undefined;
  readonly onPick: (id: string) => void;
  readonly onCancel: () => void;
}): ReactNode {
  return (
    <Menu
      open={args.open}
      portal
      className="wb-selectAnchor"
      listClassName={args.listClassName}
      anchor={args.anchor}
      align="start"
      side="bottom"
      selection={args.selection}
      selectedId={args.selectedId}
      items={args.items}
      footer={args.footer}
      onSelect={args.onPick}
      onClose={args.onCancel}
    />
  );
}

function framed(
  label: ReactNode | undefined,
  hint: ReactNode | undefined,
  className: string | undefined,
  control: ReactNode,
): ReactNode {
  const inner =
    label === undefined
      ? hint === undefined
        ? control
        : (
            <span className="wb-select">
              {control}
              <span className="wb-selectHint">{hint}</span>
            </span>
          )
      : (
          <Field label={label} hint={hint}>
            {control}
          </Field>
        );
  return className === undefined ? inner : <div className={className}>{inner}</div>;
}

/** 算候选项用来匹配搜索的文本：有 `searchText` 就用它，否则取字符串标签；标签不是字符串又没给它是空串（这项搜不到）。 */
export function searchTextOf(option: SelectFieldOption): string {
  if (option.searchText !== undefined) return option.searchText;
  return typeof option.label === 'string' ? option.label : '';
}

/** 默认匹配：查询去空白折成小写后看它是不是 `searchTextOf` 的子串；查询为空或纯空白时一律命中（留在列表里）。 */
export function defaultSelectFilter(option: SelectFieldOption, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return searchTextOf(option).toLowerCase().includes(needle);
}

/** 按查询过滤候选 —— 组件与模块自己算列表都用它，好让同一份口径管两处：`filter` 不给就用 `defaultSelectFilter`，顺序不变。 */
export function filterSelectOptions(
  options: readonly SelectFieldOption[],
  query: string,
  filter: (option: SelectFieldOption, query: string) => boolean = defaultSelectFilter,
): readonly SelectFieldOption[] {
  return options.filter((option) => filter(option, query));
}

/** 把键盘游标换算成当前该高亮那项的 value：游标 `null`（还没动过键盘）或列表为空时没有高亮；太大的游标收到最后一项，负游标取不到项也回 `null`。 */
export function selectCursorValue(
  shown: readonly SelectFieldOption[],
  cursor: number | null,
): string | null {
  if (cursor === null || shown.length === 0) return null;
  return shown[Math.min(cursor, shown.length - 1)]?.value ?? null;
}

/** 按上下键移动游标（两头环绕）：还没选过时向下取第一项、向上取最后一项；列表为空回 `null`（一步都动不了）。`step` 1 向下、-1 向上。 */
export function stepSelectCursor(
  shown: readonly SelectFieldOption[],
  cursor: number | null,
  step: 1 | -1,
): number | null {
  if (shown.length === 0) return null;
  if (cursor === null) return step === 1 ? 0 : shown.length - 1;
  return (cursor + step + shown.length) % shown.length;
}

/** 把候选排成 `Menu` 要的条目表：按 `group` 插分组标题；一项都没有时退回 `emptyText` 那一行（不给就是空表）。 */
export function selectEntries(
  shown: readonly SelectFieldOption[],
  emptyText: string | undefined,
): readonly MenuEntry[] {
  if (shown.length === 0) {
    return emptyText === undefined ? [] : [{ type: 'label', id: EMPTY_ID, text: emptyText }];
  }
  const out: MenuEntry[] = [];
  let group: string | null = null;
  for (const option of shown) {
    if (option.group !== undefined && option.group !== group) {
      out.push({ type: 'label', id: `__wb-select-group-${String(out.length)}`, text: option.group });
      group = option.group;
    }
    out.push(itemOf(option));
  }
  return out;
}

function useSelectState(props: SelectFieldProps) {
  const { options, filter = defaultSelectFilter, emptyText, open: openProp, onOpenChange } = props;
  const [openState, setOpenState] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState<number | null>(null);
  const boxRef = useRef<HTMLSpanElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const wasOpenRef = useRef(false);
  const pickedRef = useRef(false);
  const closedByUsRef = useRef(false);

  const open = openProp ?? openState;
  const setOpen = (next: boolean): void => {
    if (openProp === undefined) setOpenState(next);
    onOpenChange?.(next);
  };

  useEffect(() => {
    if (!open || props.search === false) return;
    boxRef.current?.querySelector('input')?.focus();
  }, [open, props.search]);

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      return;
    }
    if (!wasOpenRef.current) return;
    wasOpenRef.current = false;
    const closedByUs = closedByUsRef.current;
    const picked = pickedRef.current;
    closedByUsRef.current = false;
    pickedRef.current = false;
    if (!closedByUs || picked) return;
    triggerRef.current?.focus();
  }, [open]);

  const shown = useMemo(() => filterSelectOptions(options, query, filter), [options, query, filter]);
  const close = (picked: boolean): void => {
    closedByUsRef.current = true;
    pickedRef.current = picked;
    setOpen(false);
    setQuery('');
    setCursor(null);
  };

  return {
    open,
    setOpen,
    query,
    cursor,
    setCursor,
    setQuery,
    shown,
    close,
    boxRef,
    triggerRef,
    empty: typeof emptyText === 'function' ? emptyText(query) : emptyText,
  };
}

/**
 * 下拉选择：默认是跟 `TextField` 一套的常规下拉框（不是原生 `<select>`），无边框那种给 `variant: 'ghost'`。
 * `open` 不给就内部自己管（两种接法下 `onOpenChange` 都会通知），`loading` 把触发器换成转圈 + `loadingText`（默认 `…`），
 * `selection` 选选中行标记（`fill` 整行底色 / `check` 行尾勾），`footer` 是列表底部那一条（点它走 `onFooter`，不改当前值）。
 * @param props.value - 当前值；在 `options` 里找不到就按"没选"画 `placeholder`。
 * @param props.options - 全量候选；空数组且给了 `fallback` 时改画手填输入框。
 * @param props.onChange - 选中一项后的回调，回的是那一项的 `value`。
 * @param props.label - 没进 `FormRow` 时的标签兜底；进了那一行就别再给它和 `hint`，否则会多一个标签。
 * @param props.renderValue - 自己渲染触发器上那份当前值；不给就用候选项的 `label`。
 * @param props.placeholder - 没选中时那句话；不给是 `—`。
 * @param props.search - 是否可搜（默认 true）；`false` 时不画搜索框、也不自动聚焦。
 * @param props.filter - 自定义匹配；不给用 `defaultSelectFilter`（空白查询一律命中）。
 * @param props.emptyText - 无匹配时的文案，或按查询生成文案的函数（能说"没有匹配 X 的项"）。
 * @param props.fallback - 退路：`options` 为空时改成手填（`value` + `onChange`）。
 * @returns 触发器，以及打开时的搜索框与列表。
 */
export function SelectField(props: SelectFieldProps) {
  const {
    value,
    options,
    onChange,
    label,
    hint,
    icon,
    renderValue,
    placeholder,
    search = true,
    searchLabel,
    searchPlaceholder,
    footer,
    onFooter,
    disabled = false,
    invalid = false,
    loading = false,
    loadingText,
    fallback,
    selection = 'fill',
    variant = 'boxed',
    iconOnly = false,
    ariaLabel,
    title,
    id,
    name,
    className,
    menuClassName,
  } = props;
  const state = useSelectState(props);
  const current = options.find((option) => option.value === value);

  const variantClass = variant === 'ghost' ? 'wb-selectGhost' : undefined;
  const triggerClass = triggerClassOf(variantClass, iconOnly);

  if (loading) {
    return framed(
      label,
      hint,
      className,
      selectLoadingNode({ id, className: triggerClass, invalid, ariaLabel, loadingText }),
    );
  }

  if (fallback !== undefined && options.length === 0) {
    return framed(
      label,
      hint,
      className,
      <TextField
        id={id}
        name={name}
        className="wb-selectFallback"
        invalid={invalid}
        aria-label={ariaLabel}
        value={fallback.value}
        onChange={(event) => fallback.onChange(event.currentTarget.value)}
      />,
    );
  }

  const trigger = selectTriggerNode({
    id,
    className: triggerClass,
    disabled,
    invalid,
    open: state.open,
    ariaLabel,
    title,
    icon,
    value: selectValueNode(current, renderValue, placeholder),
    iconOnly,
    onOpen: () => state.setOpen(true),
    ref: state.triggerRef,
  });

  const anchor =
    state.open && search
      ? searchNode({
          boxRef: state.boxRef,
          className: mergeClass('wb-selectSearch', variantClass),
          id,
          name,
          ariaLabel: searchLabel,
          placeholder: searchPlaceholder,
          query: state.query,
          onQuery: (next) => {
            state.setQuery(next);
            state.setCursor(null);
          },
          onKey: (event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.stopPropagation();
              event.preventDefault();
              state.setCursor((at) =>
                stepSelectCursor(state.shown, at, event.key === 'ArrowDown' ? 1 : -1),
              );
              return;
            }
            if (event.key !== 'Enter') return;
            event.stopPropagation();
            const pick = state.shown[Math.min(state.cursor ?? 0, state.shown.length - 1)];
            if (pick === undefined) return;
            state.close(true);
            onChange(pick.value);
          },
        })
      : trigger;

  return framed(
    label,
    hint,
    className,
    menuNode({
      open: state.open,
      listClassName: mergeClass('wb-selectMenu', menuClassName),
      anchor,
      selection,
      selectedId: selectCursorValue(state.shown, state.cursor) ?? undefined,
      items: selectEntries(state.shown, state.empty),
      footer:
        footer === undefined
          ? undefined
          : [
              {
                id: FOOTER_ID,
                label: footer.label,
                ...(footer.icon === undefined ? {} : { icon: footer.icon }),
              },
            ],
      onPick: (picked) => {
        state.close(true);
        if (picked === FOOTER_ID) {
          onFooter?.();
          return;
        }
        onChange(picked);
      },
      onCancel: () => state.close(false),
    }),
  );
}
