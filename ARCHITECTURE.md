# 架构

> 本文只讲当前落地的形状：包怎么分、层怎么走、适配器怎么接、模块怎么进来、数据怎么流、门禁判什么。
> 模块作者看 [`packages/core/skills/workbench-module-diy/`](packages/core/skills/workbench-module-diy/SKILL.md)；
> 术语查 [`CONTEXT.md`](CONTEXT.md)；装机与排障看 [`packages/core/README.md`](packages/core/README.md)。

## 0. 一句话

**一个 dsh 插件包，两个运行时，一条 HTTP 投影；业务模块是可插拔单元，供应商能力是可替换适配器。**

## 0.1 四层关系

先看 DSH、外壳、适配器、模块四者的位置。模块不是挂在图外面的“另一个东西”，它通过两次握手接进 core。

```text
                            dsh 本体
                               │
                 ┌─────────────┴─────────────┐
                 │                           │
          @dsh-workbench/core          @acme/module-x
          （外壳插件）                   （模块插件）
                 │                           │
          ┌──────┴──────┐             dsh.workbench 清单
          │             │                    │
     app/host.ts    client.tsx          host apply(ctx)
     组合根          浏览器入口                │
          │             │                    │
          │             │        ctx.get('workbenchUnits')
          │             │                    │
          │             │              register(face) ──────┐
          │             │                                    │
          │             │        ctx.get('workbenchUnits')   │
          │             │              registerUnit(face) ───┤
          │             │                                    │
          ▼             ▼                                    ▼
   AdapterSet          kit                         core 的单元注册表
   data/supply/modules/...                        kernel/host + kernel/client
          │
          ▼
   adapters-default
     ├── adapter-runtime
     ├── adapter-supply
     ├── adapter-profile
     └── adapter-probe
          │
          ▼
   @dsh-workbench/shared
   （契约 / 纯逻辑 / 宿主工具）
```

默认装哪份集合由 `packages/core/package.json` 的 `workbench.adapterSet` 决定 —— 外壳按这个 spec 动态装载，
`packages/core/src` 里不出现任何适配器包名（S69 钉着）。协议只有三样东西：`AdapterSet`（成员与版本）、
`RuntimeCapabilities`（有没有命令行 / 插件市场 / 浏览器桥 / 平台读 / 共用依赖）、`RuntimeProfile`（叫法、术语与
排障话术）。界面按能力渲染入口，不按适配器 id 分支（S72）。

第二份实现是同仓的 `@dsh-workbench/adapters-chrome-mcp`（实验包，`private: true`，stdio + 仓内 stub MCP server）。
它跟默认集合跑**同一份** `check:adapter-contract`；要切它，只改 profile 里的一行 `adapterSet`，
`packages/core/src` 一行都不用动 —— 工具在 `scripts/dev/adapter-set-switch.mjs`（带 `--restore`）。

### 测试的边界：按协议写，不按实现写

两侧各自对着协议，互不认识：

- **外壳侧**：协议说适配器会这样表现，外壳就按这个预期调它。测试给一份“符合协议预期”的适配器
  （`@dsh-workbench/shared/testing` 的 `fakeAdapterSet()`，或按端口写的 double），看外壳的行为对不对。
- **适配器侧**：协议是这样写的，实现符不符合 —— `adapterContractGaps` 逐项判契约，自己的单测判行为。

所以外壳里**不许 import 任何 `adapter-*` 包**（S70，error，零例外），适配器也不认识外壳的测试。

适配器内部逻辑的测试归它自己的包：怎么解析 `git+https` 源、怎么生成隔离壳脚本、怎么比版本，
住在 `adapter-supply` / `adapter-probe` 的 `src/**` 里，外壳不重复测 —— 否则换一份适配器，
外壳的测试就在测一份不存在的实现。

`shared/testing` 是协议侧的夹具层；`vitest.setup.ts` 的中央 mock 最终也只用假集合
（现在还在用真默认集合，这是正在还的债，见 ADR-0092）。

模块和 core 的关系有六个实际接触点：

| 接触点 | 谁发起 | 发生什么 |
|---|---|---|
| 安装 | 用户 / profile | 模块进 profile，core 从模块 `package.json` 读 `dsh.workbench`，生成 `UnitManifest` |
| 宿主注册 | 模块 | `host apply(ctx)` 拿 `workbenchUnits`，调 `register(face)` |
| 宿主挂载 | core | `mountUnits` 把模块的 `face.mount({ data, ctx, manifest, ... })` 调起来，`data` 来自 `AdapterSet` |
| 浏览器注册 | 模块 | `client` 面拿 `workbenchUnits`，调 `registerUnit({ card, messages, ... })` |
| 浏览器清单 | core | `GET /workbench/api/unit-manifests` 把清单交给浏览器，没清单的卡片不挂 |
| HTTP 读 | 模块 | 模块路由 `/workbench/api/<unit>` 返回数据，卡片只消费路由结果 |

模块运行时实际调用 core 的四个口，另加一个注册口：

```text
module host
  mount({ data }) ── data.read({kind:'browser'|'http'}) ──► AdapterSet.data
  ctx.get('tools') ── 注册工具 ──────────────────────────► core 工具面

module client
  card / steps ── kit.components / kit.lib ──────────────► @dsh-workbench/core/client
  card ── GET /workbench/api/<unit> ─────────────────────► core 路由
```

