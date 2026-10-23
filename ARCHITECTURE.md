# 架构

> 本文讲形状：仓库怎么分层、一个模块怎么接进来、数据怎么流、门禁判什么。
> 模块作者看 [`packages/workbench/skills/workbench-module-diy/`](packages/workbench/skills/workbench-module-diy/SKILL.md)；
> 术语拿不准查 [`CONTEXT.md`](CONTEXT.md)；装机与排障见
> [`packages/workbench/README.md`](packages/workbench/README.md)。

## 0. 一句话

**一个 dsh 插件包，两个运行时，一条 HTTP 投影。**
外壳只提供机制：左栏、会话、右侧面板列、单元注册表、工具面、审批、市场。
**外壳自己不带业务模块**；业务模块是独立的 dsh 插件包，按需装进 profile，
装上才出现、卸掉就消失。

```
┌──────────── dsh 进程（宿主半侧） ────────────┐
│ app/host.ts                                  │
│  ├ shared/api/host/**   shell / git / opencli │
│  ├ modules/*/model/**   外壳自己的域          │
│  └ 单元注册表 + 工具 + 路由 + 写通道          │
└───────────────┬──────────────────────────────┘
                │ 读：GET /workbench/api/<route>
                │ 推：SSE /workbench/events
                │ 写：POST prefs / actions / provision
┌───────────────┴──────────────────────────────┐
│ 浏览器（浏览器半侧）                          │
│ app/client.tsx                               │
│  ├ app/layouts/sidebar    左栏                │
│  ├ app/layouts/rightbar   面板列（看板 / 模块页）│
│  ├ app/units              单元花名册          │
│  └ 模块卡片 + kit（hooks / 组件 / 读缝）      │
└──────────────────────────────────────────────┘
```

两个运行时**各只有一个接缝**：宿主 `app/host.ts`，浏览器 `app/client.tsx`。

## 1. 仓库里的四个包

| 路径 | 是什么 | 发布为 |
|---|---|---|
| `packages/workbench/` | 外壳：左栏、会话、面板列、外壳自己的单元、启动器与门禁 | `@dsh-workbench/core` |
| `packages/shared/` | 契约类型、纯逻辑、哑组件、i18n、宿主侧纯函数 | `@dsh-workbench/shared` |
| `packages/module-tools/` | 模块的 `build` / `check` / `lint` / `init` | `@dsh-workbench/module-tools` |
| `packages/module-hello/` | 最小可安装模块样本，同时是模块包模板 | `@dsh-workbench/module-hello` |

`packages/shared` 有两个运行入口，另有一个测试入口：

| 入口 | 给谁 | 放什么 |
|---|---|---|
| `.` | 浏览器侧与模块 | 契约类型、纯 lib、i18n、哑组件 |
| `./host` | 宿主侧 | 文件、进程、HTTP、工具、长任务等真正跑在 Node 里的东西 |
| `./testing` | 测试 | 夹具与断言 |

本文说的“外壳源码”只指 `packages/workbench/src/**`。模块包不在这个仓里
（`module-hello` 只是样本）；门禁的“外壳”部分只扫这个目录。

## 2. 两个运行时

| | 宿主半侧 | 浏览器半侧 |
|---|---|---|
| 入口 | `src/app/host.ts` | `src/app/client.tsx` |
| 跑在哪 | dsh 进程（Node） | dsh 的页面（浏览器 / Electron） |
| 产物 | `dist/host/index.js`（单文件 ESM） | `client.js`（单文件 CJS，套 `__ModuleLoader__.load`） |
| 外部 | node 内置 | react + dsh 的 UI 原语（由模块表提供） |

三条规矩：

1. **两侧不许互相 import。** 宿主侧在 `src/shared/api/host/**` 与 `src/modules/*/model/**`；
   浏览器侧不许进这两个前缀。`scripts/check-runtimes.mjs` 从浏览器入口走一遍 import 图，
   走进去就失败。
2. **`@dsh-workbench/shared` 的宿主侧只许从 `./host` 取运行值。** 根入口是给浏览器与模块的。
3. **dsh 的浏览器产物直接用，不手搓。** `Button` / `Modal` / `Switch` / `StateDot` / 图标
   经模块表 `require('@deepseek-ai/dsh-client-ui-primitives')` 取；构建时标成 external。
   打进包就是第二份实例，`selfcheck` 会点名。

## 3. 层序与边界

层号就是依赖方向：一个文件只许依赖**层号 ≤ 自己**的文件（arch-guard 的 S21）。
这张表由 [`arch.config.mjs`](packages/workbench/arch.config.mjs) 生成（`--render-docs`），不手抄：

<!-- arch-guard:begin roles -->
| 角色 | 路径 glob | 层号 | 槽位 | 组 | 公开面 |
| --- | --- | --- | --- | --- | --- |
| `test` | `**/*.test.{ts,tsx,mts,cts,js,mjs,cjs}` | 99 | — | — | — |
| `test` | `**/*.spec.{ts,tsx,mts,cts,js,mjs,cjs}` | 99 | — | — | — |
| `lib:entry` | `src/app/host.ts` | 10 | `entry` | — | — |
| `lib:entry` | `src/app/client.tsx` | 10 | `entry` | — | — |
| `lib:shared/styles` | `src/shared/styles/**` | 0 | — | — | — |
| `lib:shared/api` | `src/shared/api/**` | 4 | — | — | — |
| `lib:shared/hooks` | `src/shared/hooks/**` | 7 | — | — | — |
| `lib:shared/components` | `src/shared/components/**` | 8 | — | — | — |
| `lib:modules/sessions` | `src/modules/sessions/**` | 10 | — | — | — |
| `lib:modules/panels` | `src/modules/panels/**` | 10 | — | — | — |
| `lib:app/layouts` | `src/app/layouts/**` | 10 | — | — | — |
| `lib:app/units` | `src/app/units/**` | 10 | — | — | — |
| `lib:dev` | `src/dev/**` | 10 | — | — | — |
<!-- arch-guard:end roles -->

`test` 行是测试文件（层号 99，不在依赖方向上）。

<!-- arch-guard:begin structure -->
| 声明 | 含义 | 规则 |
| --- | --- | --- |
| `order` | 开启：只许依赖层号 ≤ 自己的文件 | S21 |
| `isolate` | （未声明） | S22 |
| `publicApi` | （未声明） | S23 |
<!-- arch-guard:end structure -->

