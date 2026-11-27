# DIY 工具族：怎么选、怎么串

只写工具定义里没有的东西：什么时候用哪把、先后顺序、参数说明之外的坑。
逐把的参数与返回以调用时拿到的工具定义为准；模块自身的能力见 [TOOLS.md](TOOLS.md)。

## 1 选哪把

| 要做什么 | 用 |
|---|---|
| 定位、是否已安装、能否启动 | `_status`（`unit` 可省略）；它的「下一步」就是下一件事；带 `unit` 时 text 末尾多一条「发布出口：…」 |
| 卡片空白 / 崩溃 / 读不到 | `_panel` |
| 找 opencli 命令、看命令形状 | `_recon` → `_spec`（`--help -f json` 原样） |
| kit 有什么 / 令牌叫什么 | 读声明与令牌表；只读查询面可加速，不写参数 |
| 安装一次 / 只添加到看板 | `_install` / `_show` |
| 发布 | `_publish`，只在用户说「帮我发布」之后；材料与流程见 [WIRING.md](WIRING.md) §5 |
| 查看 / 操作当前页 | `_state` · `_html` · `_find` · `_screenshot` · `_click` · `_hover` · `_type` · `_fill` · `_keys` · `_scroll` · `_wait` · `_network` · `_dialog` |
| 控制台 | `_logs_watch` → 操作 → `_logs_read` → `_logs_stop` |
| 捕获「用户点击之后发送了什么」 | `_record_prepare` → 用户操作 → `_record_read` → `_record_detail` → 按 [FLOW.md](FLOW.md) 推进到 `finish` → `_record_stop` |

## 1b 借用的七个管理工具

借用的七个管理工具分布在两个子包中：`modules_list` 在 `diy-flow`；`panels_hide`（仅隐藏一个面板，不询问）、
`modules_install` / `modules_install_bundle` / `modules_uninstall`（安装现成模块、卸载模块，均需审批）、
`long_tasks_list` / `long_tasks_stop`（查看 / 停止运行中的长任务；停止需审批）在 `diy-build`。
其余管理工具（更新、更换实现、安装与卸载插件、配置模块来源、调整面板顺序）不在 DIY 会话中；需要使用这些工具时，请回到普通会话。

## 2 前置

- 只在 DIY 模式的会话出现；面板必须显示在屏幕上。
- 看屏 / 操作 / 网络 / 日志族要先调用 `_debug_start`（审批一次），否则整族工具都会被拒绝，一条命令也无法执行；结束时调用 `_debug_stop`。
  `_debug_pause` 只暂停看屏。不碰屏的：`_status` / `_panel` / `_recon` / `_spec` /
  `_install` / `_show` / `_publish`；`_find` / `_eval` 带 `read=` 时也不碰。
- 录制独立：`_record_prepare` 审批一次，其余不问；同一时间只能有一场录制。补录时直接再次调用 `_record_prepare`，它会收起上一个窗口并开始下一段，不要先调用 `_record_stop`；结束整场才在 `finish` 节点调用 `_record_stop`。
- Desktop 上调试与日志那两族（`_debug_start` / `_debug_pause` / `_debug_resume` / `_debug_stop`、
  `_logs_watch` / `_logs_read` / `_logs_stop`）不提供 —— 没有可绑定的 Chrome 标签；页面族还在，
  但只走带站点地址的只读线：不带地址的看 / 动 / 网络会被拒绝，并说明这条下一步。

## 3 参数之外的坑

- 浏览器工具都能带 `args` 原样转发；空串 / 纯空白 / 非字符串会被丢弃，词前后 trim ——
  `_fill` 清不空、`_type` 打不了纯空格。
- `ok` 只表示进程退出。事实在 `stdout`；错误体是 `{"error":{…}}`，`ok` 仍可能是 true。
  不解析、不翻译；参数不明先 `args: ['<verb>', '--help']`。
- 卡作用域：`unit` 指卡；`scope: 'card'` / `in: 'card'` / `$card` 需要它，
  `$card` 在 args 里换成 `#wb-card-<unit> .wb-card`。
- 只读线：带 `read: <地址>` 时运行在 `workbench-read` 会话，不碰屏、不认卡作用域、能代为打开站点；
  `_eval` 返回 `not-logged-in` 时让用户去登录。
- `_screenshot` 不给路径时写 artifacts 目录；拿不到选择器就先 `_eval` 量盒再 `clip`。
- `state` 没有 `scope`；没有单独的选择工具（下拉分两步）；ref 只在一次快照内有效；
  `_dialog` 不校验 `accept|dismiss`；`_network` 的 detail 没有 body，要 body 用 `_eval` 的 fetch。
- 录制会按 URL 去除静态资源后写入；`_record_read` 不回体，取体用 `_record_detail`；
  `_record_stop` 先读文件再另存 `.last`，所以先 read / detail 再 stop。取不到时给 DevTools 复制 curl。
  场次 15 分钟过期；过期或记录变更时会停止捕获并收回标签。
