# agent 能力：划分、入参返回、审批

步骤 2 的参考。

## 1 能力划分

| 情况 | 处理 |
|---|---|
| 同一件事、同一份数据，只是要不要展开明细 | 一件事 + 一个"展开"选项 |
| 动作或后果不同（看 vs 改） | 拆开 |
| 用户反复做、每次都要点头 | 封成一个动作（一个按钮 + 一件事），不拆成多个小工具 |

每件事都要能回答："用户会怎么对 agent 说这件事？"

## 2 入参

描述、返回、报错的语言口径见 [COPY.md](COPY.md) §4–§5。

能力 = 真实调用（参数 JSON）+ 真实返回正文（照抄）+ schema。能连平台就真跑一遍。

- 字段名用人和 agent 都懂的话，不用平台内部名。
- 默认值、取值范围、给错时的修法都写明。
- 上限写清；要多少给多少，不悄悄截；截断写清截了什么、完整版在哪。
- 有前置依赖就在描述里指路（"先调 X"）。
- 保留会改变行为的话：默认只预览、需点头、不可连刷、半途可续。

## 3 返回

- 只放 agent 推不出的事实：口径 + 数字 / 每行 + 平台链接 + "要明细该调哪个能力"。
- 删掉口径复述、"这是最后一批"；总数读不到就说读不到，不用当前页冒充。
- 每页可续：续取标识 + 剩余量 + 下一批怎么取。
- 长编号按字符串保留。

## 4 全场景（每格必填，写真实返回或真实报错原文）

| 情况 | 内容 |
|---|---|
| 正常 | 口径 + 数字 / 行 + 链接 |
| 没有 | 说"没有"并给依据（不是报错）+ 下一步 |
| 分不清是哪一份 | 列出候选让用户选；不猜、不退回默认 |
| 参数错 / 超上限 | 指名字段与合法值 / 拒绝并给上限 |
| 能力未装好 | 缺哪件 + 去哪更新 |
| 要登录 / 超时 | 分开报 + 重试或去登录 |
| 下一批 / 截断 | 本页内容 + 续取方式 / 截了什么、多少、完整版在哪 |
| 没有当前项目 | 说明按哪个项目取数 |

## 5 写操作：两拍

1. 预览：说清对象、值、去向，等确认。用户判断"要不要做"。
2. 执行：确认后动平台，回报结果。

一个动作一条链路：用户按按钮与 agent 调用是同一件事；重复发起要幂等（先查是否已有，进行中则续看）。
用户自按入口不点头：最小确认条（将要做什么 + 取消 / 执行），按下变"正在做…"，失败留在条内说明。

## 6 审批范围

命中任一就审批：① 改平台；② 改这台机器（装 / 卸 / 更新）；③ 改用户面板（加 / 收 / 排序 / 清空）。

审批内容必须是这次的具体后果：对象、值 / 版本、环境、影响数量。不写"这个操作会写数据"。
说不出后果就不发起审批：停止，把原因交给 agent 去查。

### 6.1 声明写法（缺一个 `contracts` 判据红）

清单 `tools[]` 一条（`writes: true` + `key`），加 `needsApproval(call)` 与 `approvalDetail(call)`。

- `key` 用 lowerCamelCase；跑 `dsh-wb-module sync` 生成 `src/declared-tools.ts`，代码写
  `DECLARED_TOOLS.rebuild.name`。工具名字面量只留清单一处；键错编译错，生成物过期 / 半写 / 又写字面量都红。
- `needsApproval` 返回：
  `{ kind: 'read' }` 不问；`{ kind: 'ask', question, fallback }` 要问；
  `{ kind: 'deny', reason }` 拒绝（reason 交给 agent；只放策略同步可判的事实）。`writes: true` 未认领 = deny。
  `question` / `fallback` 需 zh / en。
- `approvalDetail` 拿不到材料时返回 `{ blocked: '…' }` = 不弹。标题与详情形状见 [DESIGN.md](DESIGN.md) §3 末节：
  标题一句；`approvalDetail` → 仅无详情表的族，≤20 字一行；长内容走客户端 `approval.render` 的 `ApprovalPlan`。
  宿主数据到不了浏览器，事实从工具参数重建。

## 7 审批全场景

| 情况 | 用户看到 | agent 得到 |
|---|---|---|
| 预览 | 不弹 | 预览内容 |
| 执行且材料齐 | 这次会发生什么 + 允许吗 | 等待回答 |
| 材料不齐 / 项目不符 / 能力关闭 | 不弹 | 停止原因 / 项目说明 |
| 拒绝 / 点头后中途变化 | 关闭 / 当时那份材料 | 拒绝或失败原因，可照做 |
| 本轮中断 / 后台 | 消失 / 不弹 | 本轮结束 / 自动禁止 |
| 连发多件 | 逐条询问 | 逐条等待 |