除了层号，还有几条**层号表达不了**的边界，由自定义规则与脚本守：

| 规则 | 判什么 |
|---|---|
| S60 | 外壳只许使用单元的公开面，不许伸进单元内部 |
| S62 | 单元之间不许互相 import |
| S63 | 单元的清单只依赖纯类型契约 |
| S64 | 单元必须在宿主与浏览器两端都登记 |
| S65 | 外壳层不得出现平台知识（平台名、仓库身份、平台命令） |
| S66 | 外壳层不得出现单元 id |
| S67 | 单元只能通过外壳给的专属文件夹读写状态 |
| S68 | 跨平台库能力要走登记的首选方案，不手写轮子 |
| S23 | 面文件只许导出面值；跨运行时走错面当场红 |

两个运行时的**相互隔离**由 `scripts/check-runtimes.mjs` 守，不由层号守 ——
层号只能表达“向下依赖”，表达不了“互相不许引”。

模块包（带 `dsh.workbench` 的那些包）不在这张表里：它们由根上的十三条判据 + 各自的
`build` / `typecheck` / `test` / `selfcheck` 守。

## 4. 单元：模块接进来的形状

### 4.1 模块与单元

- **模块（module）** = 一个独立的 dsh 插件包，有自己的 npm 包名、`package.json` 和构建产物。
- **单元（unit）** = 这个包在外壳里的那一格：一个 id、一张卡片（可选）、一组工具、
  一份挂载面。id 会进持久化配置，所以不能撞。

一个包 = 一个单元；一个单元可以在宿主与浏览器各有一半。

### 4.2 静态半：`package.json` 的 `dsh.workbench`

装机前就能定、不随运行变化的东西，全部写在清单里：

```jsonc
"dsh": {
  "bundle": { "patch": "./cordis.patch.yml" },          // 把自己插进 profile
  "client": {
    "platform": "web",
    "inject": ["@dsh-workbench/core"],
    "external": ["@dsh-workbench/core/client"]
  },
  "workbench": {
    "apiVersion": 1,                                     // 形状契约；不认就不装、不挂
    "unit": "my-thing",                                  // 单元 id
    "card": { "titleKey": "myThing.cardTitle", "order": 90 }, // 没有卡片写 null
    "tools": [{ "name": "my_thing_read", "writes": false }],  // 没工具写 []
    "host": { "inject": [], "optional": ["tools", "shell"] },  // 要外壳的哪些服务
    "env": { "command": "opencli", "plugins": [], "libs": [] } // 可选：外部供给
  },
  // 工具链元数据，不在协议里：两个 half 的源码入口，只给门禁算可达性
  "workbenchFaces": { "host": "src/host.ts", "client": "src/client.tsx" }
}
```

- `apiVersion` 管**形状**：外壳读不读得懂这份清单。不认识的版本 = 拒（装机前拒，
  已装的也不挂），不猜、不降级。
- `peerDependencies['@dsh-workbench/core']` 管**服务面**：外壳 provide 的服务在不在。
  两条不许互相替代。
- `dsh.workbenchFaces` 是**兄弟键**：运行期与装机预检都不读它，只有门禁读。
- 协议不认识的键会被**静默忽略**，所以 `protocol` 判据先把拼错的键拦下来。

### 4.3 动态半：宿主 `mount()` 与浏览器 `registerUnit()`

宿主半侧在 `apply(ctx)` 里拿 `workbenchUnits` 服务，登记 `{ unit, mount(deps) }`：

```ts
const face = {
  unit: 'my-thing',
  mount(deps) {
    return {
      // 路由名必须住在自己那一格里：'my-thing' 或 'my-thing/…'
      routes: { 'my-thing': readRoute, 'my-thing/detail': detailRoute },
      // 工具：名字必须与清单 tools[].name 对得上
      registerTools: () => [deps.ctx.get('tools').register({ /* ... */ })],
      factsOf: () => ['my-thing'],        // 这次调用惊动了哪几条事实
      needsApproval: { /* ... */ },       // 会写的工具：什么时候问
      approvalDetail: () => ({}),         // 审批弹窗里那几行
      prefs: { resource: 'my-thing', handle },        // 可选：偏好写
      actions: [{ resource: 'my-thing/act', handle }], // 可选：动作写
      provision: { handle },              // 可选：机器供给（全壳只能有一个）
      context: { kinds: ['my-thing'], render },       // 可选：@ 引用
      warmReads: () => [['my-thing']],    // 可选：启动预热
      longTasks: registry,                // 可选：长任务
      gate: { deniedTools, subscribe },   // 可选：运行期收窄工具面
    };
  },
};
ctx.get('workbenchUnits').register(face);
```

浏览器半侧登记同一格：

```ts
ctx.get('workbenchUnits').registerUnit({
  unit: 'my-thing',
  messages: {
    zh: { 'myThing.cardTitle': '我的模块' },
    en: { 'myThing.cardTitle': 'My module' },
  },
  card: (props) => <Card {...props} />,               // 卡片；没有卡片就不写
  steps: { detail: { titleKey: 'myThing.detail', View: Detail } }, // 可选：子页
  approval: { tools: ['my_thing_write'], render },    // 可选：审批明细
});
```

`mount()` 的返回值就是外壳与单元之间的全部契约。外壳只认这些键，不认工具名、不认业务。

### 4.4 清单只有一处真相

```
已装模块的 package.json（dsh.workbench）
        │  宿主读、校验、构造 UnitManifest
        ▼
宿主单元注册表 manifests()
        │  GET /workbench/api/unit-manifests
        ▼
浏览器 setManifests() —— 没有清单的单元，卡片不挂
```

浏览器拿不到模块包的 `package.json`，所以清单只能由宿主交；**同一份清单不在浏览器里再写一遍**。
`setManifests()` 之前注册的卡片会先被拒（`no-manifest`），拿到清单后自动补挂；
清单被撤（模块卸了）时卡片自动摘掉（`withdrawn`）。

### 4.5 装配期判据

- **就绪**：`host.inject` 缺一个就挂不上（硬依赖）；`host.optional` 缺了照挂，只是降级。
  判据在 `unit-readiness.ts`，发生在 `mount()` **之前** —— 所以 `inject` 必须在静态清单里。
- **命名空间**：路由名必须是 `<unit>` 或 `<unit>/...`；否则装 / 升 / 卸时点名不到它，
  那个模块的数据会停在旧值。
