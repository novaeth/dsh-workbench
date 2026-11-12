# @dsh-workbench/core

工作台本体：一个 **DeepSeek Harness 插件**，给 dsh 换一层外壳 —— 左栏项目与会话、
中间常驻对话、右侧一列实时数据面板。dsh 本体一行不改，装与不装都只影响你自己的这份实例。
同仓的其他包（`shared` / `module-tools` / `module-hello` / `adapter-*` / `adapters-default`）是给**作者与实现者**的库、样本与适配器，
终端用户只会直接装这一个。

> 只想把它用起来？先看根目录的 [README](../../README.md)：三种装法、界面长什么样、
> 适合谁。这一份讲**安装完成之后**的事：命令行、数据落在哪、出问题怎么查、从源码怎么跑。

## 装

| 装法 | 命令 | 得到什么 |
|---|---|---|
| 独立实例（推荐，macOS / Linux） | `npx @dsh-workbench/core create` | 自己的 profile、`:3081`、独立进程；会话 / 项目 / 附件跟 web 共用 |
| 装进现有 `dsh web` | 侧栏 Plugins → Add plugin → `@dsh-workbench/core` → Install → Enable now → 刷新 | 当前实例多一列面板，会话不变 |
| 装进 Desktop | 同上，装完重开窗口 | Desktop 里多一列面板 |

> **Windows 上走第二、三行**：独立实例那条路的启动器还是 bash 脚本，
> `npx @dsh-workbench/core create` 与 `setup` 在 Windows 上会报找不到 `bash`。
> `dsh web` 的插件页或 Desktop 的插件页装出来的效果一样。

独立实例分两步（macOS / Linux）：先建 profile，再起工作台。

```bash
npx @dsh-workbench/core create                    # 交互式：问来源、名字、复制什么
npx --yes @dsh-workbench/core@latest setup        # 或非交互：建默认的 workbench，可重复跑
npx @dsh-workbench/core                           # 起 :3081
```

`create` 会以 `dsh web` 为模板，并询问是否复制设置。会话、项目、附件本来就是共用的，不需要复制。如果本机没有任何 profile，就用 dsh 出厂的 web 模板新建一个空的。在脚本或 CI 里可以直接传参数：

```bash
npx --yes @dsh-workbench/core@latest setup --from web --profile wb2
npx @dsh-workbench/core --profile wb2
```

全局装过就不用 `npx`：`npm i -g @dsh-workbench/core` 之后直接 `dsh-workbench`。

从 1.0.0 之前的独立实例升级上来时，旧数据**不会**自动合并。请先退出所有 dsh，再执行：

```bash
dsh-workbench migrate          # 切共用根 + 并旧会话/项目/附件
dsh-workbench migrate --force  # 已经迁过一次、想再补并一次
```

迁移只补充缺少的部分，不覆盖已有内容，旧目录会保留。用 npx 的用户请把 `dsh-workbench` 换成 `npx @dsh-workbench/core`。

更新后，也可以直接在模块市场的「工作台」那一行点「迁移旧数据」。它和命令行走的是同一套迁移逻辑，不需要自己敲命令。
这只是一条提示，点「不再提醒」可以收起；它不会删除旧数据，旧项目仍留在旧目录，以后需要时还可以执行 `dsh-workbench migrate`。

先决条件：

| 要有 | 为什么 |
|---|---|
| `dsh` ≥ 0.2.2-rc.2 | 本体。版本更旧会被拒绝：`engines.dsh` 声明了最低版本；如果 dsh 老到不认识这个字段，启动器会当场拒绝并给出升级命令 |
| Node + pnpm | dsh 的 `plugin` 子命令转发给 pnpm；没有 pnpm 会报 `dsh: pnpm was not found` |
| 可选：跑过一次 `dsh web` | 想继承它的设置 / 插件时。只建工作台不需要 |

