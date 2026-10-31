# 设计边界

先说结论：**每个改动先归到一个设计层；层与层之间只通过公开面 / 契约发生关系。**
代码、配置、测试、文档、错误文案都是层的附属物 —— 层定下来，它们放哪就定了，不需要再单独划文档边界。

## 0. 为什么要先定边界

同一句内容放错层，会同时坏三件事：依赖方向、门禁归属、读者预期。本仓踩过的例子：

- 工具链文档里写工坊目录、`pnpm install`、EPERM → 把环境层的事塞进工具层；
- 模块模板的 `AGENTS.md` 写安装与工作区布局 → 把环境层的事塞进模块层；
- 工坊 `README` 写判据实现 → 把工具层的事塞进环境层；
- 根 `README` 写 ADR 取舍 → 把决策层的事塞进产品层。

判定顺序永远是：**先选层，再选载体，最后才写字**。

## 1. 设计层

八层。上层依赖下层的能力，但依赖必须走公开面；同层可以互看，跨层只能过契约。

| 层 | 是什么 | 拥有的真相 | 公开面 / 契约 | 明确不拥有 |
|---|---|---|---|---|
| **L0 dsh 本体** | 平台：插件宿主、会话、工具调用、UI 原语、模块加载表 | dsh 的插件 API、工具机制、`@deepseek-ai/dsh-client-ui-primitives` | dsh 自己的插件与模块表 | 工作台的产品形态、模块、工坊 |
| **L1 外壳 core** | 工作台本体：两个运行时、workbench 域（项目 / 面板 / 记录 / 审批 / 市场 / DIY 入口）、内置域模块、`kit`、启动器、setup / seed | 工作台怎么运转、界面骨架、单元注册表、写通道与事实、长任务、审批管线 | `@dsh-workbench/core/client`（kit）、`@dsh-workbench/core/contract`（仅类型）、`bin/dsh-workbench` | 业务模块；契约定义（归 L2）；适配器实现（归 L3）；环境事实（归 L6） |
| **L2 契约 shared** | 协议与纯代码：类型、纯函数、i18n、哑组件、host 工厂 | 协议只有一份；浏览器 / 宿主两个入口的分界 | `@dsh-workbench/shared`、`/host`、`/testing` | 外壳运行时；适配器实现；业务逻辑 |
| **L3 适配器 AdapterSet** | 平台接缝的实现：opencli、浏览器读、DataReader、profile / 配置同步、供给 / registry、preflight / 自更新、市场 | 怎么跟外部系统说话 | `AdapterSet` / `RuntimeCapabilities` / `RuntimeProfile`，契约在 `shared/host` | 工作台域逻辑；模块；界面 |
| **L4 模块** | 业务单元：两个面 + `model` / `components` + 清单 + `design.json` + 文案 + 测试 | 这个业务的数据、卡片、工具、写路径、验收 | `dsh.workbench` 清单、`host.ts` / `client.tsx`、`UnitMountResult` 成员（routes / tools / prefs / actions / provision / context / longTasks / facts） | 外壳内部；别的模块；工具链实现；环境搭建 |
| **L5 工具链 module-tools** | 开发期契约与门禁：`init` / `build` / `check`（13 判据）/ `design` / `sync` / `migrate` / `lint` / `release` + 唯一模板 | 模块该长什么样、怎么算过、怎么发；工具自己的行为 | `dsh-wb-module` 命令、`@dsh-workbench/module-tools/arch` 与 `/lint` 方言、模板产物 | 运行时行为；模块业务；工作区 / 工坊环境；模块源码的归属 |
| **L6 环境 / 实例** | 部署与工作区：profile、`$DSH_WORKBENCH_HOME`、DIY 工坊目录、`adapterSet` 选择、配置同步、依赖安装 | 环境事实：目录布局、依赖装在哪、沙箱 / EPERM、怎么起实例 | 磁盘布局 + 由脚本生成的 `README.md` / `AGENTS.md` | 代码、判据、工具实现 |
| **L7 发布与市场** | 产物与分发：`npm pack` / team 源 / tarball / git、市场索引、安装 / 升级 / 回滚 | 包怎么发、索引怎么写、装哪份 | `release` 命令、索引格式、`CHANGELOG` | 运行时行为；开发期判据 |

另有两个**不算运行时层**、但必须归位的东西：

- **决策层**：ADR、spec、工单，住 `private-docs/`；公开构建不依赖，公开文档不链接进去。
- **仓库工作流**：根 `AGENTS.md`、`CONTRIBUTING.md`、`docs/agents/**`、`.agents/skills/**`；
  只讲在本仓怎么干活，不属于任何运行时层。

## 2. 跨层接缝