- **冲突**：路由 / 偏好资源 / 动作资源 / 上下文 kind 重名 → **只废掉后来那个单元**，
  外壳与其它单元照常。`gate` 与 `provision` 全壳只能有一个提供者。
- **回滚**：`mount()` 抛错或工具注册到一半失败，已经注册的工具与路由要撤回；
  不撤回的症状是“单元判失败、它的工具还挂着能调”。
- **工具清单对账**：清单里 `tools[].name` 与 `registerTools()` 真正注册的名字必须一致；
  `writes: true` 的工具必须有单元认领审批，没认领 = 运行时拒（fail closed）。

### 4.6 外壳自己的单元

外壳只带一个自有单元：`panels`（看板配置、市场、DIY、长任务、审批明细）。
它**没有卡片**，也不归用户的板管 —— 它就是面板本身。
`modules/sessions` 是外壳的域（会话导航），不是单元。

### 4.7 没有模块包的能力：插件单元

已经装进 profile 的 **opencli 插件**如果带命令面，外壳会把它的命令**合成**成一个单元：
每个插件一个单元，命令各生成一把工具。这样“装个 opencli 插件”就能直接给 agent 能力，
不必先写一个模块包。

合成有预算、有保留名（`run_code` 是 dsh 的，不合成）、有去重（已装模块自己提供的命令不重复合成）。
`plugin-units.ts` 负责规划与刷新，`health` 路由里能看到每个插件合成了几把工具。

## 5. 宿主装配

`app/host.ts` 的 `apply(ctx)` 按下面的顺序把外壳立起来：

1. **自举**：单 profile 安装那条路上没有启动器，宿主自己补 `$DSH_HOME/workbench/**`、
   隔离 opencli 入口、`PATH`、工坊骨架（`runtime-seed.ts`）。
2. **建三条账**：事实账本（`facts`）、值交接（`values`）、面板运行态（`panelState`）。
3. **外壳路由**：`health` / `changes` / `plugins` / `bundles` / `versions` / `unit-manifests`。
4. **单元注册表**：`createUnitRegistry`，`provide(UNITS_SERVICE)`，登记外壳自有单元；
   之后每个模块 / 插件单元注册进来都会触发一次 `sync()`。
5. **挂载**：`mountUnits()` 逐个算就绪、调 `mount()`、收路由 / 工具 / 写通道 / 事实 /
   上下文 / 长任务；冲突只废那一个。
6. **写通道**：`prefs` / `actions` / `provision` 三条前缀按当前挂载表重新绑定；
   单元增删后 `rebind`。
7. **闸门**：`tools/pre-execute` 上挂审批；`agent/created` 与 `system-prompt/assemble`
   上收窄工具面；`tools/post-execute` 上记事实。
8. **推送**：SSE 变更流、面板运行态、DIY 动作、HTTP 投影。
9. **对话**：`agent/pre-step` 注入 `@` 引用与长任务通知。

**外壳拥有**：路由表、工具表、事实账本、审批机制、工具面收窄、写通道前缀、
面板运行态、长任务注册表、HTTP / SSE 服务。
**单元拥有**：自己的数据源、工具实现、审批策略与明细、路由处理、卡片与视图、文案。

## 6. 数据通路

### 6.1 读：GET 投影

面板读宿主只有一条路：`GET /workbench/api/<route>`。
路由表 = 外壳路由 + 各单元路由；单元路由必须住在 `<unit>` / `<unit>/...` 命名空间里。

读口**没有 token**，只靠 loopback 绑定。所以：

- 只放读，不放敏感操作；写走下面三条 POST。
- 不要把凭据、cookie、内部地址放进响应。
- 需要鉴权的能力应该走 dsh 自己的 Remote，而不是这个投影。

### 6.2 事实：一条通道

事实名就是一个字符串（通常是路由名，也可以更窄，如 `my-thing/builds?env=dev`）。
宿主记一本事实账；工具调用、写通道、装 / 升 / 卸都会 `bump` 相应的事实。
浏览器侧 `useApiResource` 订阅 `factOfRoute(route)`，事实一变就自动重读 ——
**视图不需要自己记得订阅**。

- 推送：`/workbench/events` 的 SSE，帧里有 `epoch` / `rev` / `facts`，断线用游标续传。
- 兜底：SSE 断了走 `/workbench/api/changes` 轮询，答的是同一本账。
- 声明：单元的 `factsOf(call)` 说“这次工具调用惊动了哪几条事实”；没声明时，
  写工具按单元的事实族兜底。
- 族：`<unit>*`（范围名）表示“这个单元的数据全作废”，通道按 `<unit>` 或 `<unit>/…` 展开；
  装 / 升 / 卸一份安装时，声明它的单元各被点名一次。

**数据一律实时，不加缓存。** 允许的只有**合并并发**：同一时刻相同的请求共享同一次真实调用
（`opencli.ts` 的 in-flight 去重 + 并发上限），它不是缓存 —— 没人拿到比调用时刻更旧的数据。

### 6.3 值交接（handoff）

agent 工具刚取到的那份值，可以直接交给面板的**下一次**重读：工具 `hand`，读口 `take`，
只交一次、有 TTL（15 秒）、面板自己读出来的值不回填。

它解决的是“agent 刚看过、面板又打一遍平台”的重复；**不是缓存**：

- 只有 agent 工具能交，路由只领；
- 只交“工具手里那份就是这条投影的值”的情况；
- 过期或没人领就丢掉。

### 6.4 写：三条通道

| 通道 | 前缀 | 谁用 | 写什么 |
|---|---|---|---|
| 偏好 | `POST /workbench/api/prefs/<resource>` | 面板 | 看板配置、模块偏好 |
| 动作 | `POST /workbench/api/actions/<resource>` | 面板 | 单元自己定义的“一跳”动作 |
| 供给 | `POST /workbench/api/provision` | 市场 | 装 / 升 / 卸模块、插件、共用库 |

浏览器侧只有 `useHostWrite` 一个落点；`apiPost` 的 import 也被 `callSites` 规则收在那里
（例外只有面板运行态上报，它不是业务写，发不出去就丢）。

**面板不写业务状态。** 业务写走 agent 工具；面板上那颗按钮实质是“让 agent 去做”。
这是本仓的硬规则（见 [`AGENTS.md`](AGENTS.md) 的六条硬约束），也是审批闸门存在的理由。

### 6.5 审批

`tools[].writes: true` 是“这会写”的唯一声明。单元在 `mount()` 里交 `needsApproval`
（判据）与 `approvalDetail`（弹窗里那几行）：