也就是说，模块**调用**的是：

| 模块拿到的 | 来自 core 的哪里 | 用途 |
|---|---|---|
| `mount({ data })` | `AdapterSet.data` | `data.read` 读 HTTP / 浏览器 |
| `ctx.get('tools')` | 宿主工具面 | 注册模块工具、审批 |
| `kit` | `@dsh-workbench/core/client` | 卡片、表单、加载 / 空 / 错三态 |
| `/workbench/api/<unit>` | 宿主路由表 | 卡片读模块自己的路由 |
| `workbenchUnits` | 宿主 / 浏览器注册表 | 注册两个面 |

模块**不调用** adapter 包；adapter 只服务于 core 的 `AdapterSet`。

关系一句话：

| 关系 | 方向 | 含义 |
|---|---|---|
| DSH → core | DSH 加载 core | DSH 只认插件入口 `apply(ctx)` 和它 provide 的服务 |
| DSH → module | DSH 加载模块 | 模块是普通 dsh 插件包，DSH 不知道“面板 / 单元” |
| core → module | core 提供注册表与端口 | `workbenchUnits`、工具面、kit、`data`；模块不 import adapter |
| module → core | 模块注册两个面 | host `register(face)`，client `registerUnit(face)` |
| core → adapters | core 只在组合根兜底 | `app/host.ts` dynamic import 默认 set；第三方 set 从 profile 解析 |
| module → adapters | **没有** | 模块不 import adapter，也不拿 adapter 实现 |
| adapter → shared | 适配器依赖契约 | adapter 不 import core 内部 |
| core / module → shared | 共同依赖 | 两侧共用契约类型，不共享运行时状态 |

**关键点：**

- `DSH` 不知道有 adapter；它只加载 `core` 和模块。
- `core` 只在组合根里知道默认包名（dynamic import 兜底）；业务模块不知道任何 adapter 实现。
- 模块通过 `register(face)` / `registerUnit(face)` 接进 core；通过 `mount({ data })` 拿端口。
- 模块**不直接依赖** adapter；换一套适配器，模块不改。
- 模块的宿主路由与浏览器卡片是同一个 `<unit>` 的两半，清单与路由名必须对齐。

## 0.2 维度地图

| 维度 | 图在哪 | 看什么 |
|---|---|---|
| DSH / core / adapter / module | 0.1 | 谁加载谁、谁调用谁 |
| 包与依赖 | 1.1 | core → default → 四个 adapter |
| 两个运行时 | 2 | 宿主 / 浏览器、各自入口 |
| 源码分层 | 3.2 | 层号与依赖方向 |
| 适配器端口 | 4.2 | `AdapterSet` 契约与组合根如何注入 |
| 单元生命周期 | 5.7 | 装、注册、挂载、上板、卸 |
| 读 / 推 / 写 | 6 | HTTP、SSE、审批写 |
| 状态与配置 | 5.8 | 卡片显示、panel state、prefs/actions |
| 失败与降级 | 5.9 | 清单缺失、依赖缺失、mount 回滚、审批拒绝 |
| 界面槽位与 kit | 7 | 左栏、右栏、卡片、kit |
| 安装与 profile | 9 | core / default / adapter / module 在 profile 里的位置 |
| 门禁链 | 10 | check 的顺序与两套入口 |
| skills | 8.2 | 随包出货的模块指引：入口、流程、文档索引 |

```text
┌──────────────── dsh 进程（宿主） ────────────────┐
│ app/host.ts            组合根                    │
│  ├ kernel/host         注册表、挂载、就绪、工具面  │
│  ├ modules/*/model     外壳自己的域（panels/sessions）│
│  ├ shared/api/host     宿主路由与宿主工具          │
│  └ shared/host/adapters AdapterSet 端口            │
└──────────────────┬───────────────────────────────┘
                   │ GET /workbench/api/<route>
                   │ SSE /workbench/events
                   │ POST prefs / actions / provision
┌──────────────────┴───────────────────────────────┐
│ 浏览器（页面 / Electron）                         │
│ app/client.tsx        客户端入口                  │
│  ├ app/layouts         左栏、右侧面板列、市场      │
│  ├ app/units           单元清单与装配             │
│  └ kernel/client       单元注册表、槽位、board     │
└───────────────────────────────────────────────────┘
```

两个运行时各只有一个接缝：

```text
宿主：packages/core/src/app/host.ts
浏览器：packages/core/src/app/client.tsx
```

外壳只提供机制：面板列、单元注册、路由、工具面、审批、市场、启动体检。
外壳自己不带业务模块；业务模块是独立 dsh 插件包，装进 profile 才出现。

## 1. 包

