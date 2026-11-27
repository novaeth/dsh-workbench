# agent 能力：划分、入参返回、审批

步骤 2 的参考。

## 1 能力划分

| 情况 | 处理 |
|---|---|
| 同一件事、同一份数据，只是要不要展开明细 | 一件事 + 一个"展开"选项 |
| 动作或后果不同（看 vs 改） | 拆开 |
| 用户反复做、每次都要批准 | 封成一个动作（一个按钮 + 一件事），不拆成多个小工具 |
| 用户反复做、步骤多、要等 / 重试 | 固化成一条 workflow（[WORKFLOW.md](WORKFLOW.md)），不拆成多个小工具 |

先定：用户会怎么对 agent 说？

## 2 入参

语言口径见 [COPY.md](COPY.md) §5–§6。

能力 = 真实调用（参数 JSON）+ 真实返回正文（照抄）+ schema；能连平台就运行一次。

- 字段名用人和 agent 都懂的话，不用平台内部名。
- 默认值、取值范围、给错时的修法都写明。
- 上限写清；要多少给多少，不悄悄截；截断写清截了什么、完整版在哪。
- 有前置依赖就在描述里说明调用顺序（"先调 X"）。
- 保留会改变行为的信息：默认只预览、需要批准、不可连续发起、中断后可以继续。

## 3 返回

- 只放 agent 推不出的事实：口径 + 数字 / 每行 + 平台链接 + "要明细该调哪个能力"。
- 删掉口径复述、"这是最后一批"；总数读不到就说读不到，不用当前页冒充。
- 每页可续：续取标识 + 剩余量 + 下一批取法。
- 长编号按字符串保留。

## 4 全场景（每格必填，写真实返回或真实报错原文）

| 情况 | 内容 |
|---|---|
| 正常 | 口径 + 数字 / 行 + 链接 |
| 没有 | 说"没有"并给依据（不是报错）+ 下一步 |
| 分不清是哪一份 | 列出候选让用户选；不猜、不退回默认 |
| 参数错 / 超上限 | 指名字段与合法值 / 拒绝并给上限 |
| 能力未安装完成 | 缺哪件 + 去哪安装 |
| 要登录 / 超时 | 分开报 + 重试或去登录 |
| 下一批 / 截断 | 本页内容 + 续取方式 / 截了什么、多少、完整版在哪 |
| 没有当前项目 | 说明按哪个项目取数 |

## 5 写操作：两步

1. 预览：说清四行事实，等用户确认。
2. 执行：确认后动平台，回报结果。

第一步在对话里这样展示（第二步由审批屏的标题与四行回答，按钮承担「拒绝 / 允许一次」，见 [DESIGN.md](DESIGN.md) §3）：

```
┌─ 将要提交 ─────────────────────────────────┐
│ 修改项   #2024-0815                        │
│ 修改后   已通过                            │
│ 目标位置 订单平台 · 预发环境                │
│ 影响范围 1 单；可撤销（撤回审核）           │
└────────────────────────────────────────────┘
```

- 值现读；读不到写「读不到」并说明还差什么，不猜、不写 0。
- 只说这次发生什么，不写「这个操作会改数据」。

一个动作一条链路：用户点击按钮与 agent 调用是同一件事；重复发起要幂等（先查是否已有，进行中则续看）。
用户自行触发的入口无需审批：显示确认条（做什么 + 取消 / 执行），按下后显示「正在执行…」，失败原因留在条内。

## 6 审批范围

命中任一就审批：① 改平台；② 改本机（安装 / 卸载 / 更新）；③ 改面板（添加 / 收起 / 排序 / 清空）。

审批内容必须是本次具体后果：对象、值 / 版本、环境、影响数量；不写"会写数据"。
说不出后果就不发起审批：停止，把原因交给 agent。

### 6.1 声明写法（缺一个 `contracts` 判据红）

