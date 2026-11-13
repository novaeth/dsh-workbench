---
name: workbench-module-diy
description: 在工作台里查清当前面板的问题，或为它新增一块内容；适用于「这块看板为什么空白 / 这张卡不对 / 它到底发了什么」「我想在面板上看到 X / 加一张卡」「让 agent 读取或写入某个东西」「这件事以后还要运行 / 每次都要 / 固化 workflow / 多步需要等待与重试」这类说法。用户只说明需求，实现与验证由 agent 自行完成。
---

# workbench-module-diy

| 触发 | 任务 | 前置 |
|---|---|---|
| 「这块板空白 / 这张卡不对 / 数据不对 / 它到底发了什么」 | 调：查现有面板 | `workbench_diy_panel` / `_status`；动屏要调试约定 |
| 「我想在面板上看到 X / 加一张卡」 | 创建：新建模块 | 一个能放代码的包（没有就问用户） |
| 「这件事以后还要运行 / 每次都要 / 固化 workflow / 多步需要等待与重试」 | **先分叉**：一次性直接执行；固化写一条 workflow | 先询问用户（[FLOW.md](FLOW.md) §1）；需要固化时再进入「创建」 |

> **先分叉**：面对多步、需要等待、需要重试、需要写平台的任务，先询问「只做一次，还是以后都按同样步骤运行」；只做一次就不建模块，需要固化时再按下面的「创建」流程处理。判断与问法见 [FLOW.md](FLOW.md) §1。

「查」交付的是「面板现在怎么样」这一事实；「创建」交付的是面板上可打开的一块内容。两者都不交付技术方案。

> **Desktop**：屏调试不可用（`debug_*`、`logs_*`、不带 `read` 的看/动都不会出现）；**站点探索用
> `read=<地址>`**，**录制 `_record_*` 照旧**，`_panel` / `_status` / build / install 照旧。
> 验收时别调 `_debug_start`；用 `read` 或录制取证。

## 流程

**0. 定位**：运行 `workbench_diy_status`，取得 `工作区：<dir>`。

**查**：按 [REVIEW.md](REVIEW.md) 的四步取证。动屏之前先调用 `workbench_diy_debug_start`（`unit` 可省略；Desktop 跳过）。
要抓「用户点击之后发了什么」，依次调用 `workbench_diy_record_prepare` → 用户操作 → `_record_read`；结束时调用 `_debug_stop` / `_record_stop`。
这一步不需要源码、工具链或工坊。

**先分叉**：用户描述的是多步、需要等待、需要重试、以后还要运行的任务时，先按 [FLOW.md](FLOW.md) §1 询问；只做一次就直接执行，需要固化时再进入「创建」。

**创建**：模块创建在 `<dir>` 下。如果那里没有能放代码的包（没有 `package.json`，或有但未声明 workspace），请让用户二选一：
在这里建立 workspace，还是使用工坊里的脚手架工作区。不要改动用户仓库结构。
从「创建模块」入口进入的会话已经在工坊里，此时 `<dir>` 就是工坊。

1. **判域** —— [DESIGN.md](DESIGN.md) §0。输出一句结论 + 下一步。
2. **确认三张表**：问法见 [STEPS.md](STEPS.md)。只询问用户能决定的事，实现细节不必问。ASCII 画面与三张表当场写入
   `design.json`（[DESIGN.md](DESIGN.md) §5）。
3. **确定数据源**：见 [DATASOURCE.md](DATASOURCE.md)。探明后写成一条**配方**（`design.json` 的 `key + recipe`
   → `dsh-wb-module sync` → `data.request`）；配方覆盖不了的写 `custom: { why }`，并写清三种状态。
   写操作先读 [WRITES.md](WRITES.md) 的四步与执行体；有写工具时，把审批屏画进 ASCII（[DESIGN.md](DESIGN.md) §3 末节）。
4. **套用模板**：见 [BUILD.md](BUILD.md) §1–§2。先执行 `pnpm exec dsh-wb-module init <unit> --template diy`，
   把 `design.json` 改成确认过的那份，再修改数据源与渲染。依赖由 setup 安装，通常无需再安装；
   确实需要时，请在**工作区根**运行 `pnpm install`（在会话沙箱里运行会报 EPERM：link 目标位于可写根之外）。不要从零编写。
   修改渲染时按 [COPY.md](COPY.md) 处理文案：先判断读者（卡片给人 / 描述给 agent / 原始输出进 detail）。
5. **通过门禁**：运行 `dsh-wb-module build`、`check` 与 `design check`；出现失败先自行修复（[REVIEW.md](REVIEW.md)），
   不要把报错原样抛给用户。