| 包 | 是什么 | 发布名 |
|---|---|---|
| `packages/core/` | 外壳：宿主、浏览器、单元协议、面板、市场、启动器、门禁 | `@dsh-workbench/core` |
| `packages/shared/` | 契约类型、纯 lib、i18n、哑组件、宿主纯工具 | `@dsh-workbench/shared` |
| `packages/module-tools/` | 模块 `build` / `check` / `lint` / `init` | `@dsh-workbench/module-tools` |
| `packages/module-hello/` | 最小可安装模块样本 | `@dsh-workbench/module-hello` |
| `packages/adapter-runtime/` | opencli、浏览器读、DataReader | `@dsh-workbench/adapter-runtime` |
| `packages/adapter-supply/` | 供给、已安装模块、插件来源、registry | `@dsh-workbench/adapter-supply` |
| `packages/adapter-profile/` | profile、配置同步、registry、发布 | `@dsh-workbench/adapter-profile` |
| `packages/adapter-probe/` | preflight、探测、工具链、self-update | `@dsh-workbench/adapter-probe` |
| `packages/adapters-default/` | 默认适配器集合 | `@dsh-workbench/adapters-default` |
| `packages/adapter-fixture/` | 最小 `AdapterSet` 夹具，只给集成测试 | 私有，不发布 |
| `packages/docs/` | 文档站，私有构建，不出货 | — |

### 1.1 依赖图

```text
@dsh-workbench/core
  └── (dynamic fallback) @dsh-workbench/adapters-default
        ├── @dsh-workbench/adapter-runtime
        ├── @dsh-workbench/adapter-supply  → runtime
        ├── @dsh-workbench/adapter-profile → runtime
        └── @dsh-workbench/adapter-probe   → runtime / supply / profile
```

规则：

- `core` 只在组合根动态 import 默认集合兜底，不 import 任何具体 adapter 包；第三方 set 从 profile 解析。
- adapter 包之间可以互相依赖，也可以独立；依赖图不能有环。
- adapter 包不 import `core` 内部，只 import `@dsh-workbench/shared`。
- `adapters-default` 是默认集合，不是业务包；它实现的契约在 `shared/host`，第三方 set 可以实现同一份契约。

### 1.2 shared 的入口

| 入口 | 给谁 | 放什么 |
|---|---|---|
| `@dsh-workbench/shared` | 浏览器侧、模块、契约 | 契约类型、纯 lib、i18n、哑组件 |
| `@dsh-workbench/shared/host` | 宿主侧 | 文件、进程、HTTP、工具、长任务、宿主纯函数 |
| `@dsh-workbench/shared/testing` | 测试 | 夹具与断言 |

浏览器侧不能从 `/host` 取运行值；宿主侧需要运行值时只从 `/host` 取。

## 2. 两个运行时

| | 宿主 | 浏览器 |
|---|---|---|
| 入口 | `src/app/host.ts` | `src/app/client.tsx` |
| 运行在 | dsh 进程（Node） | 页面 / Electron |
| 产物 | `dist/host/index.js` | `client.js` |
| 外部依赖 | Node 内置 | React + dsh UI 原语 |

三条硬边界：

1. 两侧不互相 import。
2. 宿主侧文件只住在 `src/shared/api/host/**`、`src/modules/*/model/**`、`src/kernel/host/**`；浏览器侧不进这些前缀。
3. dsh 的 UI 原语直接经模块表 `require('@deepseek-ai/dsh-client-ui-primitives')` 使用，不手搓 DOM/CSS。

## 3. 源码布局与层

### 3.1 目录

```text
packages/core/src/
  app/
    host.ts            宿主组合根
    client.tsx         浏览器入口
    layouts/           左栏、右侧面板列、市场、启动体检 UI
    units/             单元清单加载与装配
  kernel/
    host/              宿主注册表、挂载、就绪、工具面
    client/            浏览器注册表、槽位、board
    contract/          对外协议的类型 re-export
  modules/
    panels/            面板、市场、DIY、插件页
    sessions/          会话域
  shared/
    api/host/          宿主路由、宿主工具、宿主查询
    api/               浏览器侧 API 缝
    hooks/             浏览器 hooks
    components/        哑组件
    styles/            令牌与全局样式
    dev-surface/       开发夹具
  dev/                 本地开发入口
```

`packages/core/src/adapters/` 和 `packages/core/src/units/` 不存在。
适配器实现住 `packages/adapter-*`；`app/units` 是装配层，不是内核。

### 3.2 层号

层号就是依赖方向：一个文件只许依赖层号 ≤ 自己的文件。

<!-- arch-guard:begin roles -->
| 角色 | 路径 glob | 层号 | 槽位 | 组 | 公开面 |
| --- | --- | --- | --- | --- | --- |
| `test` | `**/*.test.{ts,tsx,mts,cts,js,mjs,cjs}` | 99 | — | — | — |
| `test` | `**/*.spec.{ts,tsx,mts,cts,js,mjs,cjs}` | 99 | — | — | — |
| `lib:entry` | `src/app/host.ts` | 10 | `entry` | — | — |
| `lib:entry` | `src/app/client.tsx` | 10 | `entry` | — | — |
| `lib:kernel/host` | `src/kernel/host/**` | 2 | — | — | — |
| `lib:kernel/client` | `src/kernel/client/**` | 2 | — | — | — |
| `lib:kernel/contract` | `src/kernel/contract/**` | 2 | — | — | — |
| `lib:shared/styles` | `src/shared/styles/**` | 0 | — | — | — |
| `lib:shared/api` | `src/shared/api/**` | 4 | — | — | — |
| `lib:shared/dev-surface` | `src/shared/dev-surface/**` | 4 | — | — | — |
| `lib:shared/hooks` | `src/shared/hooks/**` | 4 | — | — | — |
| `lib:shared/components` | `src/shared/components/**` | 4 | — | — | — |
| `lib:modules/sessions` | `src/modules/sessions/**` | 5 | — | — | — |
| `lib:modules/panels` | `src/modules/panels/**` | 5 | — | — | — |
| `lib:app/layouts` | `src/app/layouts/**` | 6 | — | — | — |
| `lib:app/units` | `src/app/units/**` | 7 | — | — | — |
| `lib:dev` | `src/dev/**` | 9 | — | — | — |
<!-- arch-guard:end roles -->