- 读工具：`list` / 预览，不问。
- 写工具：默认问；完全权限（`danger-full-access` + `never`）下不问，但仍认领。
- 没认领的写工具：运行时拒（fail closed，不静默写）。
- 审批屏的明细由 `conversation.approval.detail` 槽位渲染；外壳不认任何工具名。

### 6.6 工具面收窄

工具面由**用户的板**决定，不由模块作者声明：

- 一个单元不在当前工作区的板上 ⇒ 它的卡片与**全部**工具一起下。
- DIY 模式：只留 DIY 那一族；非 DIY 模式：收走 DIY 那一族。
- 屏调试不可用的环境（如 Desktop）：收走 `debug_*` / `logs_*`，站点探索工具照旧。
- 收窄发生在 `agent/created` 与 `system-prompt/assemble`：后者直接把收起的工具从清单里删掉，
  不靠“限制的生效时机”。

### 6.7 长任务

单元可以交 `longTasks`：一个注册表，任务有 id、状态、可读、可停。
外壳把它挂成 `<unit>/runs` 路由与 `<unit>/runs/stop` 动作，
左栏的会话行有长任务点时显示；agent 用 `workbench_long_tasks_list` /
`workbench_long_tasks_stop` 读和停。

## 7. 槽位与面板

### 7.1 槽位接线

dsh 的框架只有五个区域：`sidebar` / `main` / `rightbar` / `shell.overlay` / `shell.leading`。
工作台动其中三个：

```
root
├── sidebar (single)   ← 默认官方；选“自定义”时工作台接管
│   ├── sidebar.brand.mark / .name
│   ├── sidebar.toggle.badge
│   ├── sidebar.panellist (list)   ← 其它插件的面板入口照旧可用
│   │      └── 工作台自己也挂一条「工作台模块市场」
│   ├── sidebar.settings (single)
│   ├── sidebar.footer.action (list)
│   ├── sidebar.workspaces.session.menu.item / .row.action
│   ├── sidebar.session.row.leading / .hover   ← 长任务点
│   └── ✗ sidebar.workspaces                  ← 刻意不声明：出厂会话浏览区不挂载
├── main (keyed)   ← dsh 保留 conversation；工作台注册 workbench-market
└── rightbar (single) ← 工作台接管（priority: -1）
```

另外三处注册：

- `conversation.approval.detail`：审批弹窗里的“这次会发生什么”。
- `conversation.session.header.corner`：列切换（工作台 / dsh）。
- `settings.section`：工作台设置（顺序 40）。

**复用分两档**，都不去 import dsh 的页面实现（`dsh-client-ui-sidebar` 那类），
只经模块表用它的 UI 原语：

| 档 | 做法 | 范围 |
|---|---|---|
| 槽位复用 | 声明并 `renderSlot` | 品牌行、设置面板、其它插件的面板入口、会话的置顶 / 重命名 / 分叉 / 归档 |
| 源码复用 | 抄 markup / CSS / behavior，改前缀，只留 `--dsw-*` 令牌 | `shared/styles/sidebar.css`（抄自 ui-sidebar，前缀 `wb-`） |

两套左栏靠**组合层**二选一，不靠运行时优先级（见 §9.3）。

### 7.2 面板列

右侧那一列是工作台自研的，接管 dsh 的 `rightbar` 槽（`priority: -1`）。
它有自己的状态：展开与否、当前列（工作台 / dsh）、面包屑路径。默认列是工作台看板。

- **看板**：由单元卡片按用户顺序组成。
- **子页**：单元的 `steps`（`kind` + `titleKey` + `View`），面包屑导航，不是标签页。
- **模块页**：已装 / 未装 / 共用依赖 / 插件 / 工作台更新，走 `main` 槽的 `workbench-market` 键。
- **dsh 列**：可以借道官方右栏（`ColumnSwitch`），借的时候把列让出去，还的时候收回来。

### 7.3 板：可见性归用户

每个工作区一份 `panels/config.json`，机器级一份 `_machine/panels/config.json`：

```jsonc
{ "shown": ["issues", "builds"], "hidden": ["dashboards"], "order": ["builds", "issues"] }
```

解析按**逐行覆盖**：

1. 本工作区那份板提到了这一格（`hidden` 或 `shown`）→ 按它（同一格里 `hidden` 压过 `shown`）。
2. 没提到 → 机器级板提到了 → 按它（同样 `hidden` 压过 `shown`）。
3. 都没提到 → 关（默认全空）。

卡片面与工具面**共用**同一份结果。用户关掉一个单元 = 这个工作区明确不要它，
卡片与全部工具一起下。

- `show` / `hide`：往指定作用域（默认本工作区）写一行。
- `reset`：写一份**显式空板**，清掉这个作用域自己的选择；没提到的行仍按下一层解析。
- `follow`：删掉本工作区的覆盖（整份或某一行），回到机器级默认。

### 7.4 卡片

卡片是单元交的 `card` 组件，收到 `BoardModuleProps`：世界快照、刷新令牌、四个回调、`t`。
它只负责**呈现**与**交代**：刷新、跳子页、打开市场、报摘要；不写业务状态。

两张机制表：

- `useUnitBoard` / `useCardSummary`：卡片的状态上报（在不在刷新、上次读到什么时候）。
- `useApiResource` / `useCapabilityGate`：取数与能力闸。

## 8. 外部供给与市场

“装一个模块”在三层上各有一半，市场行必须按三层叠出状态：

| 层 | 是什么 | 谁回答 |
|---|---|---|
| 代码 | 模块包在不在 profile 里 | 已装清单 / 注册表 |
| 供给 | 它要的 opencli 插件、共用库在不在、版本对不对 | 能力探测 / `env.plugins` / `env.libs` |
| 启用 | 它在这个工作区的板上吗 | 用户的板 |

`env.plugins[]` 每份带 `name` / `commands` / `installSource`（git / local / npm），
`env.libs[]` 带版本范围与用途。市场动作由 `panels` 单元按声明**逐份**拼：
装哪几份、更新哪几份、哪几份被别的模块共用着要留下。
**别在任何地方写死插件名。**

市场支持：装 / 升 / 卸模块、装 bundle、更新共用依赖、更新 / 卸载插件、更新工作台、取消安装。
命令走 `provision` 通道，人按的走面板，agent 走 `workbench_modules_*` 工具。