边界不是靠“别 import”一句话守住的，每个接缝都有明确载体：

| 接缝 | 两侧 | 通过什么 | 不许什么 |
|---|---|---|---|
| 平台 → 外壳 | L0 ↔ L1 | dsh 插件 API、模块表 require dsh 原语 | 改 dsh、fork dsh、宿主侧引 dsh 浏览器包 |
| 外壳 ↔ 契约 | L1 ↔ L2 | `core/contract` 类型、`shared` 两个入口、host 工厂 | 契约抄第二份、shared 依赖 core |
| 外壳 ↔ 适配器 | L1 ↔ L3 | `AdapterSet` 契约 + profile 里的 `adapterSet` 选择 | `core/src` 出现 adapter 包名；按 adapter id 分支界面 |
| 外壳 ↔ 模块 | L1 ↔ L4 | `dsh.workbench` 清单 + `mount()` 返回的成员；kit、contract、dsh 原语 | 模块 import 外壳内部；模块绕过写通道直写平台 |
| 模块 ↔ 模块 | L4 ↔ L4 | 外壳提供的连接面（事实 / 数据 / 写通道） | 模块之间互相 import |
| 工具链 ↔ 模块 | L5 ↔ L4 | 文件系统：`package.json`、清单、`design.json`、源码文本、产物 | 工具运行时被模块依赖（只做 devDependency）；工具读环境事实当模块事实 |
| 工具链 ↔ 环境 | L5 ↔ L6 | 只读 cwd / 工作区声明来发现包；环境文档解释怎么装 | 工具文档写安装 / 目录 / EPERM；环境文档写判据实现 |
| 浏览器 ↔ 宿主 | L1/L4 内部横切 | 公开入口：kit、`contract`、`shared` 根 / `/host` 拆分 | 两侧互引；浏览器从 `/host` 取运行值 |
| 发布 ↔ 运行时 | L7 ↔ L1/L4 | 已安装的包产物、清单、索引 | 运行时依赖发布脚本；发布脚本改运行时行为 |

## 3. 层的附属物

每一层自带文档、测试、配置、文案；它们跟着层走：

| 层 | 文档 | 测试 / 门禁 | 配置与文案 |
|---|---|---|---|
| L1 外壳 | `packages/core/README.md`、`ARCHITECTURE.md`、`packages/docs/**` 的使用文档、`CONTRIBUTING.md` 的门禁纪律 | core 单测、`arch`、`check:runtimes`、core selfcheck、`WB-A1` | `arch.config.mjs`；界面文案与 kit JSDoc |
| L2 契约 | `ARCHITECTURE.md` §5–§6、源码 JSDoc | `SH-A1`、`check-state`、typecheck | 入口 `exports`；i18n 字典 |
| L3 适配器 | `ADAPTERS.md`、各 adapter 包 README | `check:adapter-defaults`、`node scripts/check-adapter-contract.mjs`、集成夹具 | `AdapterSet` 版本；profile 解析规则 |
| L4 模块 | 模块 `README.md`（`design render` 生成需求段）、模板 `AGENTS.md`（只讲 tools 用法） | 13 条判据、`check:modules`、模块测试、smoke | `design.json`、清单、`messages.ts` |
| L5 工具链 | `packages/module-tools/README.md`（判据表由命令生成）、`template-diy/AGENTS.md` | module-tools selfcheck（128）、`check:docs` 的判据表校验 | 模板文件、`arch` / `lint` 方言 |
| L6 环境 | 工坊 `README.md` / `AGENTS.md`（`seed-workshop.sh` 生成）、core README 的 profile / 排障段 | `check-workshop-generation.sh`、seed 行为自检 | `.npmrc`、`pnpm-workspace.yaml`、profile 配置 |
| L7 发布 | `module-tools/README.md` 的发布段、`CHANGELOG.md` | `check:release-artifacts`、release / publish 自检 | 索引格式、`files` 清单 |

跨层的公共内容只有三处：`CONTEXT.md`（术语）、根 `README.md`（产品门面）、根 `AGENTS.md`
（在本仓干活的约定）。它们不替任何层写细节，只指过去。

## 4. 内容归属：从层推出来

不需要单独记“文档边界”，按层问四个问题就够：

1. **这段事实属于谁？** 是运行时行为（L1/L2/L3/L4）、开发期契约（L5）、环境（L6）、分发（L7），还是决策（ADR）？
2. **它在别的实例 / 别的工作区还成立吗？** 不成立 → L6（环境文档），例如依赖装在哪、EPERM、工坊目录。
3. **它是契约还是实现？** 契约以源码 / 类型为准（L2、`core/contract`），文档只指过去，不复述字段表。
4. **有生成机制吗？** 有 → 改生成源：`design render`、`check --list --markdown`、`arch-guard --render-docs`、
   `seed-workshop.sh`、`sync`、`build`。