### 3.2.1 层栈

```text
层 10  app/host.ts · app/client.tsx          入口 / 组合根
层  9  dev/                                  本地开发
层  7  app/units/                            清单装配
层  6  app/layouts/                          左栏 / 右栏 / 市场 / 环境门
层  5  modules/panels · modules/sessions     外壳自己的域
层  4  shared/api · shared/hooks · shared/components
层  3  （没有源码角色；具体适配器住 packages/adapter-*）
层  2  kernel/host · kernel/client · kernel/contract
层  0  shared/styles                         令牌
         │
         ▼  依赖方向只向下
```

### 3.3 层号表达不了的规则

| 规则 | 判什么 |
|---|---|
| S60 | 外壳只使用单元公开面 |
| S62 | 单元之间不互相 import |
| S63 | 单元清单只依赖纯类型契约 |
| S64 | 单元在宿主与浏览器两端都登记 |
| S65 | 外壳层不出现平台知识 |
| S66 | 外壳层不出现单元 id |
| S67 | 单元只通过专属目录读写状态 |
| S68 | 跨平台能力走登记的首选方案 |
| S71 | `kernel/host` 与 `kernel/client` 不互相 import |
| S72 | 模块视图不碰宿主面：components 不许 import 宿主入口 / `shared/host` / dsh 原语 / `node:*` |
| S73 | 模块不本地重声明协议；协议从 `@dsh-workbench/core/contract` 取 |
| S23 | 面文件只导出面值；跨运行时走错面当场红 |

模块包不在 core 层表里；它们由模块工具链的十三条判据与各自 `check` 守。

## 4. 适配器与端口

### 4.1 端口

| 端口 | 位置 | 管什么 |
|---|---|---|
| `DataReader` | `shared/contract/data.ts` | 统一传输：`http` / `browser` / `command`，以及配方 `request` / `submit` |
| `ProfilePort` | `shared/host/port-types.ts` | profile 目录、dsh 插件、自更新视图 |
| `EnvSupplyPort` | `shared/host/port-types.ts` | 供给窄口：插件来源、安装命令、release（7 个方法） |
| `ModulePort` | `shared/host/port-types.ts` | 已安装模块、registry、bundle、profile 包、自更新 |
| `ProbePort` | `shared/host/port-types.ts` | `probeUnits` / `registerPreflight` / `declaredPluginCommands` |
| `RuntimePort` | `shared/host/port-types.ts` | 包根、运行时命令/执行器/状态（按名字给）、自举、可写根告警 |
| `PluginSurface` | `shared/host/port-types.ts` | 插件清单、已装插件合成单元 |
| `HostActions` | `shared/host/port-types.ts` | config sync / profile create 的 handler 与写动作 |
| `AdapterSet` | `shared/host/adapters.ts` | 上面这些端口的聚合，外加 `apiVersion` / `id` / `version` |

`AdapterSet` 是组合根交给业务的唯一适配器对象；`WorkbenchAdapters` 是保留的别名。
`DataReader` 是模块作者最常用的端口；模块不 import adapter 包。
`CliPort` 仍存在，但它由 `runtime.commands(ctx)` 派生，不再是 `AdapterSet` 的成员。

### 4.2 组合根

只有 [`packages/core/src/app/host.ts`](packages/core/src/app/host.ts) 是组合根。它不静态 import 任何具体适配器：

```ts
const resolved = await resolveAdapterSet(ctx, config?.adapterSet, async () => {
  const mod = await import('@dsh-workbench/adapters-default');
  return mod.createAdapterSet(ctx);
});
const adapters = resolved.set;
adapters.runtime.seed(ctx, { corePackageUrl: import.meta.url, log: (message) => warn(ctx, message) });
ctx.provide(WORKBENCH_ADAPTERS, adapters);
```

- 不写 `config.adapterSet`：`loadAdapterSet` 返回 `not-configured`，默认 set 生效。
- 写了合法包名：从 profile 解析并 `import()`，核心成员覆盖默认 set。
- 坏 set：不抛；默认 set 生效，日志与 `/health` 的 `adapterSet` 带 `failure` / `detail`。
- 完整第三方 set 不建默认 set；`runtime.seed` 由 `apply` 无条件调一次（默认集合与第三方集合同一条路，工厂自己不 seed）。

业务模块通过 `adaptersOf(ctx)` 拿 `data` / `supply` / `modules` / `profile` / `probe`，不取具体实现。
`supplyPortOf(ctx)` 把 `supply` 与 `modules` 合成旧的 `SupplyPort` facade，给尚未迁移的调用点。

### 4.2.1 端口流

