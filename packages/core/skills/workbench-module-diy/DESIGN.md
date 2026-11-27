# 设计：定需求、出三张表、写入 design.json

去向分诊见 [SKILL.md](SKILL.md)。工程域与 DIY 域共用本页的三张表、ASCII、设计记录与模块说明规则；验收归谁见 §4。

## 1 分工

| 谁 | 决定 |
|---|---|
| 用户 | 看到什么、能配什么、agent 替做什么、哪些要批准、措辞、取舍 |
| agent | 实现与验收：实现方式、命名、位置、技术选型、验证方法。**不追问实现选型** |

对话规则：

- 每个问题给推荐答案，用户可一字通过；不确定就按推荐走并标注。
- 必答的决定翻译成"你会看到什么"再问，不问 A/B 选型。
- 每步给用户一个可看的东西：表、ASCII、可点击的界面。不贴代码、不讲实现。
- 开始前列待办：问 → 三张表 → 做 → 验收。

## 2 三张表

| 步 | 问 | 产出 | 行 × 列 |
|---|---|---|---|
| 1 面板 | 看到什么？能配什么？ | 展示清单 + 配置清单 + 状态矩阵 + 图例 | 每种状态（含每种缺失）×「看到什么 / 能做什么 / agent 能接着做什么」 |
| 2 agent | agent 替做什么？哪些要批准？ | 能力清单 + 全场景 + 批准场景 | 每件事 × 每种情况：agent 得到什么 / 用户看到什么 |
| 3 联动 | 凭什么相信面板是新的？ | 联动场景 | 每种"谁在动" ×「何时变 / 哪一格变 / 看到什么」 |

三张表同时是验收单：每格都要在真卡片上见过或点过。不留空格，不留"其他"行。
写入 `design.json`（§5）。问法见 [STEPS.md](STEPS.md)；细节见 [PANEL.md](PANEL.md) · [TOOLS.md](TOOLS.md) · [LINKAGE.md](LINKAGE.md)。

## 3 用 ASCII 沟通

画，不写句子。一张 ASCII 对应一种界面。

- 界面：卡片、每种状态、设置面、审批弹窗。图里用界面真实文案。
- 工具：贴真实调用（参数 JSON）与真实返回正文，照抄。
- 联动：画"变之前 / 变之后"两张并排。
- 矩阵左列写图号（A / B / C…）；比较方案就并排图。
- 不截图；实现后用户自己看。

**图例 = 屏幕**：每种状态一张小 ASCII（图标、那句话、按钮位置；空态有无按钮；阻断是整张卡片替换还是加一条；
骨架几行；弹窗每行谁给的）。状态名和图标不算图例。
**不要画右边框**：中文在不同字体下宽度不定，右边框一定对不齐。只用左边竖线、分隔线和缩进；一行不超过 92 列。
凡是"看到 / 听到 / 发生"的句子，能画就画。画不成的只有：纯动作、agent 下一步、时间词（不变 / 自己变 / 立刻）、
纯映射表 —— 写成词并给定义。

### 审批屏（有写工具就画）

```
┌─ card（dsh 的壳）─────────────────────────────────────────┐
│ ● 等待审批                                                 │ ← dsh 画
├───────────────────────────────────────────────────────────┤
│ <标题：动作 + 对象，一句，≤15 字；不带「允许吗」>            │ ← headline
│ <详情：四行 + 可选 extra / warn>                            │ ← approval.plan
│  修改项 / 修改后 / 目标位置 / 影响范围                      │
├───────────────────────────────────────────────────────────┤
│                                  [ 拒绝 ]  [ 允许一次 ]    │
└───────────────────────────────────────────────────────────┘
```

1. 标题写「动作 + 对象」的陈述句（例如「解决缺陷 #136」），≤15 字，不以「允许吗」收尾；问题由两个按钮承担。
2. 四行是下限：客户端 `approval.plan` 必填，返回 `object` / `change` / `target` / `impact`，第一格可用 `objectLabel` 换成领域词（缺陷 / 文件 / 模块）；可加 `extra` 与 `warn`。
3. 自定义 `approval.render` 可以完全接管详情区，拿到 `plan`；返回空或抛错时退回四行表。`plan` 是它的数据底稿，不是二选一。
4. `approvalDetail` 只给没有 `headline` / `plan` 的旧模块，≤20 字一行；有 `headline` 时可省。
5. `approval_note` 只有 opencli 插件命令族必填；模块工具默认没有。
6. 文案的读者与两层（界面句 / 技术细节）见 [COPY.md](COPY.md) §4。

## 4 完成判据

- 用户只说过需求；没被问实现。
- 用户的判断不超过预算（有看板 ≤4 次、无看板 ≤3 次；出草图与改草图各算一次）。
- 三张表无空格（`design check` 绿）；每格在真卡片上验过。验收结果写成「验过 / 未验」两列，
  未验必须明写「未验」。