清单 `tools[]` 一条（`writes: true` + `key`），加 `needsApproval(call)` 与客户端 `approval.plan`。

- `key` 用 lowerCamelCase；执行 `dsh-wb-module sync` 生成 `src/declared-tools.ts`，代码里使用
  `DECLARED_TOOLS.rebuild.name`。工具名字面量只保留在清单里一处；键名错误会导致编译错误，生成物过期、只写一半或又出现字面量都会失败。
- `needsApproval`：`read` 不问；`ask` 给 `headline`（动作 + 对象，≤15 字，无「允许吗」）与
  `question` / `fallback`（zh / en；`writeApprovalOf` 会补齐）；`deny` 给理由。`writes: true` 未认领 = deny。
- `approval.plan` 四行：`object` / `change` / `target` / `impact`，其余见 `ApprovalPlanData`；说不清就 `null` + `deny`。
- `approval.render` 可选：接管详情区；空/抛错退回四行表。
- `approvalDetail` 只给无 `headline` 的旧模块；没有材料返回 `{ blocked }`。

## 7 审批全场景

| 情况 | 用户看到 | agent 得到 |
|---|---|---|
| 预览 | 不弹 | 预览内容 |
| 执行且材料齐 | 标题 + 四行 + 两个按钮 | 等待回答 |
| 材料不齐 / 项目不符 / 能力关闭 | 不弹 | 停止原因 / 项目说明 |
| 拒绝 / 批准后中途变化 | 关闭 / 当时那份材料 | 拒绝或失败原因，可照做 |
| 本轮中断 / 后台 | 消失 / 不弹 | 本轮结束 / 自动禁止 |
| 连发多件 | 逐条询问 | 逐条等待 |

按钮与弹窗由工作台提供；模块定标题与四行，或交 `approval.render` 自定义详情。

## 8 外部供给

`needs` 声明能力依赖；工作台按 `kind` 探测安装，状态见 `workbench_modules_list`。

四种 `kind`：`bin`（本机命令）/ `extension`（运行时插件）/ `lib`（共用 npm 依赖）/ `env`（环境变量）。
每条必写 `purpose`（给用户看的那半句）；`required: false` 只降级、不挡卡片。

```jsonc
"needs": [
  {
    "kind": "extension",
    "runtime": "opencli",
    "name": "acme-workflow",
    "commands": ["acme-read", "acme-write"],
    "purpose": "读写工单",
    "sources": [
      { "kind": "npm", "package": "opencli-plugin-acme", "registryEnv": "ACME_REGISTRY" },
      { "kind": "git", "url": "git@internal:plugin-acme.git" },
      { "kind": "local", "env": "ACME_PLUGIN_PATH" }
    ]
  },
  {
    "kind": "lib",
    "name": "opencli-workflow",
    "version": "^1.1.25",
    "runs": ["opencli"],
    "purpose": "发布编排"
  },
  {
    "kind": "bin",
    "name": "acme",
    "purpose": "平台命令",
    "install": { "kind": "command", "line": "brew install acme/tap/cli", "platforms": ["darwin"] },
    "docs": "https://internal/acme-cli"
  },
  { "kind": "env", "name": "ACME_TOKEN", "purpose": "访问令牌", "secret": true }
]
```

- `sources` 按顺序尝试（本地 → 私有 → 公共）。没写 `sources` 表示「我自己安装，你只判断」：工作台只探测，不代为安装。
- 想让 `bin` 支持一键安装，就写 `install.line`（一条能直接粘贴到终端的命令，可用 `platforms` 限定平台）；
  不写就只显示「缺这条命令」，按钮都不会有。`docs` 是给人和 agent 看的补充链接。
  跨平台要么按 `darwin` / `linux` / `win32` 各写一条 `install.platforms`，要么只写你那一个平台并说明；
  不要让 Windows 用户看到 `brew install`。`install.kind: "npm"` 时，由工作台装进隔离运行时并接入 PATH。