```text
业务模块 / 外壳单元
     │ adaptersOf(ctx) / supplyPortOf(ctx)
     ▼
AdapterSet
  ├── data     ──► adapter-runtime.data ──► http / browser / command
  ├── supply   ──► EnvSupplyPort（探针 / 市场）
  ├── modules  ──► ModulePort（已装模块 / registry / 自更新）
  ├── profile  ──► profile / dsh 插件 / self-update 视图
  ├── probe    ──► 探针与启动体检
  ├── runtime  ──► 自举 / opencli / 包根
  ├── plugins  ──► 插件清单与合成单元
  └── actions  ──► config sync / profile create
        │
        ▼
  adapters-default.createAdapterSet(ctx)（默认实现）
  或 profile 里第三方包导出的 createAdapterSet(ctx)
```

### 4.3 adapter-runtime 内部

```text
adapter-runtime/src/
  cli/        opencli 命令、隔离运行时、窗口参数、安装命令
  browser/    页面读、DOM 查找
  data/       DataReader 的 http / browser / command 实现
```

内部方向：

```text
cli ← browser ← data
```

`browser` 不依赖 `data`；`data` 不反向依赖 cli 之外的业务。

### 4.4 DataReader

```ts
type DataRequest =
  | { kind: 'http'; url; headers?; timeoutMs? }
  | { kind: 'browser'; script; url?; loginUrl?; session?; open?; timeoutMs? }
  | { kind: 'command'; command; timeoutMs? };

type DataResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code; message; status?; detail?; hint?; helpUrl? } };
```

- `http`：**只做 GET**；写走模块工具与审批。统一超时、状态码、401/403 → `auth`、非 JSON → `parse`。
- `browser`：复用浏览器适配器，读会话默认与屏会话分开。
- `command`：宿主执行命令，JSON 解析失败归 `parse`。
- 未知 `kind` → `invalid-request`。

### 4.4.1 配方（recipe）

模块可以不走自由脚本，而是给一份**配方**：

```ts
type RequestRecipe = {
  origin; loginUrl?; session?;
  auth?: { source: cookie | cookieValue | endpoint | meta | global | storage
           place: cookie | header | query | body };
  request: { method; path; query?; headers?; body?; contentType? };
  response?: { kind: 'json' | 'text'; path?; maxBytes? };
};

data.request(recipe, overrides?)          // 只许 GET
data.requestMany(recipe, calls)           // 一次换登录态、并发打 N 条（只许 GET）
data.submit(recipe, overrides?)           // 写工具里调
```

- **两个执行体**，同一份配方：
  1. **页面脚本**（默认，也是兜底）：壳把配方编译成页面脚本
     （[`shared/src/host/recipe.ts`](packages/shared/src/host/recipe.ts)），底层是 `browserRead`
     （opencli `browser <session> eval`）；凭据只在页面里取用、不回流宿主。
  2. **公共通道**（可选加速器）：`auth.source` 是 `cookie` / `cookieValue` 时，先试随壳出货的
     opencli 插件 [`adapter-runtime/channel`](packages/adapter-runtime/channel) —— 浏览器只当 cookie jar
     （`page.getCookies`，HttpOnly 也读得到），请求在宿主进程里发。命令跑不起来就回落 1，且只回落一次。
     `endpoint` / `meta` / `global` / `storage` / `custom` 不走它。
  通道是**传输换了个位置**，不是新能力：`cookie` 来源页面脚本本来就全对；它换来的是可单测的宿主侧传输
  与少数「会话 cookie 要抄进自定义头」的站点。凭据值永不进 argv（argv 只说「取哪一格、放哪」）。
- 配方可以生成：`design.json` 的 `key + recipe` 由 `dsh-wb-module sync` 写进
  `src/datasource.ts`，模块代码只调 `data.request(DATASOURCE.<key>)`；带 `calls` 的读另生成
  `DATASOURCE_CALLS.<key>`，代码调 `data.requestMany(DATASOURCE.<key>, DATASOURCE_CALLS.<key>)`。
  写同理：`writes[].key + recipe` 进同一个 `DATASOURCE`，工具里调 `data.submit(DATASOURCE.<key>, …)`。
- `requestMany` 只编译一次脚本：`calls` 的键就是结果名，每格的 `path` / `query` / `headers` / `response`
  覆盖配方的同名默认值；一条失败不连累其余（逐格映射页面码）。
- 页面码 → `DataError` 的映射带 `pageCode`：`auth` / `http` / `timeout` / `parse` / `browser`。
- 模块宿主 `mount({ data })`，卡片只消费模块路由，不直接读。

### 4.5 第三方适配器集合

第三方发布一个普通 ESM 包，实现 `AdapterSet`（或只交 `CoreAdapterSet`）：

```ts
// @acme/adapters-set
import type { AdapterSet } from '@dsh-workbench/shared/host';

export function createAdapterSet(ctx): AdapterSet {
  return { apiVersion: 1, id: '@acme/adapters-set', version: '1.0.0', /* ... */ };
}
```

```text
@acme/adapters-set
  ├── acme-http
  ├── acme-browser
  └── acme-db
```

安装到 profile 后，用 config 选它：

```yaml
# ~/.dsh/profiles/<名字>/cordis.patch.yml
- id: workbench
  config:
    adapterSet: "@acme/adapters-set"
```