**DIY**：`$DSH_HOME/workbench/diy` 是工坊工作区，agent 在里面用 `dsh-wb-module init`
建骨架、写宿主 / 浏览器两半、`build` / `check`、装进 profile。DIY 模式由
`preset/diy.patch.yml` 派生自 dsh 出厂 preset；那一族工具只在 DIY 模式的会话里出现。

## 9. 启动与配置

### 9.1 profile 与组合层

工作台跑在自己的 `workbench` profile 里（`setup` 建的），与 `dsh web` 并存。
组合顺序（同 id 后层覆盖前层）：

```
1. bundle 层        dsh.profile.bundles 顺序        ← 工作台的 cordis.patch.yml 在这一层
2. profile 用户层   profiles/<name>/cordis.patch.yml ← Settings 页写这里
3. 机器公共层       $DSH_HOME/cordis.patch.yml       ← 对所有 profile 生效
4. --patch 叠加层   按命令行顺序
5. 遥测开关补丁
```

推论：

- `cordis.patch.yml` 是**活文档**：Settings 页写的行落在 profile 自己的 patch 里，
  两个 profile 天然隔离。
- 第 3、4 层优先级高于第 2 层，所以别用它们承载想在 Settings 页里改的行。
  启动器只叠一份 `profile/sandbox.patch.yml`（可写根），**不叠 web 的设置** ——
  继承靠快照（`setup` / 配置同步），隔离靠 profile 自己的 patch。
- `cordis.yml` 是空数组占位，每次启动被重写 —— 配置一律写 `cordis.patch.yml`。

### 9.2 bundle

`package.json` 的 `dsh.bundle.patch` 指向两份补丁：

- `cordis.patch.yml`：插入工作台本体、打开宿主 HMR、加一档权限预设；
- `preset/diy.patch.yml`：DIY 模式的 preset（从 dsh 出厂那份派生）。

模块包也有自己的 `cordis.patch.yml`，装进 profile 时由 dsh 组合器读。

### 9.3 左栏：官方或工作台

`sidebar` 是 `single` 槽，子座位是**独占 claim**，运行时只给声明了 children 的 entry 发
`renderSlot`。所以两套左栏不能同时在场，只能按**组合层**二选一：

- 默认官方左栏（bundle 层不摘 `ui-sidebar`）。
- 选“自定义”时，往 profile 用户层写 `- id: ui-sidebar` + `disabled: true`，
  dsh-hmr 重组后刷新页面生效（不重启进程）。

`priority` 遮蔽在左栏上行不通，因为子座位的声明是独占的；右栏能遮蔽，是因为工作台的
`Rightbar` 一个子座位都不声明（叶子型 vs 容器型）。

### 9.4 右栏接管

工作台注册 `rightbar`（`priority: -1`）遮蔽出厂的 `RightbarRoot`。
面板列是工作台的核心形状，必须自己画；右栏是叶子槽，不声明 children，
所以可以安全接管。

### 9.5 版本下限

`engines.dsh` 声明验过的 dsh 下限。DIY preset 是照那一代 dsh 派生的：
dsh 太旧时 preset 挂不起来，而 dsh 的模式选择器**只列挂得起来的** ⇒ 用户面前
“DIY 模式”整个不见，一句错都不报。所以下限由 engines 在**装的时候**拒绝。

## 10. 构建与热更新

两个运行时都用 **Vite**（测试也用它）：

| 目标 | 入口 | 产物 | external |
|---|---|---|---|
| 宿主 | `src/app/host.ts` | `dist/host/index.js`（单文件 ESM） | node 内置 |
| 浏览器 | `src/app/client.tsx` | `dist/client/client.body.js` → 套壳成 `client.js` | react / dsh UI 原语 |

- **为什么必须打包**：宿主侧 dsh 按包名加载 `exports['.']`，Node 的 ESM 解析器不认
  `@/*` 与无扩展名导入；浏览器侧一个包只能有一个入口，dsh 的包只能标成 external
  （由模块表提供），不能打进包。
- **样式**：CSS 用 `?raw` 当文本导入，再由 `client.tsx` 注入 `<style>`；
  组件样式走 `*.module.css`，构建时由 `moduleShell()` 插件把占位串换成 CSS 资产。
- **发货的类契约**：`dist/board.css` 随包出货，模块只许借其中声明的 `wb-*` 类。
- **发布构建**：`WB_RELEASE=1` 把 `@/dev/surface` 换成空实现，夹具整棵不进产物；
  `WB_STAGE_DIR` 把产物建到临时根，`check:release-artifacts` 扫它。
- **热更新**：浏览器靠 `dsh-client-hmr` 的 stat-poll + SSE；宿主靠 `dsh-hmr` 的模块监听。
  `src/**` 改完约一秒生效，不用重启、不用刷新。

宿主监听的根由启动器通过 `DSH_WORKBENCH_ROOT`（外壳）与 `DSH_WORKBENCH_HOME`（DIY 工坊）
给出（出厂默认 `root: []`），并 `followSymlinks: false` —— 否则 chokidar 会跟着 profile 里的
软链走进 `node_modules`，fd 用光后监听器静默死掉，症状是“改了没反应，也不报错”。

改 `vite.config.ts`、或**包内** bundle 补丁（`packages/workbench/cordis.patch.yml`）才需要重启；
profile 的 `cordis.patch.yml` 与 `dsh.profile.bundles` 在监听里，`dsh-hmr` 会重组
（报 `restartReason` 时才按提示重启）。

## 11. 门禁

**门禁只有一份，两个入口跑的是同一条链。** 包内 `pnpm run check` 就是 `pnpm -w run check`，
也就是仓库根那条：

| 命令 | 判什么 |
|---|---|
| `lint:commit` | HEAD 的提交信息过 commitlint（Conventional Commits） |
| `build` | 各包产物与类型面；`module-hello` 从 `@dsh-workbench/core/client` 取 kit，而那是构建产物，所以建在 `typecheck` 之前 |
| `typecheck` | 类型；`strict`，不开 `any` 逃生舱 |
| `lint` | ESLint（含 react-hooks）；缓存放 `node_modules/.cache` |
| `coverage` | 每包的测试与覆盖率；关键目录必须在报告里，基线只升不降 |
| `arch` | 架构红线：层序 / 目录契约 / 唯一出处 / 令牌 / 反退化 |
| `check:docs` | 文档管理块与 `arch.config.mjs` 是否一致（漂移即失败） |
| `check:runtimes` | 两个运行时的相互隔离 |
| `selfcheck` | 代码接线（槽位名、key、id、locale）——语法检查抓不到的那类错 |
| `check:modules` | 十三条模块判据，一次进程跑完 |
| `check:release-artifacts` | 发布产物里零夹具；链路最尾（它要读 `src/`） |

