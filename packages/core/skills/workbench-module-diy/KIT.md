# kit：选型、组合、最小写法

`check --only kit` 列**当前安装的外壳真实有的**成员；逐件用法在 `.d.ts` 的 JSDoc（`workbench_diy_components name=<名>`）。
本文件只给跨件规则与最小示例。全部从 `kit.components` / `kit.hooks` / `kit.lib` / `kit.api`
（`@dsh-workbench/core/client`）取；示例中 `h = createElement`（从 `react` 引）。

优先用 kit：kit 随外壳换主题、跟语言走。

## 1 卡片外壳

- `Card`：标题 + 刷新 + 内容。面板每格都用它。

```tsx
h(Card, { t: props.t, title: t('myunit.cardTitle'),
  refreshing: resource.phase === 'loading', onRefresh: props.onRefresh }, body)
```

- `CardHead`：自拼卡头时用；`platformHref` 给一个即出 ↗。
- `CardAnchor`：外壳锚点 `#wb-card-<unit>`；不写不删。
- `CardBoundary`：卡片错误边界；不要自己 try/catch 渲染。

## 2 状态

五态：待机 / 在读 / 就绪 / 就绪但空 / 读不到。

| 场景 | 用 |
|---|---|
| 有内容 | `StateBlock`（标题 + `hint` + 正文） |
| 需先选 / 在读 / 读不到 | `CenteredState` |
| 就绪但空 | `EmptyState` |
| 在读且有形状 | `SkeletonRows` |
| 一句说明 / 报错 | `Note`（`tone: 'problem'`） |

```tsx
h(CenteredState, { icon: null, title: t('myunit.loading'), hint: t('myunit.loadingHint'), compact: true })
h(CenteredState, { icon: null, title: t('myunit.errorTitle'), detail: `${code}: ${message}`, hint: t('myunit.errorHint'), compact: true })
h(EmptyState, { text: t('myunit.empty'), icon: h(IconPanelScreen, { size: 20 }), compact: true })
h(StateBlock, { title: rows.title, hint: `3 条 · ${when}`, resolving: t('myunit.rows') }, table)
```

读不到：`detail` 放原始错误码与原文；不显示 0。

## 3 行与记录

- `Rows` + `Row`：键值行；不手写 `ul` / `li` / div 行。

```tsx
h(Rows, null,
  ...items.map((one) => h(Row, { key: one.name, label: one.name, value: `${size} · ${when}` })))
```

- `ActivityBlock` / `ActivityLine` / `ActivityAction`：活动记录；时间用它。
- `LongTaskRow`：长任务行（五态）；不画进度条。传 `stop` 需宿主响应 signal 且 peer 下限到位（[TOOLS.md](TOOLS.md) §9）。
- `ApprovalDetail` / `ApprovalPlan`：审批屏两格；形状见 [DESIGN.md](DESIGN.md) §3 末节。

## 4 表单

`Form` 管理整张表单：字段、校验时机、错误位置、首错聚焦、操作区。

```tsx
h(Form<{ branch: string }>, {
  fields: [{
    key: 'branch', label: t('myunit.branch'), value: draft.branch, onChange: onBranch,  // 值与改写同格
    validate: (v) => (v === '' ? t('myunit.branchRequired') : undefined),
    control: (b) => h(TextField, { id: b.id, name: b.name, invalid: b.invalid,
      disabled: b.disabled, value: b.value, onChange: (e) => b.onChange(e.currentTarget.value) }),
  }],
  submit: { label: t('myunit.save'), busyLabel: t('myunit.saving') },
  onSubmit: save,
})
```

规则：`Form<Values>` 钉键与值类型；值与 `onChange` 同格；`visible: false` 的键在 `Values` 中可选；
`validate` 同步纯函数、第二参为整张值表；控件只经 `control` 提供。

控件：`Field`（未进 `FormRow` 时包标签与说明）· `TextField`（`invalid`）· `ChoiceGroup`（`multi`）·
`SelectField`（常规下拉；`variant: 'ghost'` 无边框；非原生 select）· `SaveBar`（取消 / 保存）。
不手写 `<button>` / `<input>` / `<select>`；`<textarea>` 例外。

`FormActions`：操作区。`primary` 靠右、`danger` 在其左、每区一个 `primary`、窄屏折行；`busy` 带 `Spinner`。
不写 `gap` / `margin` / 顺序，不借 `.wb-formActions` 槽类（F3 红）。`danger` 仅标破坏性；二次确认归调用点。

