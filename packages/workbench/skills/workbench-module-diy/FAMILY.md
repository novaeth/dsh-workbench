# DIY 工具族：参数与返回

本文件是 agent 在 DIY 会话里实际拿到的工具契约。[TOOLS.md](TOOLS.md) 讲模块自身能力。

## 1 前置

- 仅在选了 DIY 模式的会话中出现（按模式，不按工作区），且面板已画在屏上。
- 看 / 动 / 网络 / 日志族需先 `workbench_diy_debug_start`（审批一次）；无约定一律拒，零命令。
  不看屏 `_debug_pause`；收工 `_debug_stop`（一并收网络与日志钩子）。
- 固定会话 `workbench`，每条带 `--window background`。`_status` / `_panel` / `_components` / `_recon` / `_spec` /
  `_install` / `_show` / `_publish` 不碰屏，无需约定；`_find` / `_eval` 带 `read=` 走只读线，也不碰。
- 录制交接（§4）独立：会话 `workbench-rec`；`_record_prepare` 审批一次，其余不问。
- **Desktop**：屏调试那几把（`debug_*`、`logs_*`、不带 `read` 的看/动）不出现；`read=` 线、
  `_record_*`、`_status` / `_panel` / `_install` / `_publish` 照旧。验收用 `read` 或录制取证，不要调 `_debug_start`。

## 2 浏览器 14 把

工具名 → opencli 子命令（前缀 `workbench_diy_`）：

`_state`→`state` · `_html`→`get html` · `_find`→`find` · `_click`→`click` · `_hover`→`hover` · `_type`→`type` ·
`_fill`→`fill` · `_keys`→`keys` · `_scroll`→`scroll` · `_wait`→`wait` · `_eval`→`eval` · `_screenshot`→`screenshot` ·
`_network`→`network` · `_dialog`→`dialog`

返回要点：`_state` = URL + 标题 + 可点元素（ref 来源）；`_html` = HTML（`--as json` 树）；`_find` =
`{matches_n, entries[]}`；`_network` = 收发包（`--follow`；body 不可取）；`_screenshot` 写文件（`clip` 裁剪）。

参数（`scope` / `in` 默认 `page`）：

- 公共：`unit?`（卡片；可省。使用 `scope: 'card'` / `in: 'card'` / `$card` 时必给，否则拒）·
  `args?: string[]`（原样接在 `opencli browser workbench <verb…>` 后）· `timeoutMs?`（默认 30000）·
  `read?: string`（只读线）。
- `scope: 'card'` 仅七把：`_find`（`--css`）、`_html`（`--selector`）、`_click` / `_hover` / `_type` / `_fill`
  （位置参数 0）、`_wait`（仅 `wait selector`，位置参数 1）。`card` = 目标挂 `#wb-card-<unit> .wb-card `。
- 只读线：带 `read: <地址>` 时跑在 `workbench-read` 会话，不要约定、不需板在屏、不认卡作用域
  （`unit` / `scope: 'card'` / `in: 'card'` / `$card` 均拒），也不要求工作区有模块。
  返回字段与屏线相同，另带 `session` / `opened`（`opened` = 曾代开站点：先比 `get url`，不在则 `open <read>` 再跑）。
  `_eval` 脚本返回 `{ ok: false, code: "not-logged-in" }` 时追加一句"去 <read> 登录"。
- `in: 'card'` 仅 `_eval`（注入卡根 `root`，脚本自行 `return`）；`clip`（CSS px）仅 `_screenshot`；
  `$card` 在任意 `args` 中替换为 `#wb-card-<unit> .wb-card`。

返回：`{ ok, exitCode, timedOut, truncated, stdout, stderr }` + `workshop` / `unit` / `verb` / `argv`
（只读线为 `session` / `opened`）；`_screenshot` 另带 `file` / `cropped` / `cropReason`。
`ok` 仅表示进程退出；事实在 `stdout`（错误体为 `{"error":{…}}`，`ok` 可能为 true）。不做 JSON 解析、
不翻译、不归一。参数不明先 `args: ['<verb>', '--help']`。
"原样"有折损：空串 / 纯空白 / 非字符串参数被丢弃，词前后 trim，stdout / stderr trim ⇒ `_fill` 无法清空、
`_type` 无法输入空格。

补充用法：`_select` 不存在，下拉两拍（点触发器 → `scope: 'page'` + `--role menuitem` 按名点）；
刷新用 `eval 'location.reload()'`；视口用 `screenshot --width/--height`。

