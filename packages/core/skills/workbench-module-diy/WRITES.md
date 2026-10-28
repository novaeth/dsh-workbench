# 写通道：找到写命令、取得原文、确认、回读

[datasource](DATASOURCE.md) 只管读。本文件管写：提交 / 发布 / 建单 / 改配置。

判域同 [DESIGN.md](DESIGN.md) §0：复用现有登录、一次调用能改完 → DIY；要新凭据 / 新服务或依赖 → 工程域；多步长流程先问一次性还是固化（[FLOW.md](FLOW.md)）。

## 四步

1. **找现成写命令** —— `workbench_diy_recon`（`keyword=…`）标注每条命令的读写：
   `读` · `写（可预览）` · `写（无预览档，一次就是真的）`，并给入参签名（`--id --yes=false`）。
   命中即复用（自造会绕过登录、XSRF、错误码处理）。
   只命中写命令时，末句提示：先 `--help` 看入参；带 `--dryRun` / `--yes` 的先走预览；**无预览档不许试写**。
   边界：recon 只覆盖 opencli 自带目录；`inventory` / `demo` 等插件只回命令名，参数走第 2 步。

2. **查入参 / 出参**（按可信度）：

   - `workbench_diy_spec`（`command='<site> <name>'`，`inventory publish` / `inventory/publish` 均可）：
     返回 `opencli <site> <name> --help -f json` 原文；JSON 时另给 `spec`（`access`、`positionals`、
     `command_options[{name, required, help, default}]`、出参列）。不碰屏、不需约定。
   - recon 的 `args`（必填 / 默认值）与 `preview` 标记，仅覆盖自带目录；插件以 `_spec` 为准。
   - adapter 源码：隔离 HOME 的 `.opencli/plugins/<site>` 指向插件包；接口 URL / 方法 / cookie / XSRF 在源码里。
   - `opencli <site> <name> --help`（`-f yaml` 可读性更好）：取枚举值（manifest 无 `choices`，枚举只在 help 里）。

3. **无现成命令 → 让用户录一次**（你准备，用户执行）：

   - `workbench_diy_record_prepare({ unit, url, doing })`：开窗置前（**需审批一次**：站点、录哪一下、保存到、
     录完不切回），装浮条。用户：① 开始录制 ② 做一次动作 ③ 结束录制。不要让用户点第二次。
     `url` 必须与模块读源同域（`design.json` 声明过读源时跨域当场拒）。
   - 表填好、提交前，请用户按浮条「截图」：不额外审批；产出整页图 + 页面快照（控件 `name` / `id`、
     标签、必填痕迹、填值、是否空、是否改过）。提交时会自动再抓一份。
   - `workbench_diy_record_read`：取清单 `rows`（`index` / `key` / `method` / `url` / `status` / `ct` /
     `size` / `source` / `hasRequest` / `hasResponse` / `likelyWrite` / `marked`），不删行、不回体；
     `expect` 只标 ⭐ 并置顶。按 `key`（或 `index`）调 `workbench_diy_record_detail`：
     返回请求体与响应体原文 + 请求头（可能含凭据，不写入 `design.json`）。同 key 跨轮重名，带 `at` 定位。
     未结束时 read 会说"还在录"；可带 `waitMs`（上限 15 分钟）。**一场 = 一个周期**；上一场未收工再
     prepare 会当场拒（不弹审批）。
   - `workbench_diy_record_stop`：停捕获、收标签、清状态，原文另存 `shots/rec-<unit>.jsonl.last`。
     **先 read / detail，再 stop**。左栏键只发消息；录完无键。
   - 抓不到：原生 `<form>` 提交 / WebSocket / service worker / 其他标签。页面钩子只认 `fetch` 与 XHR，
     上限 50 条、单条请求体 16 KB。兜底：`opencli browser <会话> bind`（当前聚焦窗活动标签）或
     `open … --window foreground`，先 `network --follow` 再让用户操作；取 body 用 `network --raw`
     （同一调用内）；仍无则请用户从 DevTools 复制 curl。
   - 参数与返回细则见 [FAMILY.md](FAMILY.md) §4。
   - 仅测试环境 / 可撤销目标可让 agent 自己点。

   取证结果落成模块的写能力：`writes: true` + `needsApproval` + `approvalDetail`（[TOOLS.md](TOOLS.md) §6）。

4. **文档 / 问用户** —— 接口文档、curl 样例都可用于确认需求；问法照 [STEPS.md](STEPS.md)，不问技术细节。

## 执行体（写工具里那一下）

写工具被点头之后，按这个顺序选：

1. **有现成 opencli 写命令** → `opencli <site> <name> …`；`--yes` 只在 `confirm === true` 时加，
   没有预览档的写不许试写（见上面四步）。