`ConfirmBar`：确认条。键值走 `Rows`，错误走 `Note tone="problem"`，动作走 `FormActions`；不重拼这四槽。
是否询问归调用点。

## 4′ hooks

| 场景 | 用 |
|---|---|
| 卡片一次读（同 key 合流 / 事实订阅 / 上报） | `useApiResource`（非 hook 为 `requestResource`，用后必须 `release`） |
| 写后重取 / 听事实变化 | `useFactInvalidate` · `useFactRevision` · `subscribeFactRevision`（非 hook 要退订） |
| 最短忙态 | `useVisibleBusy`（`busyView` / `heldPhase`） |
| 整卡起步（gate + 忙 + 探针 + 上报 + blocker） | `useUnitBoard`（`read(gated)` 内调 `useApiResource`） |
| 单点 / 整表能力门 | `useCapabilityGate` / `useCapabilityMap` |
| 写（组件内不 fetch）/ 长任务轮询 | `useHostWrite` / `useLongTask`（`LongTaskRow`；`longTaskIsLive`；写后 `refresh()`） |

取数链见 [LINKAGE.md](LINKAGE.md) §8；配置见 [PANEL.md](PANEL.md) §5。

## 5 表单三层：面 → 行 → 控件

一张表单一个 `Form`；不要另摆操作区（`Form` 组 `[...extra, ...cancel, submit(primary)]`）。

`FormRows` + `FormRow` + `FormActions` 仅用于非整表场景：单行嵌入、工具栏、卡头按钮。

```tsx
h(FormRows, null,
  h(FormRow, { label: t('myunit.mode'), hint: t('myunit.modeHint') },
    h(SelectField, { value, options, onChange: setMode })))
```

- 标签归 `FormRow`（默认左置；`layout: 'stacked'` 堆叠）。进了 `FormRow` 就不再给控件 `label` / `hint`。
  `hint` 与 `problem` 二选一，错误优先。
- 错误：位置与外观归 `FormRow.problem` + 控件 `invalid`；校验逻辑留在模块（纯函数 + 文案，交给 `validate`）。
  "是否提交过"与首错聚焦归 `Form`。
- 选择：候选多 / 需搜索 / 需分组 / 可能读不到 → `SelectField`；候选少 / 要全览 / 多选 → `ChoiceGroup`。
  loading 一律 `Spinner`。
- 尺寸：字段控件默认 28；行距与标签列宽归 `FormRow(s)`；控件宽度归控件槽。非行子项自动通栏。

反例：手写标签行（F1）、自管行距（F2）、裸 `<form>` / 手写行槽类（F4）。

时点：`Form` / `ConfirmBar` 需外壳发版含它们后，把 peer 下限抬到该版。

## 6 其他

- `Link`：唯一外链（`h(Link, { href, children })`）；不去箭头、文案不带 `→`、不手写 `<a>`。
- `SettingsSection` / `Stack` / `BlockerState` / `Tip`：设置节 / 竖排 / 阻断屏 / Tooltip（纯图必须有它或 `aria-label`）。
- 图标：`IconPanelScreen` / `IconModuleMark` / `IconNpm` / `IconOpencli`；其余从 dsh `Icon*Regular` 取，不自绘。
- 真机造不出的状态：`plugin.test.ts` 覆盖五态。

## 7 规则

1. 调用点只给数据与语义；外观类名只允许布局槽（通栏、外边距、网格位置）。
2. 字号与颜色走 kit 与令牌（`--dsw-*` / `--wb-*`）。重点数字用 `--dsw-font-xl-24` + `tabular-nums`；
   刻度外字面值在模块 `README.md` 说明（[PANEL.md](PANEL.md) §6）。
3. 自写 CSS 只写布局（flex / grid / gap / 对齐）。

## 8 需要 kit 没有的标准控件

查：`workbench_diy_components`（DIY 会话）或 `check --only primitives`（`--all` / `--json` / `--file <名>`）。
写入：

```jsonc
"dsh": { "client": { "external": [ "@dsh-workbench/core/client", "@deepseek-ai/dsh-client-ui-primitives" ] } },
"devDependencies": { "@deepseek-ai/dsh-client-ui-primitives": "<与外壳一致的精确版>" }
```

改后 `pnpm install`。边界见 [PANEL.md](PANEL.md) §9。
