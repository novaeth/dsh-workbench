# 内容边界

一句话：**每份内容只回答它那类读者的问题。环境的事实归环境文档，工具的事实归工具文档，
契约的事实归契约源码；其余地方只放指针，不复述。**

这份文档管“什么内容该写在哪个载体”，不管具体某个功能怎么实现。实现看
[ARCHITECTURE.md](ARCHITECTURE.md)；装与用看 [README.md](README.md) 与
[packages/docs](packages/docs/README.md)。

## 1. 四类读者

先认读者，再决定写哪：

| 读者 | 典型问题 | 去哪 |
|---|---|---|
| 终端用户 | 怎么装、怎么用、数据在哪、怎么升级 | 根 `README.md`、文档站 `packages/docs/site/**` |
| 模块作者（人或 agent） | 怎么造一块模块、怎么过判据、怎么发 | `packages/core/skills/workbench-module-diy/`、`packages/module-tools/README.md` |
| 在本仓干活的 agent | 仓库结构、硬约束、门禁、文档路由 | 根 `AGENTS.md`、`docs/agents/**`、`.agents/skills/**` |
| 维护者 / 新同事 | 架构为什么这样、扩展点、ADR | `ARCHITECTURE.md`、`CONTEXT.md`、`private-docs/**` |

## 2. 文档载体地图

| 载体 | 读者 | 回答什么 | 不写什么 | 真相源 / 生成方式 |
|---|---|---|---|---|
| `README.md` | 终端用户、评估者 | 产品是什么、三种装法、30 秒开始、数据与设置、升级卸载 | 架构、实现细节、模块作者细节、ADR | 人写 |
| `packages/docs/site/**` | 终端用户 | 安装、快速开始、数据、模块、架构科普、FAQ、更新日志 | 仓库开发流程、门禁、内部设计 | 人写；私有包，不出货 |
| `ARCHITECTURE.md` | 维护者、新同事 | 包图、两个运行时、单元协议、数据与写、kit、工具链、门禁、扩展点 | 使用教程、ADR 的理由 | 人写；roles / 判据表等管理块由脚本生成 |
| `CONTEXT.md` | 所有人 | 本项目自己的词（工作台、面板、模块、适配器、市场…） | 通用编程概念、实现细节 | 人写 |
| `CONTRIBUTING.md` | 贡献者 | 环境、测试、PR、门禁纪律、文档站流程 | 产品用法、架构取舍 | 人写 |
| `ADAPTERS.md` | 适配器实现者、维护者 | `AdapterSet` 契约、默认实现、第三方 set、加载与回退 | 模块作者指引、外壳域细节 | 人写；契约以 `packages/shared/src/host` 源码为准 |
| `AGENTS.md`（根） | 在本仓干活的 agent | 仓库结构、三条命令、六条硬约束、文档路由 | 产品教程、包内细节 | 人写 |
| `docs/agents/**` | agent | issue tracker、triage、领域文档的工作流 | 产品架构 | 人写 |
| `packages/*/README.md` | 该包的使用者与维护者 | 这个包是什么、怎么用、边界在哪、怎么开发 | 别的包、全仓架构 | 各包维护者写 |
| `packages/core/skills/workbench-module-diy/` | 模块作者（agent） | 从需求到上板的方法：设计底稿、数据源、工具、面板、写、联动、流程、验收、判据怎么读 | 工具实现细节、工坊环境事实 | 人写；随 `@dsh-workbench/core` 出货 |
| `packages/module-tools/README.md` | 模块作者、工具维护者 | 六条命令、十三条判据、唯一模板、模块发现规则、发布契约 | 工坊环境（目录 / 依赖 / 安装 / EPERM）、宿主与模块实现 | 人写；判据表管理块由 `check --list --markdown` 生成 |
| `packages/module-tools/template-diy/README.md` | 生成的模块的使用者 | 这个模块的行为、数据源、三张表 | 工坊环境、工具链内部 | 模板；`design render` 负责生成“需求与验收”段 |
| `packages/module-tools/template-diy/AGENTS.md` | 在生成模块里干活的 agent | 工具链怎么用：`build → check → test` 循环、`check --only`、`selfcheck` 组成、`sync` / `declared-tools`、`release` | 依赖安装、工作区布局、沙箱 / EPERM | 模板；**只写 tools 自己的事实** |
| 工坊 `$DSH_WORKBENCH_HOME/diy/README.md` | 工坊用户、agent | 工坊是什么、模块住 `packages/`、命令入口、目录不许手改 | 工具内部判据实现 | `packages/core/scripts/seed-workshop.sh` 生成（缺才建，不覆盖） |
| 工坊 `$DSH_WORKBENCH_HOME/diy/AGENTS.md` | 在工坊里干活的 agent | 依赖已装 / 缺了怎么装、EPERM、工坊根、模块在 `packages/` | 工具命令细节、模块实现 | `packages/core/scripts/seed-workshop.sh` 生成 |
| `.agents/skills/**` | agent | 通用工程 / 写作方法（writing、wording、review、triage…） | 本项目领域知识 | 人写；第三方来源见 `skills-lock.json` 与 `THIRD-PARTY-NOTICES.md` |
| `private-docs/**` | 维护者 | ADR、目标 spec、门禁契约、工单 | 任何不能进公开仓的内部信息 | 私有仓；公开构建与门禁不依赖 |