6. **安装并添加到看板**：调用 `workbench_diy_install`（`unit=…`）。只需安装一次；之后用 `dsh-wb-module build` 即可。
   状态不明确时询问 `workbench_diy_status`（`unit=…`）；只缺「添加到看板」这一步时调用 `workbench_diy_show`。安装不需要审批。
7. **验收**：对照三张表，在真卡片上依次走「打开哪 → 看什么 → 点什么 → 应该看到什么」。
   看屏或动屏之前先调用 `workbench_diy_debug_start`（否则整族工具都会被拒绝；Desktop 跳过，改用 `read=` 或录制）；`_panel` / `_status` / `read=` 这几档不需要。
   工具全表见 [FAMILY.md](FAMILY.md)。全部走通后才执行 `dsh-wb-module design accept`；走不通就如实记为「未验」。
   需要审批的项标注「要你真用一次」，不要打勾。结论只报告：是否已安装、在面板哪一格。
8. **发布**：只在用户说「帮我发布」之后调用 `workbench_diy_publish`（`unit=…`）。如果这一版还没有更新日志，就带上 `changelogNote`（一行一条），
   发布时一并写进 `CHANGELOG.md` 并随包发布，审批屏会展示将要写入的那一段。
   如果还没有市集标签，就自行挑选 1–2 个短词放进 `labels`（说明它的用途，例如「发布编排」「构建状态」）；已有标签则不必传。
   不要手动修改 `package.json`，不要补标题或署名，也不要询问发布出口：工具与审批屏已经处理；只有用户明确点名安装包 / 公开 / git 时才传 target。
   只有用户要求更换作者时才传 `author="姓名 <邮箱>"`，不要自行编造；没有写作者时，审批屏会显示推断的署名，用户拒绝后再处理。
   市场里一个包名归第一次发布的人所有：更换署名发布同名包会被拒绝；如果用户确实是接手的人，请让维护者先修改那一条的 `owner`。
   一个 unit 在同一个市场里只能有一个条目：更换包名时要把 unit 一起换掉，不要沿用旧的。
   验收未通过时先执行 `design accept`；收到 `needsUser` 时按 `text` 转述。细节见 [WIRING.md](WIRING.md) §5。

## 索引

| 需要 | 读 |
|---|---|
| 判域、三张表、ASCII 规则 | [DESIGN.md](DESIGN.md) |
| 一次性还是固化、workflow 怎么写 | [FLOW.md](FLOW.md) |
| 步骤与完成判据 | [STEPS.md](STEPS.md) |
| 探测数据源、固化读、错误码 | [DATASOURCE.md](DATASOURCE.md) |
| 写通道四步、回读、撤销 | [WRITES.md](WRITES.md) |
| 面板内容、状态矩阵、界面规则 | [PANEL.md](PANEL.md) |
| 选组件、表单、hooks | [KIT.md](KIT.md) |
| agent 能力、审批、长任务、外部供给 | [TOOLS.md](TOOLS.md) |
| 文案：三类读者、语域、界面句 / 技术细节、人 / agent / 开发 | [COPY.md](COPY.md) |
| DIY 工具族的参数与返回 | [FAMILY.md](FAMILY.md) |
| 面板何时刷新、事实名 | [LINKAGE.md](LINKAGE.md) |
| 落点、模板文件、命令、两个面 | [BUILD.md](BUILD.md) |
| 起子进程、写入域（执行缝门面） | [BUILD.md](BUILD.md) §5 |
| 依赖、禁区、安装、热换、发布 | [WIRING.md](WIRING.md) |
| 门禁报错、卡片故障取证 | [REVIEW.md](REVIEW.md) |

## 查不到时

1. `dsh-wb-module check --only <判据>` 的报错原文。
2. kit、dsh 原语与 CSS 令牌：调用 `workbench_diy_components`（DIY 会话中可用；令牌用 `scope: 'tokens'`，现读现返回）；
   工程域使用 `check --only kit` / `--only primitives`。
3. 模板：`node_modules/@dsh-workbench/module-tools/template-diy/`。
4. 安装包的类型面：`node_modules/@dsh-workbench/core/dist/types/**`；本指引：`node_modules/@dsh-workbench/core/skills/workbench-module-diy/**`。

## 硬约束

- dsh 已有的能力从 `kit` 获取（`@dsh-workbench/core/client`）；不要手写 DOM 与 CSS，也不要直接 import dsh 的包。
- DIY 模块默认 `private: true`，不发布到任何来源；用户确认后走 `workbench_diy_publish`。
- 源码零注释（`//`、块注释、`.css` 注释都不许）；用户说明写模块 `README.md`，作者说明写 `DEVELOPING.md` 或 spec。