- 值只接受包名；`file:` / `http:` / 绝对路径 / 相对路径都是 `malformed`。
- 不需要给 set 单独加 `dsh.profile.bundles`，也不依赖 patch 行顺序：`apply` 显式加载。
- 只交 `CoreAdapterSet`（`apiVersion` / `id` / `version` + `data` / `supply` / `profile` / `probe`）时，`modules` / `runtime` / `plugins` / `actions` 由默认 set 补齐；完整 set 要交全部成员，不再触发默认 set。
- 失败不抛：默认 set 生效，启动日志与 `/health` 的 `adapterSet` 里能看到原因。

完整契约、包形状与回退表见 [`ADAPTERS.md`](ADAPTERS.md)。

## 5. 单元协议

### 5.1 模块与单元

- **模块**：独立 dsh 插件包，有 npm 包名、`package.json`、构建产物。
- **单元**：模块在外壳里的那一格：id、卡片（可选）、工具、挂载面。

一个包 = 一个单元；一个单元在宿主与浏览器各有一半。

### 5.2 静态清单

```jsonc
"dsh": {
  "bundle": { "patch": "./cordis.patch.yml" },
  "client": {
    "platform": "web",
    "inject": ["@dsh-workbench/core"],
    "external": ["@dsh-workbench/core/client"]
  },
  "workbench": {
    "apiVersion": 3,
    "unit": "my-thing",
    "title": { "zh": "我的东西", "en": "My thing" },
    "card": { "order": 90 },
    "tools": [{ "name": "my_thing_read", "writes": false }],
    "host": { "inject": [], "optional": ["tools", "shell"] },
    "needs": [
      {
        "kind": "extension",
        "runtime": "opencli",
        "name": "acme-workflow",
        "commands": ["acme-read"],
        "purpose": "读写工单",
        "sources": [{ "kind": "npm", "package": "opencli-plugin-acme", "registryEnv": "ACME_REGISTRY" }]
      },
      { "kind": "bin", "name": "acme", "purpose": "平台命令" },
      { "kind": "env", "name": "ACME_TOKEN", "purpose": "访问令牌", "secret": true }
    ]
  },
  "workbenchFaces": { "host": "src/host.ts", "client": "src/client.tsx" }
}
```

- `apiVersion` 管形状；不认就不装、不挂。v3 把卡片标题挪成顶层的 `title`（`{ zh, en }` 字面量，`card` 只剩 `order`），v2 声明会被拒收并给迁移提示；v2 起 `env` 换成 `needs`。
- `needs` 只有四种 `kind`：`bin`（机器上的命令）/ `extension`（运行时插件）/ `lib`（共用 npm 依赖）/ `env`（环境变量）。
  未知 `kind` / `source.kind` 判红；need 内未知字段降为警告，`x-` 前缀忽略；`purpose` 必填。
- `lib` 自己会起运行时的命令（发布编排库自己 `execFile('opencli')` 就是这种）就写 `runs: ["opencli"]`：
  外壳在 `libs.load` 之后把「跑这个运行时」的执行器注入库的 `setOpencliRunner` —— 执行器走模块读缝，
  与面板同一份 opencli。库版本旧、没有这个接缝时退回它自己按 PATH 找，只记一条 warn。
- `sources` 按顺序试（本地 → 私有 → 公共），没写就只探不代装。
- `peerDependencies['@dsh-workbench/core']` 管服务面。
- `workbenchFaces` 只给门禁算可达性，运行期不读。
- 不认识的键会让清单被拒；拼错由 `protocol` 判据与运行时同一套拦下。

### 5.3 宿主面

```ts
const face = {
  unit: 'my-thing',
  mount({ data, ctx, manifest, store }) {
    return {
      routes: { 'my-thing': readRoute, 'my-thing/detail': detailRoute },
      registerTools: () => [],
      factsOf: () => ['my-thing'],
      needsApproval: {},
      prefs: { resource: 'my-thing', handle },
      actions: [{ resource: 'my-thing/act', handle }],
      provision: { handle },
      context: { kinds: ['my-thing'], render },
      warmReads: () => [['my-thing']],
      longTasks: registry,
      gate: { deniedTools, subscribe },
    };
  },
};
ctx.get('workbenchUnits').register(face);
```

`mount()` 的返回值就是外壳与单元的契约；外壳不认业务、不认工具名。

### 5.4 浏览器面

```ts
ctx.get('workbenchUnits').registerUnit({
  unit: 'my-thing',
  messages: {
    zh: { 'myThing.cardTitle': '我的模块' },
    en: { 'myThing.cardTitle': 'My module' },
  },
  card: (props) => <Card {...props} />,
  steps: { detail: { titleKey: 'myThing.detail', View: Detail } },
  approval: { tools: ['my_thing_write'], render },
});
```

卡片从 kit 取组件；不手搓 dsh 原语。

### 5.5 清单单一真相

```text
已装模块 package.json
  → 宿主 UnitManifest（名字：title 来自声明，titleKey 是外壳合成的那个键）
  → GET /workbench/api/unit-manifests
  → 浏览器 setManifests()
  → 无清单的卡片不挂
```

浏览器不读模块 `package.json`，不在浏览器再写一份清单。
`titleKey` 恒等于 `unitTitleKey(id)`：有没有卡片都指向同一个词表键，展示方一律 `t(titleKey)`，
不再写「没卡片就退回单元 id」的兜底。

