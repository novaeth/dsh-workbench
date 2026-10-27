# DIY 工具族：怎么选、怎么串

只写工具定义里没有的东西：什么时候用哪把、先后顺序、参数说明之外的坑。
逐把的参数与返回以调用时拿到的工具定义为准；模块自身的能力见 [TOOLS.md](TOOLS.md)。

## 1 选哪把

| 要做什么 | 用 |
|---|---|
| 认路、装没装、起不起得来 | `_status`（`unit` 可省）；它的「下一步」就是下一件事；带 `unit` 时 text 末尾多一条「发布出口：…」 |
| 卡片空白 / 崩了 / 读不到 | `_panel` |
| 找 opencli 命令、看命令形状 | `_recon` → `_spec`（`--help -f json` 原样） |
| kit 有什么 / 令牌叫什么 | `_components`（`bucket` / `name` 取声明；`scope: tokens` 现读 `--dsw-*` / `--wb-*`） |
| 装一次 / 只上板 | `_install` / `_show` |
| 发布前记这一版改了什么 | `_changelog`（`note` 必填；文件不在就先建） |
| 发布 | `_publish`，只在用户说「帮我发布」之后 |
| 看 / 动当前页 | `_state` · `_html` · `_find` · `_screenshot` · `_click` · `_hover` · `_type` · `_fill` · `_keys` · `_scroll` · `_wait` · `_network` · `_dialog` |
| 控制台 | `_logs_watch` → 操作 → `_logs_read` → `_logs_stop` |
| 抓「用户点了之后发了什么」 | `_record_prepare` → 用户操作 → `_record_read` → `_record_detail` → `_record_stop` |

## 2 前置

- 只在 DIY 模式的会话出现；面板得画在屏上。
- 看 / 动 / 网络 / 日志族先 `_debug_start`（审批一次），否则整族拒、零命令；收工 `_debug_stop`。
  `_pause` 只暂停看屏。不碰屏的：`_status` / `_panel` / `_components` / `_recon` / `_spec` /
  `_install` / `_show` / `_changelog` / `_publish`；`_find` / `_eval` 带 `read=` 时也不碰。
- 录制独立：`_record_prepare` 审批一次，其余不问；同时只有一场，要重来先 `_record_stop`。

## 3 参数之外的坑

- 浏览器工具都能带 `args` 原样转发；空串 / 纯空白 / 非字符串会被丢弃，词前后 trim ——
  `_fill` 清不空、`_type` 打不了纯空格。
- `ok` 只表示进程退出。事实在 `stdout`；错误体是 `{"error":{…}}`，`ok` 仍可能是 true。
  不解析、不翻译；参数不明先 `args: ['<verb>', '--help']`。
- 卡作用域：`unit` 指卡；`scope: 'card'` / `in: 'card'` / `$card` 需要它，
  `$card` 在 args 里换成 `#wb-card-<unit> .wb-card`。
- 只读线：带 `read: <地址>` 时跑在 `workbench-read` 会话，不碰屏、不认卡作用域、能代开站点；
  `_eval` 返回 `not-logged-in` 时让用户去登录。
- `_screenshot` 不给路径时写 artifacts 目录；拿不到选择器就先 `_eval` 量盒再 `clip`。
- `state` 没有 `scope`；`_select` 不存在（下拉两拍）；ref 只在一次快照内有效；
  `_dialog` 不校验 `accept|dismiss`；`_network --detail` 没有 body，要 body 用 `_eval` 的 fetch。
- 录制按 URL 去静态资源后落盘；`_record_read` 不回体，取体用 `_record_detail`；
  `_record_stop` 先读文件再另存 `.last`，所以先 read / detail 再 stop。取不到时给 DevTools 复制 curl。
  场次 15 分钟过期；过期或台账变更会停捕获、收标签。

## 4 发布

只在用户明确说「帮我发布」后调；先 `_changelog` 把这一版写进 `CHANGELOG.md`。
出口、署名、标题、安装命令由工具与审批屏处理，不用问、不用补；没写作者时审批屏显示推断的署名（市集里上次的 / 同工坊的 / 本机 git 身份），用户觉得不对就拒绝后再说，他点名了才传 `author=…`。
需要用户接管时返回 `needsUser: { step, text, command? }`：把 `text` 说给用户，等「好了」再跑；不向用户要 token。