- **同一条链不许并发跑**：`check:standalone` 会把 `src/` 整目录改名再改回来，
  `coverage` 会把 `packages/workbench/coverage/` 删了重写 —— 两个进程同时跑会撞出
  与你改动无关的红。多人 / 多 agent 同时改时，把“跑门禁”串起来，或各开 worktree。
- 报告“门禁绿”时要说清那次绿是不是在**冻结的树**上拿到的（跑前 / 跑后各记一次
  `git status --short`）。
- `pnpm release` 的闸也是这条链；发版脚本另跑一次 `check:release-artifacts --shipped`，
  扫真正会出货的那批文件。
- `./scripts/verify.sh` **不在**这条链里：它是外部证据（web 是否被动过、组合树差异、
  数据是否分家、隔离行），要 GUI / agent 才能验的那两条见 [`packages/workbench/README.md`](packages/workbench/README.md)。

### 11.1 十三条模块判据

| 判据 | 判什么 |
|---|---|
| `protocol` | `dsh.workbench` 的形状、版本、生字段 |
| `contracts` | 契约：清单与代码注册的工具对账、面文件、peer、`design.json` |
| `bundles` | 产物边界：宿主 / 浏览器两半的 import 不越界 |
| `source` | 源码边界：模块源码零注释；不吃平台包、不伸进外壳 `app/`、不跨模块 |
| `cards` | 卡片渲染：空 / 载入 / 错 / 刷新 / 能力闸 / 文案键 |
| `standalone` | 独立构建：把外壳源码藏起来再构建一次 |
| `alias` | 模块不指外壳（`@/` 只指向自己） |
| `arch` | 模块自己那份 `arch.config.mjs` 的分层与设计系统 |
| `lint` | 模块自己那份 ESLint（残留日志、`as any`、手搓外观） |
| `style` | 样式归属：不自带 `wb-*` 覆盖、类名契约 |
| `markers` | 公开包里没有内部标识（内网源、内网域名、企业内部名） |
| `primitives` | dsh 原语只从模块表拿，不复制进包 |
| `kit` | 外壳 `kit` 面：模块只能从 kit 拿 hooks / 容器组件 / 读缝 |

没有那份配置的模块判“不适用”，不是红。单跑某一条用
`dsh-wb-module check --only <name>`。

### 11.2 selfcheck

`packages/workbench/scripts/selfcheck/` 按域拆开：`host` / `client` / `kit-face` /
`slots` / `css-hygiene` / `card-reporting` / `wiring` / `shell-artifacts` /
`shell-scripts` / `rightbar-wire` / `workshop` / `workshop-wiring` / `diy-entry` /
`diy-tools` / `gate-chain` / `platform`。一条判据 = 一个 `{ title, run(ctx, report) }`；
加一条只动一个域文件，排障时按域定位。

### 11.3 文档管理块

本文件的 `roles` / `structure` / `exceptions` 三块由 `arch-guard --render-docs`
从 `arch.config.mjs` 逐字渲染；`check:docs` 只校验漂移。
表里的 glob 是**相对外壳包**（`packages/workbench/`）的路径，不是仓库根。
`exceptions` 是规则级例外的台账，见文末附录。

## 12. 扩展位

| 想加什么 | 改哪 |
|---|---|
| 一个业务模块（缺陷 / 构建 / 状态…） | **不要改外壳**：`npx @dsh-workbench/module-tools init my-thing`，在独立包里写 `src/host.ts` + `src/client.tsx`，`dsh-wb-module build/check`，装进 profile |
| 一个 agent 工具 | 单元的 `mount()` 里 `registerTools()`；参数写 JSON Schema；会写的在清单里 `writes: true` |
| 一张卡片 / 一个子页 | 浏览器面的 `card` / `steps`；文案进 `messages`（zh / en 同构） |
| 一个外壳自己的域（会话、面板配置这类基础设施） | `packages/workbench/src/modules/<域>/{index.ts, model/}`（需要浏览器面时再加 `client.ts`），在 `arch.config.mjs` 的层序表里登记 |
| 一个宿主数据源 | `packages/workbench/src/shared/api/host/**`，或单元自己的 `model/**`；产出的服务交给单元 |
| 一个通用 UI 控件 | `packages/shared/src/components/**`（哑组件，文案与回调由使用者传）或外壳 `shared/components/**`；样式跟组件走 |
| 一个设计令牌 | `shared/styles/tokens/scale.css`（长度 / 字号 / 圆角 / 时长）或 `palette.css`（dsh 没有的静态值，`--wb-static-*`） |
| 一句界面文案 | `packages/shared/src/i18n/{zh,en}.ts`（外壳）或单元的 `messages`（模块）；两语言必须同构 |
| 面板列的外观 / 导航 | `packages/workbench/src/app/layouts/rightbar/**` |
| 左栏的外观 | `packages/workbench/src/app/layouts/sidebar/**` |
| 协议本身 | `packages/shared/src/host/unit-declaration.ts` + `module-tools/src/checks/protocol.mjs` + 本文 |

**别做的事**：模块 import 外壳源码、模块之间互相 import、在外壳里写死模块 id 或平台知识、
在面板里写业务状态。这些都有判据拦。

## 13. 客户端纪律

这几条是实测踩出来的，加组件、加服务时最容易再犯：

1. **单元的公开面按运行时分开。** `host.ts` 是宿主面，`client.tsx` 是浏览器面。
   混在一起时，宿主入口 import 这个单元会把 React 与 DOM 拖进宿主包。
2. **跨组件的共享状态放模块作用域。** 槽位条目的 inject 闭包只在注册时捕获一次，
   热更新会重新执行 `apply`；状态建在 `apply` 里会让先注册的组件一直读旧实例。
3. **数据一律实时，不加缓存。** 允许的只有合并并发；TTL 会给用户看旧值。
4. **dsh 有的组件直接用，不手搓。** 经模块表取 `Button` / `Modal` / `Switch` / `StateDot` /
   图标；构建时标 external。`packages/shared/src/components/` 里那几个哑组件仍手搓，
   因为它们的产物同时被外壳与模块消费，换它们要连模块打包的 externals 一起动。