按钮与弹窗由外壳提供；模块只决定明细画什么：一行一个事实。

## 8 外部供给

`needs` 声明能力依赖，外壳按 `kind` 去探、去装，状态见 `workbench_modules_list`。

四种 `kind`：`bin`（机器上的命令）/ `extension`（运行时插件）/ `lib`（共用 npm 依赖）/ `env`（环境变量）。
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
  { "kind": "lib", "name": "opencli-workflow", "purpose": "发布编排" },
  { "kind": "bin", "name": "acme", "purpose": "平台命令" },
  { "kind": "env", "name": "ACME_TOKEN", "purpose": "访问令牌", "secret": true }
]
```

- `sources` 按顺序试（本地 → 私有 → 公共）。没写 `sources` 就是「我自己装，你只帮我判」——外壳只探不代装。
- `extension` 的 `sources[].kind` 只有 `npm` / `git` / `local`；`lib` 只认 `npm`。
  未知 `kind` 或 `source.kind` 判红；need 里未知字段只警告，`x-` 前缀忽略。
- 未装好文案由模块写：`libInstallCommand({ need, source })`（`@dsh-workbench/shared/host`）拼好源与缓存目录，
  原样输出；放进失败态。
- `contracts` 判据：`apiVersion` 必须是 3；`needs` 走同一份 `NEED_KINDS` 注册表校验（`purpose` 必填、
  `bin`/`env` 不许带 `sources`、`lib` 只认 npm 源）；声明了 `lib` 必须用 `libInstallCommand`。
  未知 `runtime` 不判红：探针会给「这个运行时工作台还不认识」的 `unchecked`，等运行时 provider 补上。

## 9 长任务

耗时几十秒以上的操作做成长任务。宿主侧用 `mount` deps 的 `longTasks`，并挂回返回值：

```ts
longTasks.create({ key, run, step, outcome, view, stopped })
// run({ payload, onStep, signal })：onStep({ kind: 'start', text }) 报步骤；return 结果
```

- 来源：在工具里 `runs.start({ …, session: sessionIdOf(exec) ?? undefined })`（`sessionIdOf` 来自
  `@dsh-workbench/shared/host`）。不记 = 用户按的 → 停止需审批。
- 浏览器侧：`useLongTask` → `feed.runs` / `feed.stop(id)` / `feed.stopping` / `feed.stopFailed`；
  画 `LongTaskRow`（五态：`running` / `needs-login` / `stopped` / `ok` / `failed`）。
- 停止：`run` 收到 `signal` 被 abort = 有人按停止；在循环点与每条子命令前后查 `signal.aborted`。
  不认 signal 就不要画停止钮。画钮传 `stop`（`onStop: () => feed.stop(run.id)`、`busy: feed.stopping === run.id`、
  `failed: feed.stopFailed`、`label: 停止任务 {label}`、`askLabel: '确认停止'`）；失败文案画在行下，
  不写"停止失败"。两按确认归组件；未传 `stop` 的行不变。
- `feed.stopping` / `feed.stopFailed` 只有一格（最后一次）。多行并行时要分行状态就按 id 自记。
- 外壳自带 `workbench_long_tasks_list`（读）与 `workbench_long_tasks_stop`（写）。自己起的免审批；
  别人的 / 用户按的 / 没记来源的要审批；跨工作区直接拒。被停时外壳向起它的会话发 notice（完成 / 失败不发）。
- `contracts` 查形状：注册表七个方法（含 `stop` / `live`）、`create` 的 `key` / `run` / `view`、
  产物含 `useLongTask` / `LongTaskRow` 之一。是否真响应 signal 不在射程内。
- 左栏 loading 点由外壳按 `live()` 驱动，模块不做。
- 用 `stop` / `session` / 外壳长任务工具需把 `@dsh-workbench/core` peer 下限抬到含它们的版本（`check --only kit` 查）。

## 12 按工作区 / 模式收窄工具

工具是机器级的；不同项目需要不同工具。不要运行时返回"此项目不可用"—— 从清单移除。
`gate: { deniedTools(context), subscribe(listener) }` 挂进 `mount` 返回值：

- `deniedTools({ workspace, preset })` 返回该会话不存在的工具名（与 `registerTools()` 一致；二者可为 `null`）。
  `subscribe` 在状态变化时通知外壳重算；不接则等重启。
- 两个轴：`workspace` = 用户在看哪个项目；`preset` = 该会话被授权做什么。外壳两者都用。
  模块工具按工作区是否有这张卡收窄；DIY 族按模式收窄。
- 外壳双重执行：清单不出现 + 调用时拒。

"哪些工作区出现"不由模块声明：用户用 `workbench_panels_show` / `_hide` 控制，卡片与全部工具同判。
`deniedTools` 可选。