### 5.6 装配期

- `host.inject` 缺一个就挂不上；`host.optional` 缺了降级。
- 路由名必须是 `<unit>` 或 `<unit>/…`。
- 路由 / 偏好资源 / 动作资源 / 上下文 kind 重名只废后来那个单元。
- `gate` 与 `provision` 全壳只能有一个提供者。
- `mount()` 失败要撤回已注册工具（路由在 mount 成功后才收）。
- 清单 `tools[].name` 与 `registerTools()` 实际名字对账；`writes: true` 必须有审批。

### 5.7 生命周期

```text
dsh plugin add <module>
        │
        ▼
profile/package.json  ← 模块清单 dsh.workbench
        │
        ▼
core 读清单 ──► UnitManifest
        │
        ├── host: 模块 apply(ctx) → workbenchUnits.register(face)
        │        └── mountUnits(face.mount({data,...}))
        │              ├── routes
        │              ├── tools + approval
        │              ├── prefs / actions
        │              └── facts / long tasks
        │
        └── client: registerUnit({card,messages})
                 └── GET unit-manifests
                       └── 卡片上板

dsh plugin remove <module>
        │
        ▼
清单撤下 → 宿主撤路由 / 工具 / 写通道 → 浏览器撤卡片
```

### 5.8 状态与配置

```text
卡片显示 / 隐藏
      │
      ▼
panel-state 资源（machine / workspace）
      │
      ▼
WorkspaceStore ──► POST /workbench/api/prefs
      │
      ▼
浏览器 hook / refreshToken ──► 卡片重绘

单元自己的配置
  unit prefs / actions
      │
      ▼
资源 handler ──► WorkspaceStore / 外部副作用
```

- 显示状态按工作区存，换项目不会串。
- 单元只通过外壳给的专属目录读写状态；不自己找全局文件。
- 卡片不直接写，写入走 prefs / actions / agent 工具。

### 5.9 失败与降级

```text
模块清单缺失 / apiVersion 不认
      └── 不挂载，卡片不出现（no-manifest / withdrawn）

host.inject 缺硬依赖
      └── 单元跳过，其它单元照常

host.optional 缺
      └── 单元挂载，相关能力降级

mount() 抛错 / 工具注册到一半失败
      └── 撤回已注册路由 / 工具，记入 failures

写工具没认领审批
      └── 运行时拒绝（fail closed）

适配器缺失 / 不可用
      └── 对应能力返回 unavailable；不拖垮整个外壳
```

## 6. 数据与写

### 6.1 读

```text
卡片 / 面板
  → GET /workbench/api/<unit>/…
  → 单元 routes
  → deps.data.read(...)
  → adapter-runtime data
```

读只走 `GET` 投影；写见 §6.3。

```text
卡片 ──GET /workbench/api/<unit>──► 单元 route ──data.read──► DataReader
                                                       ├─ http
                                                       ├─ browser
                                                       └─ command
```

### 6.2 推

事实变化经 `/workbench/events` SSE 推给浏览器；卡片用 `useApiResource` / `refreshToken` 拉新。

```text
宿主事实变化 ──► /workbench/events (SSE) ──► 浏览器 hook ──► 卡片刷新
```

### 6.3 写

```text
POST /workbench/api/prefs
POST /workbench/api/actions
POST /workbench/api/provision
```

写入只走宿主写通道或 agent 工具；界面不直接写平台。
用户直接发起的单步业务动作走 `actions`（点击即确认，不审批，记一次 run），且必须与一把 agent 工具
共用同一实现；其余业务写入走 agent 工具与审批。会写的工具必须有审批策略；没认领 = fail closed
（ADR-0090）。

```text
agent 工具 / 卡片动作
        │
        ▼
POST /workbench/api/prefs|actions|provision
        │
        ▼
宿主写通道 ──► 单元 handle ──► WorkspaceStore / 外部副作用
        │
        └── 写工具：审批策略（没有认领 → 拒）
```

## 7. 界面与 kit

- 布局：左栏 `app/layouts/sidebar`，右侧面板列 `app/layouts/rightbar`，市场 `app/layouts/market`，启动体检 `app/layouts/env-gate`。
- 槽位与 board 在 `kernel/client`。
- 卡片从 `@dsh-workbench/core/client` 的 kit 取组件、hooks 与 lib；kit 没有的标准控件（如 `Button` / `Modal` / `Switch` / `StateDot`）从 `@deepseek-ai/dsh-client-ui-primitives` 取，并在 `dsh.client.external` 声明。
- 令牌用 `--dsw-*`；颜色、圆角、字号、间距不写字面值。
- 组件样式跟随组件，`.module.css`；不手写全局样式。
- 三态用 kit：加载 / 空 / 错误；`idle` 是独立态。

### 7.1 界面装配

```text
app/client.tsx
  ├── app/layouts/sidebar ──► 左栏
  ├── app/layouts/rightbar ──► 面板列
  │      └── 卡片槽 ──► registerUnit().card
  ├── app/layouts/market ──► 市场页
  └── app/layouts/env-gate ──► 启动体检

卡片 ──► @dsh-workbench/core/client kit
            ├── components
            ├── hooks
            └── lib
```

## 8. 模块工具与 skills

### 8.1 module-tools

