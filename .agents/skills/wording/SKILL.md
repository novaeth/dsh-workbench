---
name: wording
description: 写或改任何文案时用：界面、agent 工具面、日志/CLI、文档、agent 的交代。先判读者，再定语域，再查词表；也用来审一段已有文案。
---

# 文案：先判读者，再定语域，再写

同一句话，读者不同、位置不同，写法不同。先判读者，再定语域，最后查词表。

## 三类读者

| 读者 | 读什么 | 标准 |
|---|---|---|
| **agent** | 工具描述、参数说明、返回、错误、`reason`、`{blocked}`、中断通知、`context.render` | 读完知道下一次调什么 |
| **终端用户** | 模块界面、空态、阻断、按钮、配置、审批屏、启动检查、市场状态、agent 的交代 | 读完知道点哪 / 要不要做，且不写代码 |
| **开发者** | 日志、`detail`、stderr、堆栈、CLI 输出 | 排障时能对照、能检索 |

混合读者：界面句写给最不懂的那位，技术细节进 `detail` / 折叠区 / 日志。

审批字段归属：

| 字段 | 读者 |
|---|---|
| `needsApproval.question` / `fallback` | 终端用户 |
| `approvalDetail` / `approval.render` | 终端用户 |
| `approval_note` | 终端用户 |
| `needsApproval.reason`（deny） | agent |
| `{blocked}` | agent |

## 三个概念

- **读者**：三类之一。判错读者，后面全错。
- **语域**：界面 / 交代 / 技术三档。见 [VOICE.md](VOICE.md)。
- **下一步**：agent 的下一次调用、用户的下一个动作、开发的下一次对照。说不出来就删掉这句。

## 六步

1. **判读者** —— 在覆盖矩阵里找到一行。判据：只有一行；两行都像就按「谁做下一件事」重判。
2. **定语域** —— 界面、交代还是技术；见 [VOICE.md](VOICE.md)。
3. **定下一步** —— agent 能说出下一次调什么；用户能说出点哪；开发能说出看哪条。
4. **先写句，再查词** —— 按意思写整句，再查 [TERMS.md](TERMS.md)；不要逐词替换。表里没有的概念先补表。
5. **放回位置** —— 描述进 `description`，参数进 schema，界面进 `messages.ts`，拒绝理由进 `reason`，日志进 logger。
6. **验** —— 按各文件末节；跑 `check:copy`。

## 覆盖矩阵

| 场景 | 谁写 | 谁读 | 语域 | 规则 |
|---|---|---|---|---|
| 启动检查 `env.*` | 外壳 | 用户；失败细节给开发 | 界面 + 技术 | [FOR-USER](FOR-USER.md) + [FOR-DEV](FOR-DEV.md) |
| 项目 / 会话 / 侧栏版本 `project.*` `session.*` `sidebarEdition.*` | 外壳 | 用户 | 界面 | [FOR-USER](FOR-USER.md) |
| 右栏 / 面板 / 市场 `rightbar.*` `panels.*` | 外壳 | 用户 | 界面 | [FOR-USER](FOR-USER.md) |
| 阻断 / 登录 `blocker.*` | 外壳 | 用户 | 界面 | [FOR-USER](FOR-USER.md) |
| 配置同步 `configSync.*` | 外壳 | 用户 | 界面 | [FOR-USER](FOR-USER.md) |
| 调试 / 录制底栏 `debug.*` `record.*` | 外壳 | 用户 | 界面 | [FOR-USER](FOR-USER.md) |
| 状态 / 时间 `status.*` `time.*` | 外壳 | 用户 | 界面 | [FOR-USER](FOR-USER.md) |
| 模块界面 / 配置 | 模块 | 用户 | 界面 | [FOR-USER](FOR-USER.md) |
| 审批屏 | 外壳 / 模块 | 用户 | 界面 | [FOR-USER](FOR-USER.md) |
| agent 回复 / 附注 | agent | 用户 | 交代 | [FOR-USER](FOR-USER.md) |
| 文档 / README / 更新日志 | 全部 | 用户 / 作者 | 文档 | 本文件 + `writing-*` |
| 工具描述 / schema | 外壳 / 模块 | agent | 技术 | [FOR-AGENT](FOR-AGENT.md) |
| 工具返回 | 外壳 / 模块 | agent（可被引用） | 技术 | [FOR-AGENT](FOR-AGENT.md) |
| 工具错误 / `reason` / `{blocked}` | 外壳 / 模块 | agent | 技术 | [FOR-AGENT](FOR-AGENT.md) |
| 中断通知（调试 / 录制 / 长任务） | 外壳 | agent | 技术 | [FOR-AGENT](FOR-AGENT.md) |
| `context.render` | 模块 | agent | 技术 | [FOR-AGENT](FOR-AGENT.md) |
| CLI 输出（check / design / lint） | 工具链 | agent + 开发 | 技术 | [FOR-DEV](FOR-DEV.md) |
| 日志 / stderr / 堆栈 | 全部 | 开发 | 技术 | [FOR-DEV](FOR-DEV.md) |
| `detail` / 折叠原文 | 全部 | 开发；用户可展开 | 技术 | [FOR-DEV](FOR-DEV.md) |
| 安装命令 | 外壳 | 用户复制 | 界面 + 技术 | [FOR-DEV](FOR-DEV.md) + [FOR-USER](FOR-USER.md) |
| a11y / placeholder / tooltip | 外壳 / 模块 | 用户 | 界面 | [FOR-USER](FOR-USER.md) |