还有一件只需**安装一次**的事：**OpenCLI 浏览器扩展**（opencli 的浏览器插件）。工作台会自己安装 opencli 的隔离运行时，但扩展必须在浏览器里安装，因为面板要读取你浏览器里的登录状态。Chrome / Edge / Brave / Chromium / Vivaldi 都支持。请从 [Chrome 应用商店](https://chromewebstore.google.com/detail/opencli/ildkmabpimmkaediidaifkhjpohdnifk) 安装并启用，安装后保持浏览器打开。不安装也能进入工作台，只是依赖登录状态的面板取不到数据；细节见下面「首次打开会自己做什么」。

## 命令行

| 命令 | 作用 |
|---|---|
| `dsh-workbench create` | 交互式新建一个工作台实例 |
| `dsh-workbench setup` | 幂等建默认的 `workbench` profile；配 `--from` 建别的名字 |
| `dsh-workbench migrate` | 把旧实例的会话 / 项目 / 附件并到共用数据根（`--force` 可重新运行） |
| `dsh-workbench` | 起工作台（默认端口 `:3081`，其余参数透传给 `dsh web`） |
| `dsh-workbench --profile <名字>` | 起指定实例 |
| `dsh-workbench setup --from <来源> --profile <新名>` | 以某个现有 profile 为模板建一个 |
| `--no-settings` | 不复制来源的设置（默认复制 `--from` 那份里改已有插件的行） |
| `dsh-workbench --help` | 用法；其余参数透传给 `dsh web` |

环境变量：

| 变量 | 默认 | 作用 |
|---|---|---|
| `WORKBENCH_PORT` | `3081` | 端口；`dsh web` 默认 `:3080`，两边可以同时开 |
| `WORKBENCH_PROFILE` | `workbench` | 用哪个 profile（等价于 `--profile`） |
| `DSH_HOME` | `~/.dsh` | dsh 的数据根；会话 / 项目 / 附件都在这里，工作台跟 web 共用 |
| `DSH_WORKBENCH_HOME` | `$DSH_HOME/<profile>` | 工作台运行时根（opencli 隔离运行时、工坊、模块市场、自更新） |

独立实例的端口写在**它自己的 profile** 里（`setup` 会写进 `~/.dsh/profiles/<名字>/cordis.patch.yml`），因此与由谁启动无关：无论用 `dsh-workbench` 还是直接 `dsh workbench` 启动，都是 `:3081`。
要临时换端口，`--port` 与 `WORKBENCH_PORT` 仍然优先。从旧版本（macOS / Linux）升级上来的实例，重新执行一次
`dsh-workbench setup` 就会补上这一行（幂等，不会覆盖你已经改过的行）。

装进 `dsh web` 或 Desktop 时没有启动命令：它们用自己那一份 profile，工作台只是其中一层插件。

## 包里有什么

`package.json` 的 `files` 是白名单 —— 漏一项的症状是「仓库里怎么都对，装出去那台静默什么也没做」。

| 路径 | 是什么 |
|---|---|
| `dist/host/**` | 宿主侧入口（`exports["."]`）；构建产物，不进 git |
| `dist/types/**` | 类型声明（`exports` 的 `types` 指向这里）；构建产物，不进 git |
| `client.js` | 浏览器侧 bundle，dsh 客户端按 `dsh.client` 加载 |
| `cordis.patch.yml` | 把自己插进 profile 组合图的补丁（装载） |
| `profile/` | 出厂 profile 模板：可写根那一行（启动器 `--patch` 用，seed 也抄进 profile） |
| `skills/` | 模块 DIY 指引，安装完成后提供给 agent；漏掉也不会报错，只是 agent 不知道如何创建模块 |
| `bin/` | `dsh-workbench` 启动器、隔离 opencli 的入口 |
| `scripts/` | 随包出货的脚本：`seed-profile.sh` / `seed-workshop.sh` / `create-workbench.mjs` / `clone-profile.mjs` / `share-data-root.mjs` / `patch-blocks.mjs` / `profile-dsh-layer.mjs` |
| `icon.svg` | 插件图标（dsh 插件页用） |

「工作台 DIY 模式」不在这个表里：**启动时现场派生**，没有生成物 —— `src/shared/api/host/diy-preset.ts` 从本次 dsh 的 `standard` preset 克隆出插件表、叠加三处差分并注册；纯规则在 `../shared/src/host/diy-preset.ts`。dsh 加工具 / 改行时它自动跟上。

## 数据落在哪

| 内容 | 位置 |
|---|---|
| profile（设置、`node_modules`、`cordis.patch.yml`） | `~/.dsh/profiles/<名字>` |
| 会话、项目列表、附件 | `~/.dsh/{sessions,storages,attachments}` —— 跟 `dsh web` / Desktop **共用一份** |
| 工作台运行时（opencli 隔离运行时、工坊、模块市场、自更新日志） | `~/.dsh/workbench/**`；别的 profile 是 `~/.dsh/<名字>/**` |
| 面板与模块配置 | `~/.dsh/workbench/workspaces/**` |
| API 凭据 | `~/.dsh/.credentials.yaml` —— 它与 `dsh web` **有意共用**，一台机器一把 key |
| DIY 工坊依赖安装日志 | `~/.dsh/workbench/seed.log` |

独立实例**只分 profile，不分数据根**：会话、项目、附件跟 `dsh web` 和 Desktop 是同一份，
只有设置与插件各一份。旧版本中数据目录曾经独立的实例，启动时**不会**自动合并；请先退出所有 dsh，再执行
`dsh-workbench migrate`（只补充缺失内容，不覆盖，旧目录保留）。

设置只保存在 profile 里（与会话、项目不同，不共用）：

- 独立实例：在 `:3081` 打开 Settings，设置写入 `profiles/<名字>/cordis.patch.yml`，每一行都可以修改。
- 想沿用 `dsh web` 里已经配好的条目：`:3081` → `Meta+,` → 「工作台设置」→「配置同步」，
  选择来源、勾选条目并同步，立即生效。只会同步显式配置过的条目；同 id 内容不同时默认不覆盖。
  web 之后修改的内容不会自动同步，重新打开这一页同步一次即可。

## 日常

| 想做什么 | 怎么做 |
|---|---|
| 起工作台 | `npx @dsh-workbench/core` |
| 换端口 | `WORKBENCH_PORT=3091 npx @dsh-workbench/core` |
| 升级 | 市场里「工作台」那一行走自更新，或重新执行一次 `npx --yes @dsh-workbench/core@latest setup`（幂等），然后重启工作台。自更新换完链接会按新依赖重装 profile，旧版装进去的 dsh 包会被清掉；工坊工具链会在下次启动时自动更新到同一版本，不需要手动删除工坊 |
| 升级 dsh 之后 | 先升工作台、再升 dsh。旧版装出来的 profile 里还留着 dsh 插件层，新启动器会在起进程前拒绝并提示重装一次（`setup` 或 `dsh plugin --profile <名字> add @dsh-workbench/core`）；重装会按新依赖把旧 dsh 包清掉 |
| 重建 profile | 先执行 `mv ~/.dsh/profiles/workbench ~/.dsh/profiles/workbench.bak`，再执行一次 `setup` |
| 换左栏 | 设置 → 工作台设置 → 会话列表：默认官方；切换后会自动刷新页面生效（从旧版本升级上来的实例，第一次需要重启） |
| 从 `dsh web` 同步设置 | 设置 → 工作台设置 → 配置同步 → 选来源 → 勾行 → 同步 |
| 安装模块 | 打开 `:3081` 的「工作台模块市场」，或让 agent 安装 |
| 不再使用 | 删除 `~/.dsh/profiles/workbench` 与 `~/.dsh/workbench` 两个目录（会话、项目、附件在 `~/.dsh` 下，不会跟着删除） |

外壳本身**不带业务模块**：右侧面板安装什么就有什么。装进 `dsh web` / Desktop 时没有启动命令，
因为它们没有独立端口与进程，改为在它们自己的插件页里安装模块。

⚠️ **不要在 Settings → 插件里关闭 `@dsh-workbench/core`**：关闭后，那份 bundle patch 整份不再生效，
界面退化成原版 `dsh web`（左栏恢复、右侧面板消失），但数据不会丢失。重新启用即可恢复；
如果进不去设置页，按 `Meta+,`。进程已经退出过的话，启动器读到「bundle 没被选中」会直接拒绝启动，
并给出一条命令：`./bin/dsh-workbench setup`（幂等，把这一项补回 `dsh.profile.bundles`）。
不要把它当成故障去重建 profile。

## 首次打开会自己做什么

- **安装 opencli 的隔离运行时**：它放在 `~/.dsh/workbench/opencli/`，通过修改 `HOME` 与插件目录与本机环境隔离，
  **完全不碰**你本机的 `~/.opencli`。安装失败时（无网络或来源不可达），失败提示里会有一条可以直接复制到终端
  执行的命令；这条命令需要在终端里运行，因为工作台自己发起的命令带有文件沙箱。
- **浏览器扩展需要你安装一次**：`~/.dsh/workbench/opencli/` 里没有扩展，opencli 依赖浏览器里的
  OpenCLI 扩展获取登录状态。自检里「连接浏览器」未连接时会给出商店链接；安装并启用后
  保持浏览器打开，再回到「准备工作台」点「重试」。Desktop 里还可以点「打开浏览器」。
- **要让面板有数据，需要登录对应平台**：在模块上点击「去登录 ↗」，完成后切回来点击「重试」。
  工作台刻意不做自动重试，因为无法确定登录何时完成。
- 没登录或安装失败都会显示**明确的失败状态**，不会留下白屏让人猜测。

## 常见问题

| 症状 | 原因 / 怎么办 |
|---|---|
| `setup` 报 `scripts/seed-profile.sh: Permission denied` | 0.1.6 的缺陷（发出去的包丢了脚本可执行位）。应急：`chmod +x ~/.npm/_npx/*/node_modules/@dsh-workbench/core/{scripts/seed-profile.sh,bin/opencli-isolated}` 后重新运行；0.1.7 起已修 |
| 页面白屏、只显示 `Failed to load plugins` | 有插件向未声明的槽注册，抛错会导致整个 entry 激活失败。检查控制台里的 `[dsh-workbench] apply failed` |
| 左栏是出厂样子、右边没有面板 | 工作台插件在 Settings 里被关了（见上一节 ⚠️）。重启后启动器不会再让你拿到这种实例 |
| 面板一直空白 | 多半是尚未登录平台（见上）；也可能是这个工作区的 git `origin` 不指向它要读取的平台 |
| 打开面板 / 按刷新要等 5–8 秒 | 正常：opencli 每次调用约有 5 秒固定开销（启动浏览器会话）。没有缓存，数据一律实时 |
| 自检说「连接浏览器 · 还没连上」/ 面板取不到数据 | 扩展未安装或未启用：从 [Chrome 应用商店](https://chromewebstore.google.com/detail/opencli/ildkmabpimmkaediidaifkhjpohdnifk) 安装 OpenCLI，在扩展页确认已启用，保持浏览器打开，再回到「准备工作台」点「重试」。有多个浏览器账号时，会要求先选择默认账号：按页面上给出的命令操作 |
| 启动检查说「连接浏览器 · 还没连上」，但面板照常可用 | 本机全局 opencli 与隔离运行时版本不一致，daemon 被替换成了另一方的版本；下一条浏览器命令会自动将其重启，复检后会恢复为「已连接」 |
| Desktop 里启动检查一直「没连上」 | 浏览器没有打开。「准备工作台」有「打开浏览器」，点击后才会打开上次承载扩展的那个浏览器（没记住就用 Chrome），打开后自动复检；点击会把 Chrome 切到前台（冷启动需要抢焦点，无法静默完成）。仍然连不上，多半是扩展未安装或被禁用 |
| 准备页停住、提示「命令行没有返回」 | 命令已发出但结果没有返回（宿主侧的子进程没有启动，常见于 Windows 沙箱残留的锁文件）。请完全退出工作台（托盘图标也要退出），清掉系统临时目录里以 `dsh-` 开头的残留文件，再重新打开；如果反复出现，请升级 dsh 客户端。重装 Node / npm / pnpm 无济于事，工具本身没有问题 |
| 模型列表里只有出厂的几个、没有自己配的供应商 | 新 profile 不带设置。设置 → 工作台设置 → 配置同步 → 勾选 `llm-` 那几行 → 同步 |
| 配置同步里某行说 `@x 还没装` | 那一行点名的包不在这个 profile 的 `node_modules` 里：执行 `dsh plugin --profile workbench add @x`（或在模块市场安装）。安装完成后 dsh 会自行重组；等它报告 `restartReason` 时再重启 |
| 启动被拒，提示 dsh 太旧 | 执行 `npm i -g @deepseek-ai/dsh@latest`，安装完成后重启工作台 |
| 升级 dsh 之后启动失败，日志只有 `N required plugins did not activate` | profile 里的 dsh 插件层是旧版工作台装进去的：dsh 的兼容性预检会逐个停用它们，`tools` / `sessions` / `agents` 就没人提供。重新安装一次工作台（`setup` 或 `dsh plugin --profile <名字> add @dsh-workbench/core`），pnpm 会按新依赖把旧 dsh 包清掉，再重启 |
| 左栏没有「工作台DIY」，模式下拉里也没有「工作台 DIY 模式」 | DIY preset 在启动时从本次 dsh 的 `standard` 派生：如果 dsh 太旧（没有 `loader` / `agentPresets` 的注册入口），或 `standard` 的行发生了变化，就无法派生。dsh 的模式选择器只列出能挂载的项，因此整个入口会消失且不报错。启动检查会指出这一点并给出升级命令；要自行核对，可以查看 dsh 的 设置 → 「Agent presets」那一行的红标与原因 |
| 在自己项目里开了 DIY，面板却说没找到模块 | 模块跟随**这条会话的工作区**，不跟随工坊：① 该工作区的某个 `package.json` 要声明 `dsh.workbench`；② 从工坊带过去的模块，需要把模块目录移动或复制到那个仓库；③ 旧截图不会迁移（新的放在 `~/.dsh/workbench/artifacts/<工作区>/`）。细节见工作台模块指引 |

## 从源码跑

```bash
git clone git@github.com:novaeth/dsh-workbench.git
cd dsh-workbench/packages/core
pnpm install
pnpm run dev     # 监听 src/**（重建产物）+ 起工作台 :3081；改完不用重启、不用刷新
pnpm run check   # 门禁：整仓那一套（= pnpm -w run check）
./bin/dsh-workbench   # 只想起工作台、不需要监听改动时用它
```

`pnpm run dev` 先把 profile 保障成**本仓这份**（不是源上那份），等首次构建完成再起实例；
`:3081` 已经有实例运行时就只监听、不重复起第二个。浏览器半侧重建立 `client.js` 后由 dsh 的
HMR 热换插件（不刷新页面），宿主半侧按模块路径热重载。

`cordis.patch.yml` 与 `package.json` 的 bundle 清单也不用重启（`dsh-hmr` 变了就重组）；
要重启的是改 `vite.config.ts`。

`pnpm run check` 与 `pnpm release` 的闸是同一条链，别在包内另串一份短的 —— 会漏 lint、
文档与模块判据。环境、提交与门禁纪律见 [CONTRIBUTING.md](../../CONTRIBUTING.md)。

## 相关文档

| 想了解 | 读 |
|---|---|
| 装法、界面、适合谁 | [根 README](../../README.md) |
| 架构、两个运行时、槽位、数据通路、门禁 | [ARCHITECTURE.md](../../ARCHITECTURE.md) |
| 写一个模块 | [DIY 指引](skills/workbench-module-diy/SKILL.md) |
| 模块的构建与十四条判据 | [module-tools](../module-tools/README.md) |
| 共享包（契约、哑组件、宿主工具） | [shared](../shared/README.md) |
| 最小模块样本 | [module-hello](../module-hello/README.md) |
| 环境、门禁、提交 | [CONTRIBUTING.md](../../CONTRIBUTING.md) |