```text
dsh-wb-module build     构建宿主面 / 浏览器面
dsh-wb-module check     十三条判据
dsh-wb-module lint      lint
dsh-wb-module init      从模板建模块
```

模板有 `template` 与 `template-diy`；模块默认 `private: true`。

### 8.2 skills

工作台 DIY skill 随 `@dsh-workbench/core` 出货，是一层平面文档：

```text
packages/core/skills/workbench-module-diy/
  SKILL.md        入口：流程与索引
  DESIGN.md       判域、三张表、ASCII、design.json
  STEPS.md        三步问法
  DATASOURCE.md   探数据源、固化读
  WRITES.md       写通道
  PANEL.md        面板、状态矩阵、界面规则
  KIT.md          组件与表单
  TOOLS.md        agent 能力、审批、长任务
  COPY.md         文案
  FAMILY.md       工具族：怎么选、怎么串
  LINKAGE.md      刷新与事实
  BUILD.md        落点、模板、两个面
  WIRING.md       安装、热换、发布
  REVIEW.md       门禁与取证
```

规则：

- `SKILL.md` 只做流程与索引，不塞完整方法；其余文档按需读。
- 默认读者在 DSH 的 DIY 会话里；不再按 core / dsh / agent-tools 分层，也不为非 dsh 或无工具环境单独写 fallback。
- 数据源文档教 `data.read`，不教直接 import adapter。

仓库根 `.agents/skills/` 是给在本仓写代码的 agent 用的工程 skill，和上面这套出货 skill 不是一层。

## 9. 安装与发布

默认安装：

```text
@dsh-workbench/core
  └── (dynamic fallback) @dsh-workbench/adapters-default
        └── runtime / supply / profile / probe
```

```text
profile
  └── @dsh-workbench/core
        └── @dsh-workbench/adapters-default
              ├── adapter-runtime
              ├── adapter-supply
              ├── adapter-profile
              └── adapter-probe

module 包 ──dsh plugin add──► profile
  └── dsh.workbench 清单 + 两个面
```

- profile 的 `dsh.profile.bundles` 只需要 `@dsh-workbench/core`；适配器是它的依赖，不需要额外 enable。
- 模块走 `dsh plugin add`；模块清单决定装不装、挂不挂。
- `pnpm release` 前必须过完整 `pnpm run check`。
- 发布产物零夹具：`check:release-artifacts` 扫 `WB_RELEASE=1` 的临时产物。

## 10. 门禁

根命令：

```bash
pnpm run check
```

顺序：

```text
lint:commit → build → typecheck → lint → coverage → check:gates:target
→ arch → check:docs → check:runtimes → selfcheck
→ check:modules（模块工具 13 判据）→ check:adapter-defaults → check:release-artifacts
```

```text
lint:commit
   ▼
build ──► typecheck ──► lint ──► coverage ──► check:gates:target
                                                    │
                                                    ▼
                                            arch ──► check:docs ──► check:runtimes
                                                    │
                                                    ▼
                                            selfcheck ──► check:modules
                                                    │
                                                    ▼
                                  check:adapter-defaults ──► check:release-artifacts
```

目标门禁：

```bash
pnpm run check:gates:target
```

当前目标报告是 **33 绿 / 0 红**。重点判据：

| 判据 | 判什么 |
|---|---|
| `WB-A1` | 只有组合根可以 import `adapters-default` / 具体 adapter |
| `SH-A1` | shared 不依赖、不 import adapter / core；`shared/src/adapters` 为空 |
| `SK-2 / SK-3` | skill 链接与 SKILL.md 索引 |
| `CHAIN-1/2` | 目标报告入口与并入时机 |
| `COV-1` | 关键文件覆盖率 |
| `DOC-1..3` | ARCHITECTURE roles、CHECKS 元数据、文档链接 |

同一棵树不许有别的进程同时读 `packages/core/src`：`check:standalone` 会把它改名成 `src.hidden`，`pnpm run dev` 的 watcher 会同时写产物；`coverage` 会重写 `packages/core/coverage/`。发版前先停 dev。

## 11. 文档

公开：

- `ARCHITECTURE.md`：当前架构
- `CONTRIBUTING.md`：开发与门禁
- `packages/*/README.md`：包自己的使用与边界
- `packages/core/skills/workbench-module-diy/`：模块作者指引

内部：

- 目标 spec、门禁契约、迁移记录住 `private-docs/.scratch/architecture/`
- ADR 住 `private-docs/docs/adr/`

公开构建与门禁不依赖 `private-docs/`。

## 12. 扩展点

| 想扩展 | 改哪里 |
|---|---|
| 加业务模块 | 新建 dsh 插件包，写 `dsh.workbench` + 两个面 |
| 加外壳域 / 面板 | `packages/core/src/modules/` + `app/layouts/` |
| 换数据源 / 浏览器 / CLI | 实现 `AdapterSet` 的对应端口，用 config 指过去；或换 `adapters-default` 的实现包 |
| 换整套适配器 | 发布 `adapters-set` 包，profile 里 `workbench.config.adapterSet` 指向它，重启 |
| 加模块能力 | `UnitMountResult` 的 routes / tools / prefs / actions / provision / context / longTasks |
| 加检查 | `module-tools` 判据或 `scripts/gates/target.mjs` |