- `lib` 自行启动运行时的命令（例如发布编排库自己调用 `execFile('opencli')`）时，就写 `runs: ["opencli"]`：
  工作台把手上那份「运行 opencli」的执行器注入进去（库侧约定暴露 `setOpencliRunner`），
  这样编排与面板使用同一份 opencli（同一套插件、同一份登录状态）。不写 `runs` 时，按库自己的 PATH 查找。
  库版本太旧、没有 `setOpencliRunner` 时，工作台只记一条 warn，仍按 PATH 运行；用 `version` 限定那一版即可。
- `extension` 的 `sources[].kind` 只有 `npm` / `git` / `local`；`lib` 只认 `npm`。
  未知 `kind` 或 `source.kind` 会失败；need 里未知字段只警告，`x-` 前缀忽略。
- 未安装完成的文案由模块写：`deps.libInstallCommand({ need, source })` 拼好源与缓存目录，
  原样输出；放进失败态。
- `contracts` 判据：`apiVersion` 必须是 3；`needs` 走同一份 `NEED_KINDS` 注册表校验（`purpose` 必填、
  `bin`/`env` 不许带 `sources`（`bin` 需要代为安装就写 `install`）、`lib` 只认 npm 源）；
  声明了 `lib` 必须用 `deps.libInstallCommand`。
  未知 `runtime` 不报错：探针给「这个运行时工作台还不认识」的 `unchecked`，等 provider 补上。

## 9 长任务

耗时几十秒以上做成长任务：`mount` deps 的 `longTasks` 并挂回：

`deps.longTasks.create(...)` 建注册表、`start` 起一趟；字段见 `LongTaskDeps`，方法见 `LongTaskRegistry`；
`run` 里用 `onStep` 报步骤。

- 来源：工具里 `runs.start({ …, session: deps.sessionIdOf(exec) ?? undefined })`。未记录 = 用户手动起的 → 停止需审批。
- 流程事件默认用 `longTaskStepOf(event)`。
- **步骤链接**：步骤可带 `links`（`{ href, text }`，≤3、只认 `http(s)`），flow 用 `ctx.log(text, links?)`；
  快照另攒结构化 `history`（与 `steps` 同源同上限），旧视图照旧读 `steps`。
- **要人处理的节点**：给这一步带 `intervention`（类型从 `@dsh-workbench/shared` 取）：
  `{ title, hint?, actions?: ({kind:'open-url',url,label?} | {kind:'copy',text,label?})[], fields?, submitLabel? }`；
  `title` / `hint` 是字面量（宿主侧没有 `t`），`label` 缺省用工作台的词；带它的步骤停在 `needs-human`，下一条不带回 `running`。
- **结构化回执**：`fields` 行上出表单，`submitLabel` 是提交钮；接住回执给 `longTasks.create({ answer?(current, values) })`，
  `<单元>/runs/answer` 交回模块；values 不进快照。
- **恢复**：默认靠模块自己轮询。给了 `recheck?(current)` 行上才有「我处理完了」（只发 `<单元>/runs/recheck`，工作台不承诺恢复）；
  要自动重试就用 `withInterventionRetry(check)`（`@dsh-workbench/shared/host`）当 `recheck`。
- 进入 `needs-human` 时工作台自动向起它的会话发「在等你处理」notice（hold、按 run 去重），模块不做。
- 流程侧对应 `ctx.need(intervention)`；`ctx.login(url)` 是旧路（仍产 `needs-login` + `loginUrl`，标 deprecated）。
- 浏览器侧：`useLongTask` 读 `feed.runs`，`stop` / `recheck` / `answer` 各自带 `stopping` / `failed`；
  画 `LongTaskRow`（六态；`step` / `meta` / `history` 给了才画）。