- **全部走通后才** `design accept` 打勾；走不通就记「未验」，不要打勾。
- 验收默认只读取证；确需真实交互才申请页面调试，并说清占用范围与大概多久（[SYMPTOM.md](SYMPTOM.md)）。
- 需用户批准的写能力留给用户实际使用一次，清单标「需要你实际使用一次」。
- 门禁绿；`design.json` 保留，后续改动走 [FLOW.md](FLOW.md) 的 `diy-tweak`，先复述再问。

## 5 design.json

三张表 + 状态矩阵 + 数据源 + 验收存模块根的 `design.json`；DEVELOPING.md 对应段由它生成
（`<!-- dsh-wb:design:start/end -->`，手动修改会判定失败）。

```bash
pnpm exec dsh-wb-module design migrate   # 旧模块：旧 README 保存为 DEVELOPING.md，再生成用户 README
pnpm exec dsh-wb-module design check     # 空格 / DEVELOPING.md 或 README 落后
pnpm exec dsh-wb-module design render    # 重生成 README 与 DEVELOPING.md
pnpm exec dsh-wb-module design accept    # 逐条走通后打勾
```

字段：`unit` / `name` / `oneLine` + `panel[]`（这一格 / 结论 / 去哪）+ `states[]`（五态必填，key 固定
`idle|loading|ready|empty|unreadable`）+ `config[]` + `capabilities[]` + `linkage[]` +
`datasource{}`（一条读）或 `reads[]`（多条，一条一行；每条可带 `key` + `recipe`，见
[DATASOURCE.md](DATASOURCE.md)「配方」）+ `writes[]`（写通道；单条可写 `write{}`；没有就不写）+
`acceptance[]`。`config` / `capabilities` 可为空数组；其余空 = 未定。写通道字段见 [WRITES.md](WRITES.md)。

单态不适用时写 `na`：`{ "key": "idle", "na": "读的是账号，不随项目变" }`，不填 `sees` / `canDo` / `agentCan`。
`capabilities` 为空时 `states[].agentCan` 可省。`link` 等可选格留空渲染 `—`。

`design.json` 只写用户能读懂的内容。模块**不声明**"在哪些工作区出现"—— 用户用 `workbench_panels_show` / `panels_hide` 决定
（[TOOLS.md](TOOLS.md) §12）。`contracts` 只对键名。

## 6 readme.json

终端用户看到的 `README.md` 只从模块根的 `readme.json` 生成。写的时候按用户视角：看到什么、能点什么、哪些需要批准、数据从哪来；不写 `src/`、路由、判据、错误码、工具链命令，也不留 `（待填）`。

字段：`title` / `summary` / `shots[]` / `see[]` / `do[]` / `agent[]` / `data[]` / `install` / `trouble[]` / `faq[]`。条目有绑定形态，`design check` 按它判覆盖：

```json
{
  "shots": [
    { "kind": "card", "caption": "卡片", "ascii": "……" },
    { "kind": "approval", "caption": "审批", "ascii": "……" }
  ],
  "do": [
    { "config": "limit", "text": "「显示几个文件」选 5 / 10 / 20，只影响显示。" },
    "用户能点击的另一个按钮。"
  ],
  "agent": [
    { "capabilities": ["demo_run"], "text": "让 agent 运行示例流程：只读，无需批准。" },
    { "capabilities": ["demo_add_note"], "text": "让 agent 记笔记：需要批准。" }
  ],
  "trouble": [
    { "states": ["empty", "unreadable"], "text": "空目录不是故障；读不到时刷新重试。" }
  ]
}
```

- `agent[]` 每条绑 1..N 个 `capabilities[].name`；每个能力至少一条，未知名字红。
- `do[]` 每条可绑一个 `config[].key`；每个配置至少一条，未知 key 红。
- `trouble[]` 每条可绑若干 `states[]`；`empty` / `unreadable` 不适用（`na`）才免。
- `shots` 至少一张 `card`；有 `writes: true` 的工具就必须有一张 `kind: "approval"`，没有写工具却有审批图也红。
- `title` 必须与卡片标题（`src/messages.ts` 的 `<unit>.cardTitle`）同词；没有卡名就退回清单 `title`。
- 字符串条目仍可渲染，但不参与覆盖；没有绑定就算没写。
- 每段 1–4 条、单条 ≤70 字，长解释进 `faq`。

`design render` 写 README；`design check` 点出空字段、占位符、技术词、缺绑定、缺审批图与标题不一致，全部按错误处理。`release` 在 `check` 之后直接运行 `design check`；旧模块运行 `design migrate` 生成骨架，已有 `readme.json` 的模块按上面补绑定。
