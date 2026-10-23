---
name: wording
description: 写或改一段文本时用：工具描述、参数说明、工具返回、给模型的错误、拒绝理由、中断通知（给 agent），或卡片、空态、阻断、按钮、配置、审批屏、启动体检、agent 的交代（给人）。先判读者（agent / 终端用户 / 开发者），再按对应文件写；也用来审一段已有措辞。
---

# wording：先判读者，再写

同一句话，读者不同，写法不同。先判读者，再动笔。

## 判读者

| 读者 | 读什么 | 判据 |
|---|---|---|
| **agent** | 工具描述、参数说明、返回、错误、`reason`、`{blocked}`、中断通知、`context.render` | 读完决定下一次调用 |
| **终端用户** | 卡片、空态、阻断、按钮、配置、审批屏、启动体检、市场状态、agent 的交代 | 读完决定点哪 / 要不要做，且不写代码 |
| **开发者** | 日志、`detail`、stderr、堆栈、CLI 输出 | 只在排障时读，要能检索、对照 |

混合读者：**主句写给最不懂的那位**，技术细节进原文（见下）。

审批字段归属：

| 字段 | 读者 |
|---|---|
| `needsApproval.question` / `fallback` | 终端用户 |
| `approvalDetail` / `approval.render` | 终端用户 |
| `approval_note` | 终端用户 |
| `needsApproval.reason`（deny） | agent |
| `{blocked}` | agent |

## 四个词

- **读者**：三类之一。判错读者，后面全错。
- **主句**：终端用户实际要读、要据此行动的那一句。
- **原文**：技术事实的原样版本，给开发者，放 `detail` / 折叠区 / 日志。
- **下一件事**：agent 的下一次调用、用户的下一个动作、开发的下一次对照。说不出来就删掉这句。

## 五步

1. **判读者** —— 在覆盖矩阵里找到一行。判据：只有一行；两行都像就按"谁做下一件事"重判。
2. **定下一件事** —— agent 能说出下一次调什么；用户能说出点哪；开发能说出看哪条。判据：说得出。
3. **写** —— 按对应文件。混合面写一对：主句 + 原文。判据：字数在预算内；事实原样；主句无内部词。
4. **放回位置** —— 描述进 `description`，参数进 schema，界面进 `messages.ts`，拒绝理由进 `reason`，日志进 logger。判据：键存在、语言齐、层级对。
5. **验** —— 按读者验（见各文件末节）。判据：遮住原文只读主句能行动；遮住主句只读原文能定位。

## 覆盖矩阵

| 面 | 谁写 | 谁读 | 规则 |
|---|---|---|---|
| 启动体检 `env.*` | 外壳 | 用户；失败细节给开发 | [FOR-USER](FOR-USER.md) + [FOR-DEV](FOR-DEV.md) |
| 项目 / 会话 / 侧栏版本 `project.*` `session.*` `sidebarEdition.*` | 外壳 | 用户 | [FOR-USER](FOR-USER.md) |
| 右栏 / 面板 / 市场 `rightbar.*` `panels.*` | 外壳 | 用户 | [FOR-USER](FOR-USER.md) |
| 阻断 / 登录 `blocker.*` | 外壳 | 用户 | [FOR-USER](FOR-USER.md) |
| 配置同步 `configSync.*` | 外壳 | 用户 | [FOR-USER](FOR-USER.md) |
| 调试 / 录制底栏 `debug.*` `record.*` | 外壳 | 用户 | [FOR-USER](FOR-USER.md) |
| 状态 / 时间 `status.*` `time.*` | 外壳 | 用户 | [FOR-USER](FOR-USER.md) |
| 模块卡片 / 配置 | 模块 | 用户 | [FOR-USER](FOR-USER.md) |
| 审批屏 | 外壳 / 模块 | 用户 | [FOR-USER](FOR-USER.md) |
| agent 回复 / 附注 | agent | 用户 | [FOR-USER](FOR-USER.md) |
| 工具描述 / schema | 外壳 / 模块 | agent | [FOR-AGENT](FOR-AGENT.md) |
| 工具返回 | 外壳 / 模块 | agent（可被引用） | [FOR-AGENT](FOR-AGENT.md) |
| 工具错误 / `reason` / `{blocked}` | 外壳 / 模块 | agent | [FOR-AGENT](FOR-AGENT.md) |
| 中断通知（调试 / 录制 / 长任务） | 外壳 | agent | [FOR-AGENT](FOR-AGENT.md) |
| `context.render` | 模块 | agent | [FOR-AGENT](FOR-AGENT.md) |
| CLI 输出（check / design / lint） | 工具链 | agent + 开发 | [FOR-DEV](FOR-DEV.md) |
| 日志 / stderr / 堆栈 | 全部 | 开发 | [FOR-DEV](FOR-DEV.md) |
| `detail` / 折叠原文 | 全部 | 开发；用户可展开 | [FOR-DEV](FOR-DEV.md) |
| 安装命令 | 外壳 | 用户复制 | [FOR-DEV](FOR-DEV.md) + [FOR-USER](FOR-USER.md) |
| a11y / placeholder / tooltip | 外壳 / 模块 | 用户 | [FOR-USER](FOR-USER.md) |

## 硬规则

- 读不到就写读不到，不写 0；不出现 `undefined` / `NaN` / `[object Object]` / 裸键名。
- 主句只放人话；错误码、路径、堆栈、内部词放原文。
- 人侧 zh / en 都写，键带 `<unit>.`；英文重写，不直译。
- 工具描述是常驻上下文，有总字数棘轮：跑 `tool-surface.test.ts` 拿预算；加字先减字。
- 事实原样：给 agent 的 ID、版本、单位、时间戳不改写、不四舍五入；人侧时间写相对时间。
- 不猜：拿不到料就不写。
- 不引用已经不存在的东西（工具、字段、页面、命令）；改文案时顺手核一遍。

## 事实从哪来

- 预算、数量、工具清单 → 跑命令 / 看测试，不抄数字。
- 例子 → 仓库里稳定存在的字符串（i18n 字典、模板 messages、审批文案）。
- 不写“实测 / 当前 / 本仓 / 我这边”。

## 验收

1. 每条文本都在覆盖矩阵里有一行。
2. 混合面都有主句 + 原文，且两条判据都过。
3. 按读者验过：agent 侧真调；用户侧真界面；开发侧原文可 grep。
4. 没有内部词、裸键、0 冒充空值。

## 非目标

文档 / README / 发布说明 / PR、测试夹具、工具名与参数名（标识符）、dsh 自己的文案。

## 权威

- agent 侧写什么删什么：`prompt-diet/spec.md`
- 审批屏：`approval-copy/spec.md` · ADR-0065
- 界面形状：[PANEL.md](../../../packages/workbench/skills/workbench-module-diy/PANEL.md) · [DESIGN.md](../../../packages/workbench/skills/workbench-module-diy/DESIGN.md) · [DATASOURCE.md](../../../packages/workbench/skills/workbench-module-diy/DATASOURCE.md) · [TOOLS.md](../../../packages/workbench/skills/workbench-module-diy/TOOLS.md)