5. **界面按组件写，样式跟组件走。** 一段界面 = 一个组件；调用点只给数据与语义 prop，
   不写外观类名（布局槽例外）。组件样式写同目录的 `.module.css`。
6. **令牌用 `--dsw-*`。** 颜色、圆角、字号、间距引用 dsh 主题令牌，不写字面值。
   要正圆或胶囊时显式写 `corner-shape: round`。
7. **类名是全局的。** 模块自带样式用自己的前缀 + 自己的 `<style>`；不要复制外壳的 `wb-*`
   类名去覆盖，两份同名规则按注入顺序互相覆盖。
8. **夹具只在开发构建里。** 调用点只认 `@/dev/surface`；发布构建把它换成 stub，
   `check:release-artifacts` 扫产物里有没有夹具。
9. **全仓代码零注释。** `.ts` / `.tsx` / `.js` / `.mjs` / `.cjs` / `.css` 不留 `//`、块注释
   或实现里的解释；唯一例外是**公开入口的成员**（模块作者拿得到的 kit，以及
   `@dsh-workbench/shared` 的 `.` / `/host` / `/testing`）紧贴 `export` 的 JSDoc，
   以及 eslint / ts / vitest 等指令注释。判据按“公开入口可达的文件”算，内部工具文件不放行。
   `.css` 一格注释都不许。为什么写进 ADR / `CONTEXT.md`。

## 14. 踩过的坑

- **左栏不能“运行时遮蔽”，只能组合层二选一。** `sidebar` 的子座位是独占 claim，
  两个 entry 声明同一批座位后一个直接抛错；运行时只给声明了 children 的 entry 发
  `renderSlot`。默认官方；自定义要往 profile patch 写 `- id: ui-sidebar` + `disabled: true`，
  刷新页面生效。
- **右栏能“官方常驻 + 我方遮蔽”**，因为我们的 `Rightbar` 一个子座位都不声明。
  容器型（左栏）与叶子型（右栏）的代价不一样，别混为一谈。
- **已知缺口**：自定义左栏下 `ui-sidebar` 被禁用，它注册的 `shell.leading`
  （桌面端“重开侧边栏”那个控件）也一起消失；官方档没有这个缺口。
  浏览器里无影响，将来跑 Electron 桌面端要补一个 occupant。
- **`priority` 是“数值越小越渲染”，同优先级第二次注册抛错。**
- **`inject` 工厂的返回值平铺进 props，不是嵌套对象。** 写 `inject: () => ({ actions: {...} })`
  再读 `props.actions.X` 会拿到 `undefined`，报 `slot entry crashed`。
- **`slots.inject(name, cb)` 对未声明的槽是宽容的**（回调不跑，不报错）；
  但 `slots.register` 到未声明的槽**会抛**。
- **`/workbench/api` 不在 dsh 的 token 保护里。** 只靠 loopback 绑定，所以读口只有 GET、
  不放敏感操作；需要鉴权的能力走 Typert Remote。
- **`cordis.patch.yml` 的 `config` 是整体替换，不深合并。** 重述一行时要把字段写全。
- **改动前端要重建，但不必重启。** `pnpm run dev` 会重建产物；客户端靠 `dsh-client-hmr`、
  宿主靠 `dsh-hmr` 各自就地热换。
- **拿 Cordis 服务要“用的时候再取”。** 服务是动态出现的：`apply` 时刻 `ctx.get('x')`
  可能是 `undefined`，捕获一次就永远拿不到。要长期使用就传取值函数，别传值。
- **`inject` 给组件的 prop 名必须和组件签名对上。** 名字错了不会报错 —— 读到的都是
  `undefined`，于是条件渲染的组件永远显示。只能靠看界面发现。
- **发布图里不能有夹具。** 只要 `if (wbMock)` 进了产物，夹具的代码与内容就都在产物里；
  所以接缝是构建期别名，不是运行期开关。

## 15. 边界：不做什么

- **不拥有主题。** 颜色、圆角、字号来自 dsh 的 `--dsw-*`；`palette.css` 只放 dsh
  没有对应令牌的那几个静态值。
- **不用路由。** 面板的“页”是面包屑路径（`PanelStep`），不是 URL 路由。
- **不用组件库。** 浏览器侧直接用 dsh 的原语；哑组件住 `packages/shared`。
- **不用 i18next。** 文案走 dsh 的 `ctx.locale`；两语言同构由类型 + selfcheck 守。
- **不把业务模块放进外壳。** 外壳零业务模块；装哪个来哪个。
- **不在面板里写业务状态。** 写走 agent 工具或封装好的一跳；面板只读。
- **不新造项目实体。** 项目身份派生自 dsh 的 Workspace。

## 附录：架构门禁的规则级例外

> 下面这张表由 `packages/workbench/arch.config.mjs` **逐字渲染**（`--render-docs`），
> 所以表里的 glob 是**相对外壳包**（`packages/workbench/`）的路径。