2. **没有命令、但能落配方** → `data.submit(recipe, { body })`。预览用
   `describeRecipe(recipe)`（`@dsh-workbench/shared/host`）回 `{ method, url, body }`，
   凭据只回"放在哪"；真写才调 `submit`。
3. **都不行**（签名 / WS / 多步 / 一次性 token）→ 旧的 `data.read({ kind: 'browser', script })`，
   在 `design.json` 里写 `custom: { why }`，脚本留在代码里。

三条都不自动重试：失败先回读，再决定。写完的回读用同一份 `DATASOURCE` 里的读配方（或同族命令）。

第 2 条走的是哪条传输由壳决定（页面脚本 / 宿主侧的公共通道），模块看不见也不该依赖 ——
`submit` 的返回形状、错误码、审批、回读全都一样。

**录制 → 配方**：`_record_detail` 的原文是取证。method / path / body / contentType 抄进配方；
`authorization` / `cookie` / `x-csrf-*` 这些头**丢掉**，改写成 `auth.source` + `auth.place`；
一次性 token / 签名 / 多步 → `custom`。"授权观察一次 ≠ 授权重放"：每次 `submit` 都重新审批。

## 硬纪律

- **预览**：先确认是否有 `yes` / `dryRun` / `confirm` 档；有则先走预览。`opencli inventory publish` / `inventory build`
  无预览开关，调用即真发布 / 真构建。**无预览档不许试写。**
- 要新凭据 / 新依赖 → 工程域；多步长流程先问固化，固化走 [FLOW.md](FLOW.md) 的 workflow。

## 写纪律

1. 授权观察一次 ≠ 授权重放。已看过也要再次确认（一场录制即一个周期）。
2. 写后不确定单独报，不自动重试。命令报错可能已写入：停下，先回读，再决定。
   `design.json` 的 `failure` 覆盖这一档。
3. 写要有配对的撤销 / 反操作（`follow` ↔ `unfollow`、`publish` ↔ `delete`…）。`writes[].undo` 必填；
   没有就写"没有配对，一次就是真的"（空 = 未考虑，`design check` 点名）。

## 回读

写后用同族读或卡片投影读回该格。不以"命令没报错"判成功。`writes[].readback` 记录哪条读 / 哪个字段。

## 边界

- `browser network --detail` 在本会话取不到 body（缓存落在可写根之外）。录制族不依赖它；
  手工取 body 用 `workbench_diy_eval` 的 `fetch`，或把 `OPENCLI_CACHE_DIR` 指到可写处。
- opencli 可能有三份（PATH、`~/.opencli`、隔离运行时）；以隔离运行时 `$DSH_HOME/workbench/opencli/` 为准。
- 枚举值只在 help 文本里。

## design.json：writes[]

字段七个必填、三个可空（`probeCommand` / `key + recipe` / `custom`）：

| 字段 | 行名 |
|---|---|
| `command` | 哪条写（命令 / URL + 方法） |
| `params` | 参数（必填 / 枚举 / 上限）；写"必填"需带来源 |
| `credentials` | 凭据来源 |
| `preview` | 有无预览档（无则"没有，一次就是真的"） |
| `readback` | 回读方式（哪条读 / 哪个字段） |
| `undo` | 撤销 / 删除；无则"没有配对，一次就是真的" |
| `failure` | 失败形态（含"可能已经写了"） |
| `probeCommand`（可空） | 探明 / 预览调用原文 |
| `key` + `recipe`（可空，成对） | 调用形状（配方）：写走 `data.submit` 时填，`sync` 把它和读一起生成进 `src/datasource.ts`（`DATASOURCE.<key>`）。`key` 不许和读撞，撞了 `design check` 红 |
| `custom`（可空） | 只记 `why`：配方盖不住的写（签名 / 多步 / 一次性 token），脚本仍留代码里；与 `recipe` 二选一，`design check` 记 warn |

写了 `key + recipe` 的写，预览用 `describeRecipe(DATASOURCE.<key>)`，执行用
`data.submit(DATASOURCE.<key>, overrides)`；不再把 origin / path 写进代码。

`design render` 写入 README 的 `### 写通道探明记录`（位于「数据源探明记录」与「验收」之间）。
`design check` 点名空格；无写通道的模块不写。

`params` 来源：依据 `workbench_diy_record_read` 的截图（必填红星）或契约（`--help -f json` 的 `required`）。
出现"必填"时须带来源关键词之一：`已证` / `声明` / `人证` / `契约` / `未定`，否则报 `write.params.source`。
`非必填` / `不必填` 不要求来源。判据只查是否写下来源。
