# 命令 vs 判断

机器能判定的用命令；需要判断的留给 agent。

## 用命令

| 要得到 | 命令 |
|---|---|
| 十三条判据 | `dsh-wb-module check`（`--only <判据>`） |
| 骨架 | `dsh-wb-module init --template diy` |
| 语法卫生修复 | `dsh-wb-module lint [--fix]` |
| 三张表空格 / README / 验收 | `design check` / `render` / `accept` |
| kit 成员与用法 | `workbench_diy_components`（`name=…`、`bucket=icons`）；工程域 `check --only kit` |
| dsh 原语 | `check --only primitives`（`--all` / `--file <名>` / `--json`） |
| 模块是否起得来 | `workbench_diy_status` |
| 面板运行态 | `workbench_diy_panel` |
| 安装 / 上板 | `workbench_diy_install` / `_show` / `_status` |
| 屏操作约定 | `workbench_diy_debug_start`（否则 14 把 + `logs_*` 拒） |
| 录制写请求 | `_record_prepare` → `_record_read` → `_record_stop` |
| 控制台 / 网络 | `_logs_watch` / `_read` / `_stop`；`_network`（body 用 `_eval` 的 fetch） |
| 审批声明 | `writes: true` + `needsApproval` + `approvalDetail`（`contracts` 查） |
| 长任务 | `longTasks` + `useLongTask` / `LongTaskRow`（`contracts` 查形状） |
| 外部依赖 | `manifest.env` + `libInstallCommand`（`contracts` 查） |
| 配置持久化 | `config[].persistence` |
| 联动事实 | `factsOf` + `factOfRoute` / `context` / `warmReads` / `values`（`contracts` 查形状） |
| 发布预检 | `dsh-wb-module publish`（dry run） |
| 真发布（用户确认后） | `workbench_diy_publish`（team/public/tarball/git；全门禁 + 验收闸 + 接管 + 发后核包；底层 `dsh-wb-module release`） |

## 留给 agent

- 判域（[DESIGN.md](DESIGN.md) §0）。
- 用用户语言问三张表、把决定翻译成"你会看到什么"（[STEPS.md](STEPS.md)）。
- 探测数据位置（列表页、XHR）（[DATASOURCE.md](DATASOURCE.md)）。
- 信息设计与排版（[PANEL.md](PANEL.md)）。
- 审批的安全取舍：说不清后果就不问（[TOOLS.md](TOOLS.md) §6）。
- 联动粒度：整卡 / 行 / 列（[LINKAGE.md](LINKAGE.md) §1）。
- 停止钮画不画、是否响应 signal（[TOOLS.md](TOOLS.md) §9）。

工具只给事实（状态、报错原文、预览），判断归 agent。