<!-- arch-guard:begin exceptions -->
| 规则 | 路径 glob | 理由 | 到期 |
| --- | --- | --- | --- |
| `D04` | `src/shared/styles/**` | 主题令牌由 dsh 在运行时提供（--dsw-*，见 @deepseek-ai/dsh-client-ui-theme）。本仓**不拥有主题**：tokens/palette.css 只兜 dsh 没有对应令牌的那几个静态值（名字一律 --wb-static-*），凡是 --dsw-* 的**名字**都不在本仓定义 —— 所以这里的引用查不闭合是正常的、也是唯一一处例外。dsh 改名会由它的版本升级暴露，而不是由本仓的本地表兜住。 | — |
| `D04` | `**/*.module.css` | 同上：组件样式（ADR-0029 的 S4）写在自己的 `.module.css` 里，但颜色/圆角/字号/间距用的仍是 dsh 的运行时令牌（--dsw-*）—— 组件样式与全局样式表是同一个理由，只是落点从"声明过的样式目录"变成了"组件旁边"。 | — |
| `D18` | `src/app/layouts/rightbar/ModulesPage.module.css` | 拖拽幽灵的阴影就是 tokens/palette.css 里那条 --wb-static-shadow-ghost 的**唯一**用途 ——那份 palette 当初就是为了这个值（以及 darwin 标题栏叠加、mask 端点）才存在的：dsh 没有对应令牌，所以它不是"绕过语义令牌"，而是这个值本来就不语义。组件样式搬进 .module.css 后（ADR-0029 的 S4）这条豁免跟着搬一次。 | — |
| `D05` | `src/shared/styles/tokens/scale.css` | 令牌**定义**住在本包、而它的**消费者**在 S3 之后有一半住在 packages/shared（组件自带样式）。arch 只看一个包，于是 ResourceStates 在用的 --wb-dur-1-4 / --wb-len-13 / --wb-len-300 这些会被报成"没人用"（实测 5 条误报）。跨包的令牌账由 selfcheck 的两条判据按**整个 workspace** 算：「★ 令牌账（跨包）：引用的 --wb-* 都有定义」与「…定义的 --wb-* 都有人用」—— 视野比这条宽，所以这里豁免掉不会漏掉真死令牌。 | — |
| `H09` | `src/shared/hooks/use-fixture-pick.ts` | **开发者调试夹具的挑选机制**（只在开发构建里；选中哪一条 + "再点一次也重挂"的计数），**不含任何夹具数据** —— 场景表在各模块的 `fixtures.ts` / `*-mock.ts` 里。命名带 fixture 是因为它就是干这个的（本仓的词汇是"夹具"，改名成别的只会让读的人对不上号）；落点在 `shared/hooks`，只有当 URL 带 `wbMock=1` 时才真的接管选择，且不碰机器上的任何东西。这批文件只经 `@/dev/surface` 接缝被引用，发布构建（`WB_RELEASE=1` → `src/dev/surface.stub.ts`）把它们整棵排除 ⇒ **发布产物里没有它们**。 | — |
| `H09` | `src/app/layouts/rightbar/*-mock.ts` | **开发者调试夹具**（只在开发构建里有）：浮层两页、缺陷卡片的场景表、看板内容区的形状表、以及夹具总开关。它们按约定落在这几处、命名带 mock：只有当 URL 带 `wbMock=1`（老名字 `wbMarketMock=1` 也认）时才参与渲染，且夹具模式下**不装卸机器上的东西、不改真配置、不打真平台**。落点与开关写进 内部设计记录（M4 / M10 / M11 / M12 / M13）。这批文件只经 `@/dev/surface` 接缝被引用，发布构建（`WB_RELEASE=1` → `src/dev/surface.stub.ts`）把它们整棵排除 ⇒ **发布产物里没有它们**。 | — |
| `H09` | `src/app/layouts/rightbar/market-mock-types.ts` | **只有夹具的形状**（`MarketMock` / `MarketMockExpect`），**不含任何夹具数据、也不参与渲染**。单拎出来是因为三份场景表（总表 / 已装那一族的表 / 将来再加的表）与视图都要读它，放回任何一份里都会跟那一份形成依赖环（S08 实测）。命名跟着本仓词汇（"夹具" = mock）走。 | — |
| `H09` | `src/app/layouts/market/*-mock.ts` | **开发者调试夹具**（只在开发构建里有）：添加模块浮层的每一屏（预检拒因、装中可取消、脚本待批、要重启、非工作台模块…）。这些状态真机上要么要卸真东西、要么要等真网络才看得到。命名带 mock、与浮层同目录：只有当 URL 带 `wbMock=1` 时才出现，且 `stateOfMock` 把动作全换成空的 —— **不装卸机器上的东西**。夹具喂真函数断言（键在不在字典里、状态机自不自洽）写在同目录的 __tests__/add-module-mock.test.ts。这批文件只经 `@/dev/surface` 接缝被引用，发布构建（`WB_RELEASE=1` → `src/dev/surface.stub.ts`）把它们整棵排除 ⇒ **发布产物里没有它们**。 | — |
| `H09` | `src/app/layouts/env-gate/*-mock.ts` | **开发者调试夹具**（只在开发构建里有）：启动页（环境 gate）的状态快照。真机上这一屏一闪就没了（就绪即撤），安装态与失败态要真把 opencli 卸掉才看得到 —— 所以夹具把宿主给的快照**钉住**：不轮询、不放行。只有当 URL 带 `wbMock=1` 时才参与，且不碰机器上的任何东西。这批文件只经 `@/dev/surface` 接缝被引用，发布构建（`WB_RELEASE=1` → `src/dev/surface.stub.ts`）把它们整棵排除 ⇒ **发布产物里没有它们**。 | — |
| `H09` | `src/app/units/*-mock.tsx` | **开发者调试夹具的模板单元**（只在开发构建里有）：真花名册里没有带卡片的模块时（干净 profile 一个模块都没装），三张场景表拿它当模板 —— 市场 24 屏 / 看板 6 条 / 卡片 12 条才有得看；真装了模块就用真模块，所以夹具上显示的名字始终是你自己那套。它**不进注册表**（`units.manifests()` 永远只说真装了什么），只在 `?wbMock=1` 时被场景表取用，且不碰机器上的任何东西。落点与开关写进 内部设计记录（M16）。这批文件只经 `@/dev/surface` 接缝被引用，发布构建（`WB_RELEASE=1` → `src/dev/surface.stub.ts`）把它们整棵排除 ⇒ **发布产物里没有它们**。 | — |
| `S66` | `src/app/layouts/env-gate/gate-mock.ts` | **开发者调试夹具照抄 opencli 的报告原文**（只在开发构建里有；`doctor` 的输出）—— 里面那个 `Issues:` 是 CLI 自己的分节标题（"问题"的意思），不是我们的套件 id。特意照抄而不是改编：这份夹具要能回答"界面拿到真报告时是什么样"，把 CLI 的原文改写掉就白验了。这批文件只经 `@/dev/surface` 接缝被引用，发布构建（`WB_RELEASE=1` → `src/dev/surface.stub.ts`）把它们整棵排除 ⇒ **发布产物里没有它们**。 | — |
| `H09` | `src/shared/hooks/mock-mode.ts` | **开发者调试夹具**（只在开发构建里有）：浮层两页、缺陷卡片的场景表、看板内容区的形状表、以及夹具总开关。它们按约定落在这几处、命名带 mock：只有当 URL 带 `wbMock=1`（老名字 `wbMarketMock=1` 也认）时才参与渲染，且夹具模式下**不装卸机器上的东西、不改真配置、不打真平台**。落点与开关写进 内部设计记录（M4 / M10 / M11 / M12 / M13）。这批文件只经 `@/dev/surface` 接缝被引用，发布构建（`WB_RELEASE=1` → `src/dev/surface.stub.ts`）把它们整棵排除 ⇒ **发布产物里没有它们**。 | — |
<!-- arch-guard:end exceptions -->