```
● 正在发布（2/3） [⏹]
● 发布会话等你确认 · 去控制台点「确认」 [打开]
● 要登录腾讯云 [登录 →] / 完成 [日志 →] / 失败 [步骤 · 原文] / 已停止
```

- 行尾是链接；有步骤就能展开，失败默认开。

- 停止：`run` 收到 `signal` 被 abort = 有人点击停止；在循环点与每条子命令前后查 `signal.aborted`。
  不响应 signal 就不要画停止按钮。画钮传 `stop`（`onStop: () => feed.stop(run.id)`、`busy`、`failed`、
  `label: 停止任务 {label}`、`askLabel: '确认停止'`）；失败文案画行下；两步确认归组件。
- 工作台自带 `workbench_long_tasks_list`（读）与 `workbench_long_tasks_stop`（写）。自己发起的长任务无需审批；
  他人的 / 用户手动启动的 / 未记录来源的需要审批；跨工作区直接拒绝。
- `contracts` 查形状：注册表方法见 `LongTaskRegistry`，`create` 的字段见 `LongTaskDeps`；
  产物含 `useLongTask` / `LongTaskRow` 之一。是否实际响应 signal 不在检查范围内。
- 左栏状态点按 `live()` 驱动（等人升 warning）；底部「工作台任务」按 `recent()` 取数（运行中 + 十分钟内收尾），
  收尾行被看到后工作台调 `seen()` 清提示。
- 用 `stop` / `session` / 长任务工具需把 `@dsh-workbench/core` peer 下限抬到含它们的版本（`check --only kit` 查）。

`registerTools()` 调用时才注册、返回清理函数；工具名与 `dsh.workbench.tools` 一字不差，没有就 `() => []`。
样板：`dsh-wb-module init` 的 `template-diy` 模块。

## 9.1 多步流程（workflow）

多步、需要等待、需要重试、需要取消、以后还要运行 → 先按 [WORKFLOW.md](WORKFLOW.md) 询问用户是否固化。

- 固化 = 宿主半侧的 `FlowDefinition`（类型从 `@dsh-workbench/core/contract` 取）+ `deps.flow.run` + §9 的长任务 + `registerTools`。
- 一次性 = 直接使用现有工具 / 命令执行，不建模块。
- 写平台的 flow 工具在清单里 `writes: true` + `needsApproval`；运行前给出对象 / 环境 / 影响。
- `deps.flow.check(flow, actions)` 先过；动作里用 `ctx.need(intervention)` 报人工干预节点，`ctx.log` 报进度。
- **agent 节点**：子 agent 读与判断，不写平台；结果进 `steps.<id>`；由看板按钮发起时会附带用户当前会话。见 [WORKFLOW.md](WORKFLOW.md) §4。
- flow 的运行时只走 `deps.flow`，类型只走 `@dsh-workbench/core/contract`；不要为 flow 直接 import `@dsh-workbench/shared/host`。
- 不要在 flow 里存凭据；不要把一次性任务静默固化。
- 工具描述写「运行已固化的 <标题> 流程」；不要用它新建 flow，新需求先询问用户。

## 12 按工作区 / 模式收窄工具

工具是机器级的；不同项目需要不同工具。不要运行时返回"此项目不可用"—— 从清单移除。
`gate: { deniedTools(context), subscribe(listener) }` 挂进 `mount` 返回值：

- `deniedTools({ workspace, preset })` 返回该会话不存在的工具名（与 `registerTools()` 一致；二者可为 `null`）。
  `subscribe` 在状态变化时通知工作台重算；不接则等重启。
- 两个轴：`workspace` = 用户在看哪个项目；`preset` = 该会话被授权做什么。工作台两者都用。
  模块工具按工作区是否有这个模块收窄；DIY 族按模式收窄。
- 工作台双重执行：清单不出现 + 调用时拒。

"哪些工作区出现"由用户用 `workbench_panels_show` / `panels_hide` 控制，卡片与全部工具同判；`deniedTools` 可选。