## 3. 代码的内容边界

| 包 | 装什么 | 不装什么 |
|---|---|---|
| `packages/core` | 外壳（宿主 + 浏览器两个运行时）、workbench 域与面板、`kit`、setup / seed 脚本、模块作者 skills | 模块业务；`shared` 已有的纯逻辑与契约；适配器实现 |
| `packages/shared` | 协议与契约类型、纯函数、i18n、哑组件、host 工厂 | 外壳运行时；任何 `@dsh-workbench/core` 依赖 |
| `packages/adapter-*`、`packages/adapters-default` | `AdapterSet` 的默认实现（runtime / supply / profile / probe） | 模块业务；不把领域逻辑渗回外壳 |
| `packages/module-tools` | 工具链（build / check / design / migrate / sync / release）、唯一模板、自检 | 不 import 外壳源码（只检查目标工程里装的外壳）；不写工坊 / 环境事实 |
| `packages/module-hello` | 最小可安装模块样板 | 模板来源（唯一模板是 `module-tools/template-diy`） |
| 工坊里的模块（`packages/module-*`） | 业务模块的两个面与内部实现 | 不直接碰外壳 `src/**`；协议只从 `@dsh-workbench/core/contract` 取类型 |

运行期还有两条硬边界，写在 [ARCHITECTURE.md](ARCHITECTURE.md) §2–§3：

- 宿主面（`host.ts` / `host/**`）与浏览器面（`client.tsx` / `components/**`）不互引；
- 浏览器侧从 `@dsh-workbench/shared` 根入口取；宿主侧运行值只从 `@dsh-workbench/shared/host` 取。
  错误消息、工具描述、卡片文案跟着**说给谁听**走：给人看的进 `messages.ts`，给 agent 看的进工具定义。

## 4. 生成物与手写段

边界同样适用于“生成 vs 手写”：

| 产物 | 谁生成 | 手写规则 |
|---|---|---|
| `template-diy/README.md` 的“需求与验收”段 | `design render` | 只改 `design.json`，不改生成段；段外手写 |
| `module-tools/README.md` 的判据表 | `check --list --markdown` | 改 `CHECKS`，再重新生成 |
| `ARCHITECTURE.md` 的 roles / 门禁管理块 | `arch-guard --render-docs` / target 脚本 | 改配置，不手改块 |
| 工坊 `README.md` / `AGENTS.md` | `seed-workshop.sh` | 缺文件才建；要改口径改脚本 |
| 模块 `src/declared-tools.ts` | `dsh-wb-module sync` | 代码只引 `DECLARED_TOOLS`，不写字面量 |
| 模块 `client.js` / `dist/**` | `dsh-wb-module build` | 改 `src/**`，产物保持 build 的输出 |

## 5. 判定规则

写一句话之前按顺序问：

