# 设计：定需求、出三张表、落 design.json

工程域与 DIY 域共用。验收归谁见 §4。

## 0 判域

判据：**要不要新凭据**，不是要不要接新平台。

| 需求 | 域 | 动作 |
|---|---|---|
| 只读卡；数据来自 HTTP GET / 命令 / 本地文件 | DIY | 造（[BUILD.md](BUILD.md)） |
| 卡片要能配置（环境、仓库） | DIY | 配置清单（[PANEL.md](PANEL.md) §5） |
| agent 做一两件只读的事 | DIY | 能力清单（[TOOLS.md](TOOLS.md)） |
| agent 写平台（提交、发布、改配置） | DIY | 预览 + 确认两拍（[TOOLS.md](TOOLS.md) §5–§7） |
| 用户已在浏览器登录过该系统，只是不知道数据在哪 | DIY | 复用登录探（[DATASOURCE.md](DATASOURCE.md)） |
| 要**新凭据**（账号 / 密钥 / token） | 工程 | 停；说清谁配什么 |
| 多步长流程（要等、中途要人、失败要续） | 工程 | 同上 |
| 新服务 / 新进程 / 新依赖 | 工程 | 同上 |
| 改工作台外壳，或改已发布模块 | 工程 | 同上 |

输出：一句结论 + 下一步 + 预计发生什么。

## 1 分工

| 谁 | 决定 |
|---|---|
| 用户 | 看到什么、能配什么、agent 替做什么、哪些要点头、措辞、取舍 |
| agent | 实现与验收：怎么落、命名、位置、选型、怎么验。**不问用户** |

对话规则：

- 每个问题给推荐答案，用户可一字通过；不确定就按推荐走并标注。
- 必答的决定翻译成"你会看到什么"再问，不问 A/B 选型。
- 每步给用户一个可看的东西：表、ASCII、可点界面。不贴代码、不讲实现。
- 开工列待办：问 → 三张表 → 做 → 验收。

## 2 三张表

| 步 | 问 | 产出 | 行 × 列 |
|---|---|---|---|
| 1 面板 | 看到什么？能配什么？ | 展示清单 + 配置清单 + 状态矩阵 + 图例 | 每种状态（含每种缺失）×「看到什么 / 能做什么 / agent 能接着做什么」 |
| 2 agent | agent 替做什么？哪些要点头？ | 能力清单 + 全场景 + 点头场景 | 每件事 × 每种情况：agent 得到什么 / 用户看到什么 |
| 3 联动 | 凭什么相信面板是新的？ | 联动场景 | 每种"谁在动" ×「何时变 / 哪一格变 / 看到什么」 |

三张表同时是验收单：每格都要在真卡片上见过或点过。不留空格，不留"其他"行。
落 `design.json`（§5）。问法见 [STEPS.md](STEPS.md)；细节见 [PANEL.md](PANEL.md) · [TOOLS.md](TOOLS.md) · [LINKAGE.md](LINKAGE.md)。

## 3 用 ASCII 沟通

画，不写句子。一张 ASCII 对应一种界面。

- 界面：卡片、每种状态、设置面、审批弹窗。图里用界面真实文案。
- 工具：贴真实调用（参数 JSON）与真实返回正文，照抄。
- 联动：画"变之前 / 变之后"两张并排。
- 矩阵左列写图号（A / B / C…）；比较方案就并排图。
- 不截图；实现后用户自己看。

**图例 = 屏幕**：每种状态一张小 ASCII（图标、那句话、按钮位置；空态有无按钮；阻断是整卡替换还是加一条；
骨架几行；弹窗每行谁给的）。状态名和图标不算图例。
凡是"看到 / 听到 / 发生"的句子，能画就画。画不成的只有：纯动作、agent 下一步、时间词（不变 / 自己变 / 立刻）、
纯映射表 —— 写成词并给定义。

### 审批屏（有写工具就画）

```
┌─ card（dsh 的壳）─────────────────────────────────────────┐
│ ● 等待审批                                                 │ ← dsh 画
├───────────────────────────────────────────────────────────┤
│ <标题：一句，≤40 字，…，允许吗？>                            │ ← question / fallback
│ <详情：ApprovalPlan 两列表 + warn>                          │ ← approval.render
├───────────────────────────────────────────────────────────┤
│                                  [ 拒绝 ]  [ 允许一次 ]    │
└───────────────────────────────────────────────────────────┘
```

1. 标题一句，`…，允许吗？` 收尾并点名"工作台"（工作台自身动作用 `申请…`）；装配后 ≤108 字。
2. 事实进详情：外壳的 `ApprovalPlan`（`approval: { tools, render }`）。
3. 事实不进标题：`approvalDetail` 只给没有详情表的族，≤20 字一行；有详情表时它是空的。
4. `approval_note` 只有 opencli 插件命令族必填；模块工具默认没有。
5. 文案的读者与两层（主句 / 原文）见 [COPY.md](COPY.md) §2–§3。

## 4 完成判据

- 用户只说过需求；没被问实现。
- 三张表无空格（`design check` 绿）；每格在真卡片上验过，`design accept` 打勾。
- 验收：DIY 域 agent 自验（调试族取证，[FAMILY.md](FAMILY.md)）；工程域请用户看一次。
- 需用户点头的写能力留给用户真用一次，清单标「要你真用一次」。
- 门禁绿；`design.json` 保留，后续改动不必从头问。

## 5 design.json

三张表 + 状态矩阵 + 数据源 + 验收存模块根的 `design.json`；README 对应段由它生成
（`<!-- dsh-wb:design:start/end -->`，手改判红）。

```bash
pnpm exec dsh-wb-module design check     # 空格 / README 落后
pnpm exec dsh-wb-module design render    # 重生成 README 段
pnpm exec dsh-wb-module design accept    # 逐条走通后打勾
```

字段：`unit` / `name` / `oneLine` + `panel[]`（这一格 / 结论 / 去哪）+ `states[]`（五态必填，key 固定
`idle|loading|ready|empty|unreadable`）+ `config[]` + `capabilities[]` + `linkage[]` +
`datasource{}`（一条读）或 `reads[]`（多条，一条一行；每条可带 `key` + `recipe`，见
[DATASOURCE.md](DATASOURCE.md)「配方」）+ `writes[]`（写通道；单条可写 `write{}`；没有就不写）+
`acceptance[]`。`config` / `capabilities` 可为空数组；其余空 = 未定。写通道字段见 [WRITES.md](WRITES.md)。

单态不适用时写 `na`：`{ "key": "idle", "na": "读的是账号，不随项目变" }`，不填 `sees` / `canDo` / `agentCan`。
`capabilities` 为空时 `states[].agentCan` 可省。`link` 等可选格留空渲染 `—`。

`design.json` 只装人话。模块**不声明**"在哪些工作区出现"—— 用户用 `workbench_panels_show` / `_hide` 决定
（[TOOLS.md](TOOLS.md) §12）。`contracts` 只对键名。