## 硬规则

- **一个概念一个词**：界面、工具面、技能、文档、agent 交代同名。以 [TERMS.md](TERMS.md) 为准。
- 界面句只放人话；内部词、错误码、路径、堆栈进技术细节。
- 不写语气词、网络语、拟人、比喻、套近乎、空话。
- 读不到就写读不到，不写 0；不出现 `undefined` / `NaN` / `[object Object]` / 裸键名。
- 人侧 zh / en 都写，键带 `<unit>.`；英文重写，不直译。
- 工具描述是常驻上下文，有总字数上限：跑 `tool-surface.test.ts` 拿预算；加字先减字。
- 事实原样：给 agent 的 ID、版本、单位、时间戳不改写、不四舍五入；人侧时间写相对时间。
- 不猜：拿不到料就不写。
- 不引用已经不存在的东西（工具、字段、页面、命令）；改文案时顺手核一遍。

## 事实从哪来

- 预算、数量、工具清单 → 跑命令 / 看测试，不抄数字。
- 例子 → 仓库里稳定存在的字符串（i18n 字典、模板 messages、审批文案）。
- 不写「实测 / 当前 / 本仓 / 我这边」。

## 验收

1. 每条文本都在覆盖矩阵里有一行。
2. 混合场景都有界面句 + 技术细节，且两条标准都过。
3. 按读者验过：agent 侧真调；用户侧真界面；开发侧原文可 grep。
4. `check:copy` 绿；allowlist 外没有内部词、口语词、裸键、0 冒充空值。
5. 黄金屏走查：启动页、模块市场、审批、侧栏状态、录制各看一遍。

## 非目标

测试夹具、工具名与参数名（标识符）、dsh 自己的文案。
文档 / README / 更新日志纳入同一套词表；结构与格式走 `writing-for-agents` / `writing-*`。

## 权威

- 语域：[VOICE.md](VOICE.md)
- 词表：[TERMS.md](TERMS.md)
- agent 侧写什么删什么：`prompt-diet/spec.md`
- 审批屏：`approval-copy/spec.md` · ADR-0065
- 模块作者文案：[COPY.md](../../../packages/core/skills/workbench-module-diy/COPY.md)
- 界面形状：[PANEL.md](../../../packages/core/skills/workbench-module-diy/PANEL.md) · [DESIGN.md](../../../packages/core/skills/workbench-module-diy/DESIGN.md) · [DATASOURCE.md](../../../packages/core/skills/workbench-module-diy/DATASOURCE.md) · [TOOLS.md](../../../packages/core/skills/workbench-module-diy/TOOLS.md)