1. **读者是谁？** 答不上来就先归到最近的载体，别新建文档。
2. **这句话在别的工作区 / 别的宿主环境还成立吗？** 不成立 → 环境文档（工坊 `README` / `AGENTS`，
   由 `seed-workshop.sh` 生成），例如依赖安装、EPERM、模块住哪。
3. **是工具的行为还是环境的搭建？** 工具行为（命令、判据、发现规则、产物契约）→ `module-tools`；
   环境事实 → 环境文档。
4. **是契约还是实现？** 契约以源码为准（`shared/host`、`core/contract`）；文档只指过去，不复述字段表。
5. **环境已经提供的事实？**（`package.json` scripts、`--help`、导出的类型）→ 不复述，指过去；
   写“非显然”的：约定、理由、坑。
6. **有生成机制吗？** → 改生成源，不改产物。

反例（本仓实际踩过）：在 `module-tools` 里写工坊目录 / `pnpm install` / EPERM；在模块模板
`AGENTS.md` 里写依赖安装；在工坊 `README` 里写判据实现；在根 `README` 里写 ADR。

## 6. 自动化守卫

内容边界不是靠自觉，能钉的都钉了：

- `pnpm -w run check`：`lint:commit → build → typecheck → lint → coverage → check:gates:target
  → arch → check:docs → check:runtimes → selfcheck → check:modules → check:adapter-defaults
  → check-adapter-contract → check:release-artifacts`；
- `check:docs`：`module-tools/README.md` 判据表与 `CHECKS` 一致、`ARCHITECTURE.md` 管理块存在、
  相对链接可解析；文档站修不出来也算红（在 `build` 里）；
- `check:markers`：公开仓内容里不出现内部主机 / 私有源 / 个人绝对路径（组织词表由
  `DSH_WB_INTERNAL_MARKERS` 配在 CI）；
- `module-tools` selfcheck：模板结构、README 必备段、init 产物、scaffold 行为等；
- 手工边界检查（改到这些地方时跑）：
  - `grep -rni "工坊\|workshop" packages/module-tools` → 0；
  - `packages/module-tools` 的文档 / 输出不出现 `pnpm install`、`setup`、`EPERM`、工作区根
    （`src/build.mjs` 里的 esbuild `setup` 回调是代码 API，不算）；
  - 新 / 改文档后跑 `pnpm run check:docs`，模板改后跑 `pnpm run check:module-tools`。

## 7. 已知例外（已约定，不算越界）

- `module-tools/README.md` 讲“怎么发现模块、`--cwd` 不缩范围、`DSH_WB_ROOT`、`--package`”——
  这是工具自己的行为，不是环境搭建指导；
- 模板 `README.md` 里的“按工作区存 limit”“没有选中工作区”——指工作台项目（数据语义），
  不是 pnpm workspace；
- `packages/core/skills/` 里出现“工坊”——模块作者的真实工作场景，属产品 / 环境指引；
- 根 `AGENTS.md` 的硬约束、`docs/agents/**`、`.agents/skills/**` 都面向 agent，但前者是**本仓**
  工作流与约束，后者是**通用**方法；
- `packages/module-hello` 是模块样板与最小样本，不是模板来源；改样板不等于改模板。

## 8. 新增内容放哪

| 想写 | 放 |
|---|---|
| 产品怎么用、FAQ、更新日志 | `packages/docs/site/**`，必要时根 `README.md` 补一句入口 |
| 仓库架构、协议、扩展点 | `ARCHITECTURE.md` |
| 某个包的用法与边界 | 该包 `README.md` |
| 模块作者的方法与口径 | `packages/core/skills/workbench-module-diy/` |
| 工具命令、判据、模板契约 | `packages/module-tools/README.md` |
| 工具链在模块里怎么用 | `template-diy/AGENTS.md` |
| 工坊目录、依赖、装法、EPERM | 工坊 `README.md` / `AGENTS.md`（改 `seed-workshop.sh`） |
| agent 在本仓怎么干活 | 根 `AGENTS.md`、`docs/agents/**` |
| 通用写作 / 工程方法 | `.agents/skills/**` |
| 术语 | `CONTEXT.md` |
| 为什么这样选的、将来怎么改 | `private-docs/docs/adr/`（私有仓） |