## 3 边界

- `screenshot` 无 selector：卡图先 `eval` 量盒再 `clip`；不给路径写
  `~/.dsh/workbench/artifacts/<工作区>/<unit|page>-<时间戳>.png`，否则回 base64；裁剪块不在视口时退回整屏，
  原因在 `cropReason`。
- `state` 无 `scope`（卡内用 `find --css '$card …'`）；无右键；ref 仅一次快照内有效；`_dialog` 不校验
  `accept|dismiss`；`_network --detail` 无 body → 用 `_eval` 的 `fetch`。
- 录制会话捕获带 body：跟随 `network --follow` 只用于臂上；每 3 秒一次非跟随 `network --all --raw` 排空缓冲，
  取请求体与响应体。按 URL 去静态资源与 `data:` 后落盘。它覆盖整场，比页面钩子全（钩子只认该页 `fetch` / XHR）。
  不要换成 opencli 默认过滤（按响应 ct 白名单，会丢"按结束即回包未到"的写）。
- 其他：`_status` / `_install` / `_show`、`_components`（清单 / 类型面；`name=Button` 取声明）、
  `_panel`、`_recon`、`_spec`（opencli 命令形状，插件适用）、`_logs_*`、`_debug_*`、`_record_*`（§4）。

## 4 录制交接

| 工具 | 契约 |
|---|---|
| `_record_prepare` | 参数 `unit` / `url` / `doing`，可选 `expect:{method,urlContains}`。开窗置前（审批一次）、装浮条、臂上捕获。无 `url` 拒；跨域拒（模块 `design.json` 声明过读源时）。同时仅一场：已有场次未收工则拒且不弹审批。返回含 `wrote: false` |
| `_record_read` | 返回清单 `rows`（`index` / `key` / `at` / `method` / `url` / `status` / `ct` / `size` / `source` / `hasRequest` / `hasResponse` / `likelyWrite` / `marked`）、`hookCaught`、`capturedLines` / `capturedInSegment` / `capturedOutside`、`dropped` / `noBody` / `nav` / `captureRound`。不删行、不回体；钩子与捕获合并，同名只配一条钩子行（缺字段由捕获补）；同 method+url 两次调用都保留。`expect` 仅标 ⭐ 并置顶。可选 `waitMs`（默认 0，上限 15 分钟；超时回 `timedOut` 并发 notice） |
| `_record_detail` | 参数 `key`（原样，可含 `#2`）或 `index`（仅场次存续时）；同 key 跨轮重名，带 `at` 定位。返回请求体、响应体、请求头（可能含凭据，不写入 `design.json`）。可选 `unit`（收工后读 `shots/rec-<unit>.jsonl.last`）；可选 `maxBody`（默认 60000 字符，0 不限）。取不到时给 DevTools 复制 curl 兜底 |
| `_record_stop` | 停捕获、收标签、清状态；先读文件，原文另存 `.last`。返回可写入 `design.json` 的 `probeCommand`（仅第一条带 body；无则空串并说明）。先 read / detail，再 stop |

左栏键（`[取消]` / `[停]`）只发消息，不改页面；录完无键。场次 TTL 15 分钟；过期或台账变更会停捕获、收标签。
流程与写纪律见 [WRITES.md](WRITES.md) 步骤 3。

## 5 发布

`workbench_diy_publish`（`unit` 必填；`target` 可选 `team|public|tarball|git|local`；`version` 可选
`patch|minor|major|x.y.z`；`verify` 可选，只核不发）——只在用户说「帮我发布」后用。

一次调用做完：预检（登录 / license / git 远端 / 工作区）→ 全门禁（`build` / `check` / `design check` /
`typecheck` / `test` / `selfcheck`）→ 按出口发布 → 从出口侧核包。审批一次，问句按 `target` 变
（团队源 / 公开 npm / 安装包 / git 源码也推）。

返回 `target` / `name` / `version` / `registry?` / `file?` / `git?` / `install`（安装命令）/ `files`。
需要用户接管时返回 `needsUser: { step, text, command? }`，**不抛异常**：agent 把 `text` 说给用户、给命令，
等「好了」再跑。`step` 有 `login` / `otp` / `license` / `scope` / `name` / `git-remote` / `git-dirty` /
`git-auth` / `registry` / `acceptance`。验收没打完、源没配、包缺产物都当场拒；不向用户要 token、
不展示 `package.json`。
