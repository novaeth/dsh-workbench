---
name: workbench-module-diy
description: 在工作台里把当前面板调明白，或者给它造一块新内容 —— 用在「这块板为什么空白 / 这张卡不对 / 它到底发了什么」「我想在面板上看到 X / 加一块卡」「让 agent 替我读或写某个东西」这类话上。用户只说需求，实现由 agent 自己做、自己验过。
---

# workbench-module-diy

| 触发 | 任务 | 前置 |
|---|---|---|
| 「这块板空白 / 这张卡不对 / 数据不对 / 它到底发了什么」 | 调：查现有面板 | `workbench_diy_panel` / `_status`；动屏要调试约定 |
| 「我想在面板上看到 X / 加一块卡」 | 造：新建模块 | 一个能放代码的包（没有就问用户） |

调交付"面板现在怎么样"的事实；造交付面板上能点开的一块内容。不交技术方案。

> **Desktop**：屏调试不可用（`debug_*`、`logs_*`、不带 `read` 的看/动都不会出现）；**站点探索用
> `read=<地址>`**，**录制 `_record_*` 照旧**，`_panel` / `_status` / build / install 照旧。
> 验收时别调 `_debug_start`；用 `read` 或录制取证。

## 流程

**0. 认路** —— 跑 `workbench_diy_status`，取 `工作区：<dir>`。

**调** —— 用 [REVIEW.md](REVIEW.md) 的四步取证。动屏前 `workbench_diy_debug_start`（`unit` 可省；Desktop 跳过）。
抓"点了之后发了什么"：`workbench_diy_record_prepare` → 用户操作 → `_record_read`；收工 `_debug_stop` / `_record_stop`。
不需要源码、工具链、工坊。

**造** —— 模块落 `<dir>`。那里没有能放代码的包（没 `package.json`，或有但没声明 workspace）时，问用户二选一：
在这里建 workspace，还是去工坊那个脚手架工作区。不改用户仓库结构。
从「造一个模块」进入的会话已在工坊里，`<dir>` 就是工坊。

1. **判域** —— [DESIGN.md](DESIGN.md) §0。输出一句结论 + 下一步。
2. **问三张表** —— 问法见 [STEPS.md](STEPS.md)；只问用户能决定的事，实现不问。ASCII 画面 + 三张表当场写进
   `design.json`（[DESIGN.md](DESIGN.md) §5）。
3. **定数据源** —— [DATASOURCE.md](DATASOURCE.md)：探明后落成一条**配方**（`design.json` 的 `key + recipe`
   → `dsh-wb-module sync` → `data.request`），配方盖不住的写 `custom: { why }`；写三态。
   写操作先读 [WRITES.md](WRITES.md) 四步 + 执行体；有写工具就把审批屏画进 ASCII（[DESIGN.md](DESIGN.md) §3 末节）。
4. **套模板** —— [BUILD.md](BUILD.md) §1–§2：`pnpm exec dsh-wb-module init <unit> --template diy`，
   先把 `design.json` 改成问出来的那份，再改数据源与渲染。init 后 `pnpm install`。不从零写。
   改渲染时文案按 [COPY.md](COPY.md)：先判读者（卡片给人 / 描述给 agent / 原始输出进 detail）。
5. **过门禁** —— `dsh-wb-module build` + `check` + `design check`；红了自己修（[REVIEW.md](REVIEW.md)），
   不把报错贴给用户。
6. **装、上板** —— `workbench_diy_install`（`unit=…`）。只装一次；之后 `dsh-wb-module build` 即可。
   状态不明问 `workbench_diy_status`（`unit=…`）；只缺上板用 `workbench_diy_show`。装不问审批。
7. **验收** —— 对着三张表在真卡片上走「打开哪 → 看什么 → 点什么 → 应该看到什么」。
   看 / 动屏前 `workbench_diy_debug_start`（否则整族拒；Desktop 跳过，改用 `read=` / 录制）；`_panel` / `_status` / `read=` 档不用。
   工具全表 [FAMILY.md](FAMILY.md)。走通才 `dsh-wb-module design accept`；走不通如实记"未验"。
   审批项标注「要你真用一次」，不打勾。结论只报：已装、在面板哪一格。
8. **发布** —— 只在用户说「帮我发布」之后：`workbench_diy_changelog`（`note=…`）记这一版 → `workbench_diy_publish`（`unit=…`）。
   不手改 `package.json`、不补标题/署名、不问出口：工具与审批屏已经处理；他明确点名安装包 / 公开 / git 才传 target。
   他说要换作者才传 `author="姓名 <邮箱>"`，别自己编一个；没写作者时审批屏显示推断的署名，他拒绝后再说。
   验收没过先 `design accept`；`needsUser` 照 `text` 转述。细节见 [WIRING.md](WIRING.md) §5。

## 索引

| 需要 | 读 |
|---|---|
| 判域、三张表、ASCII 规则 | [DESIGN.md](DESIGN.md) |
| 步骤与完成判据 | [STEPS.md](STEPS.md) |
| 探测数据源、固化读、错误码 | [DATASOURCE.md](DATASOURCE.md) |
| 写通道四步、回读、撤销 | [WRITES.md](WRITES.md) |
| 面板内容、状态矩阵、界面规则 | [PANEL.md](PANEL.md) |
| 选组件、表单、hooks | [KIT.md](KIT.md) |
| agent 能力、审批、长任务、外部供给 | [TOOLS.md](TOOLS.md) |
| 文案：三类读者、主句 / 原文、人 / agent / 开发 | [COPY.md](COPY.md) |
| DIY 工具族的参数与返回 | [FAMILY.md](FAMILY.md) |
| 面板何时刷新、事实名 | [LINKAGE.md](LINKAGE.md) |
| 落点、模板文件、命令、两个面 | [BUILD.md](BUILD.md) |
| 依赖、禁区、安装、热换、发布 | [WIRING.md](WIRING.md) |
| 门禁报错、卡片故障取证 | [REVIEW.md](REVIEW.md) |

## 查不到时

1. `dsh-wb-module check --only <判据>` 的报错原文。
2. kit / dsh 原语 / CSS 令牌：`workbench_diy_components`（DIY 会话；令牌给 `scope: 'tokens'`，现读现给）；
   工程域 `check --only kit` / `--only primitives`。
3. 模板：`node_modules/@dsh-workbench/module-tools/template-diy/` 与 `template/`。
4. 安装包的类型面：`node_modules/@dsh-workbench/core/dist/types/**`；本指引：`node_modules/@dsh-workbench/core/skills/workbench-module-diy/**`。

## 硬约束

- dsh 已有的从 `kit` 拿（`@dsh-workbench/core/client`）；不手搓 DOM + CSS，不直接 import dsh 的包。
- DIY 模块默认 `private: true`，不发任何源；用户确认后走 `workbench_diy_publish`。
- 源码零注释（`//`、块注释、`.css` 注释都不许）；说明写模块 `README.md` 或 spec。