由此得到的硬规则：

- **L5 不写 L6**：module-tools 里不出现工坊、工作区根、安装、EPERM、setup；模板 `AGENTS.md` 只写 tools；
- **L4 不写 L6**：模块模板文档不解释依赖装哪、沙箱怎么绕；
- **L6 不写 L5**：工坊 `README` / `AGENTS` 只讲环境事实，不写判据实现；
- **L1 不写 L3 细节**：外壳不出现 adapter 包名，界面按 capability 不按 adapter id；
- **L3 不写 L4**：适配器不 import 模块、不承载业务；
- **L7 不回写运行时**：发布脚本不改运行行为；
- **文档不复述环境**：`package.json` scripts、`--help`、导出类型能查到的，不复述。

## 5. 改动落哪：决策流程

```text
改什么？
├─ 运行时行为 / 界面 / 内置域 / kit / 协议消费   → L1 core
├─ 协议、纯逻辑、i18n、哑组件                   → L2 shared
├─ 跟外部系统说话（CLI / 浏览器 / profile / 供给）→ L3 adapter
├─ 一个业务的两面、卡片、工具、写路径、验收      → L4 模块
├─ 建骨架 / 判据 / 模板 / 设计底稿 / 发布工具    → L5 module-tools
├─ 安装、profile、工坊目录、依赖、配置落盘       → L6 环境（脚本 + 生成的 README/AGENTS）
├─ 打包、索引、安装 / 升级 / 回滚                → L7 release / market
└─ 为什么这样选 / 将来怎么改                     → 私有 ADR（不写进公开层）
```

新增内容时再问一句：**这层不在（或换一份实现）时，这句话还成立吗？** 不成立，就说明它属于那层。

## 6. 守卫：边界由门禁钉住

| 层 | 谁在守 |
|---|---|
| L1 | `arch`（S69 不出现 adapter 包名、S72 按能力不按 id）、`check:runtimes`、`WB-A1`、core selfcheck |
| L2 | `SH-A1`（shared 不依赖 core / adapter）、shared `check-state`、typecheck |
| L3 | `check:adapter-defaults`、`node scripts/check-adapter-contract.mjs`、集成夹具 |
| L4 | module-tools 13 判据（contracts / source / arch / kit / cards / style / primitives / standalone …）；模块 arch 的 S01 / S16 / S23 / S71–S74（S74：测试住 `__tests__/`）；`check:modules` |
| L5 | module-tools selfcheck（128 条：golden / scaffold / arch-gate / lint-gate / discover / migrate / meta …）、`check:docs` 的判据表一致性 |
| L6 | `check-workshop-generation.sh`、seed / 入口自检、工坊生成探针 |
| L7 | `check:release-artifacts`、release / publish 自检 |
| 全部 | `pnpm -w run check` 一条链；文档链接与管理块由 `check:docs` 管；公开仓标记由 `check:markers` 管 |

改到边界附近时跑对应的自检：`pnpm run check:module-tools`（模板 / 工具）、`pnpm run check:docs`、
`pnpm run check:modules`；涉及环境脚本时跑 `packages/core/scripts/check-workshop-generation.sh`。

## 7. 已知边界模糊处

- **模块作者指引归 L1 还是 L4？** 内容主体是 L4 的方法，但由 core 随壳出货（`packages/core/skills/`）。
  规则：讲 L4 怎么做，可以引用 L1 的 kit 与 L5 的命令，不写 L1 / L5 的实现细节。
- **模板文档归 L4 还是 L5？** 生成物属于 L4（模块自己的 README / AGENTS），生成机制属于 L5。
  所以模板文档只写 L4 行为 + L5 用法，永不写 L6。
- **工坊文档由谁生成？** 由 L1 的 setup 脚本写 L6 的文档：`seed-workshop.sh` 生成工坊
  `README.md` / `AGENTS.md`；内容归 L6，实现归 L1。
- **module-tools README 讲模块发现？** 讲的是 L5 自己的行为（怎么找包、`--cwd` / `DSH_WB_ROOT` /
  `--package`），不是 L6 的搭建指导。
- **模板里的“按工作区存 limit”**：指工作台项目（L4 数据语义），不是 pnpm 工作区。
- **`module-hello` 是 L4 样本**，不是模板来源；改样板不等于改模板（模板唯一在 L5）。
- **面板模块 vs 可安装模块**：`packages/core/src/modules/**` 是 L1 的内置域模块；可安装的业务模块才是 L4。
