# @dsh-workbench/core

工作台本体：一个 **DeepSeek Harness 插件**，给 dsh 换一层外壳 —— 左栏项目与会话、
中间常驻对话、右侧一列实时数据面板。dsh 本体一行不改，装与不装都只影响你自己的这份实例。
同仓的另外三个包（`shared` / `module-tools` / `module-hello`）是给**模块作者**的库与样本，
终端用户只会直接装这一个。

> 只想把它用起来？先看根目录的 [README](../../README.md)：三种装法、界面长什么样、
> 适合谁。这一份讲**装好之后**的事：命令行、数据落在哪、出问题怎么查、从源码怎么跑。

## 装

| 装法 | 命令 | 得到什么 |
|---|---|---|
| 独立实例（推荐） | `npx @dsh-workbench/core create` | 自己的 profile、`:3081`、独立进程；会话 / 项目 / 附件跟 web 共用 |
| 装进现有 `dsh web` | 侧栏 Plugins → Add plugin → `@dsh-workbench/core` → Install → Enable now → 刷新 | 当前实例多一列面板，会话不变 |
| 装进 Desktop | 同上，装完重开窗口 | Desktop 里多一列面板 |

独立实例分两步：先建 profile，再起工作台。

```bash
npx @dsh-workbench/core create                    # 交互式：问来源、名字、复制什么
npx --yes @dsh-workbench/core@latest setup        # 或非交互：建默认的 workbench，可重复跑
npx @dsh-workbench/core                           # 起 :3081
```

`create` 有 `dsh web` 就拿它当模板，并问要不要复制设置；会话、项目、附件本来就共用，
不用复制。本机一个 profile 都没有时，用 dsh 出厂的 web 模板建一个空的。脚本 / CI 里直接给参数：

```bash
npx --yes @dsh-workbench/core@latest setup --from web --profile wb2
npx @dsh-workbench/core --profile wb2
```

全局装过就不用 `npx`：`npm i -g @dsh-workbench/core` 之后直接 `dsh-workbench`。

从 1.0.0 之前的独立实例升上来：旧数据**不会**自动并。先退出所有 dsh，再跑：

```bash
dsh-workbench migrate          # 切共用根 + 并旧会话/项目/附件
dsh-workbench migrate --force  # 已经迁过一次、想再补并一次
```

只会补缺、不覆盖；旧目录保留。npx 用户把 `dsh-workbench` 换成 `npx @dsh-workbench/core`。

更新后也可以直接在模块市场的「工作台」那一行点「迁移旧数据」；和命令行是同一条迁移逻辑，不需要自己敲命令。
这条提示是非硬性的：也可以点「不再提醒」把它收起——不会删旧数据，旧项目仍然留在旧目录，以后需要时仍可跑 `dsh-workbench migrate`。

先决条件（就三条）：

| 要有 | 为什么 |
|---|---|
| `dsh` ≥ 0.2.1-rc.2 | 本体。更旧的会被拒绝：`engines.dsh` 声明了下限，老到不认这个字段的 dsh 由启动器当场拒绝并给升级命令 |
| Node + pnpm | dsh 的 `plugin` 子命令转发给 pnpm；没有 pnpm 会报 `dsh: pnpm was not found` |
| 可选：跑过一次 `dsh web` | 想继承它的设置 / 项目时。只建工作台不需要 |

## 命令行

| 命令 | 作用 |
|---|---|
| `dsh-workbench create` | 交互式新建一个工作台实例 |
| `dsh-workbench setup` | 幂等建默认的 `workbench` profile；配 `--from` 建别的名字 |
| `dsh-workbench migrate` | 把旧实例的会话 / 项目 / 附件并到共用数据根（`--force` 可重跑） |
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

装进 `dsh web` 或 Desktop 时没有启动命令：它们用自己那一份 profile，工作台只是其中一层插件。

## 包里有什么

`package.json` 的 `files` 是白名单 —— 漏一项的症状是「仓库里怎么都对，装出去那台静默什么也没做」。

| 路径 | 是什么 |
|---|---|
| `dist/host/**` | 宿主侧入口（`exports["."]`）与类型；构建产物，不进 git |
| `client.js` | 浏览器侧 bundle，dsh 客户端按 `dsh.client` 加载 |
| `cordis.patch.yml` | 把自己插进 profile 组合图的补丁（装载） |
| `preset/diy.patch.yml` | 「工作台 DIY 模式」的 preset；由 `scripts/gen-diy-preset.mjs` 从 dsh 出厂那份 `standard.patch.yml` 派生（生成后提交，selfcheck 盯过期） |
| `profile/` | 出厂 profile 模板：可写根那一行（启动器 `--patch` 用，seed 也抄进 profile） |
| `skills/` | 模块 DIY 指引，装好后挂给 agent；漏了不报错，只是 agent 不知道要怎么做模块 |
| `bin/` | `dsh-workbench` 启动器、隔离 opencli 的入口 |
| `scripts/` | 随包出货的脚本：`seed-profile.sh` / `seed-workshop.sh` / `create-workbench.mjs` / `clone-profile.mjs` / `share-data-root.mjs` |

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
只有设置与插件各一份。旧版本分过家的实例，启动时**不会**自动并；先退出所有 dsh，再跑
`dsh-workbench migrate`（只补不覆盖，旧目录保留）。

设置只有一份，写在哪都看得见：

- 独立实例：`:3081` → Settings，落进 `profiles/<名字>/cordis.patch.yml`，每一行都改得动。
- 想用 `dsh web` 已经配好的行：`:3081` → `Meta+,` → 「工作台设置」→「配置同步」→
  选来源 → 勾行 → 同步，即时生效。只同步显式配过的行，同 id 内容不同默认不覆盖；
  web 后来改的不会自动过来，再打开这一页拉一次即可。

## 日常

| 想做什么 | 怎么做 |
|---|---|
| 起工作台 | `npx @dsh-workbench/core` |
| 换端口 | `WORKBENCH_PORT=3091 npx @dsh-workbench/core` |
| 升级 | 重跑一次 `npx --yes @dsh-workbench/core@latest setup`（幂等），然后重启工作台。工坊工具链会在下一次启动时自动跟到同代，不必手动删工坊 |
| 重建 profile | `mv ~/.dsh/profiles/workbench ~/.dsh/profiles/workbench.bak`，再跑一次 `setup` |
| 换左栏 | 设置 → 工作台设置 → 会话列表：默认官方；切完自动刷新页面生效（从旧版升上来第一次要重启） |
| 从 `dsh web` 同步设置 | 设置 → 工作台设置 → 配置同步 → 选来源 → 勾行 → 同步 |
| 装模块 | `:3081` 的「工作台模块市场」，或让 agent 装 |
| 彻底不用了 | 删 `~/.dsh/profiles/workbench` 与 `~/.dsh/workbench` 两个目录（会话 / 项目 / 附件在 `~/.dsh` 下，不跟着删） |

外壳本身**零业务模块**：右侧面板装什么有什么。装进 `dsh web` / Desktop 时少一条命令 ——
没有独立端口与进程，改用它们自己的插件页装模块。

⚠️ **别在 Settings → 插件里把 `@dsh-workbench/core` 关掉**：关掉 = 那份 bundle patch 整份不再
应用，界面退化成原版 `dsh web`（左栏回来、右侧面板消失），数据一个都不丢。拨回来就恢复；
进不去设置页按 `Meta+,`。进程已经退过的话，启动器读到「bundle 没被选中」会直接拒绝启动并给
一条命令：`./bin/dsh-workbench setup`（幂等，把这一项补回 `dsh.profile.bundles`）。
别当成故障去重建 profile。

## 首次打开会自己做什么

- **装 opencli 的隔离运行时**：落在 `~/.dsh/workbench/opencli/`，靠改 `HOME` 与插件目录分开，
  **完全不碰**你本机的 `~/.opencli`。装不上时（没网 / 源不通）失败态里有一条能直接照抄到终端
  的命令 —— 那条得在终端跑，工作台自己发起的命令带文件沙箱。
- **要面板有数据，得登录对应平台**：卡片上点「去登录 ↗」，登完切回来按「重试」
  （刻意不做自动重试 —— 登录什么时候完成我们不知道）。
- 没登录 / 装不上都是**明确的失败态**，不留白屏让人猜。

## 常见问题

| 症状 | 原因 / 怎么办 |
|---|---|
| `setup` 报 `scripts/seed-profile.sh: Permission denied` | 0.1.6 的缺陷（发出去的包丢了脚本可执行位）。应急：`chmod +x ~/.npm/_npx/*/node_modules/@dsh-workbench/core/{scripts/seed-profile.sh,bin/opencli-isolated}` 后重跑；0.1.7 起已修 |
| 页面白屏、只显示 `Failed to load plugins` | 有插件往未声明的槽注册，抛错即整个 entry 激活失败。看控制台里 `[dsh-workbench] apply failed` |
| 左栏是出厂样子、右边没有面板 | 工作台插件在 Settings 里被关了（见上一节 ⚠️）。重启后启动器不会再让你拿到这种实例 |
| 面板一直空着 | 多半是没登录平台（见上）；或这个工作区的 git `origin` 不指向它要读的平台 |
| 打开面板 / 按刷新要等 5–8 秒 | 正常：opencli 每次调用有固定约 5 秒开销（起浏览器会话）。没有缓存，数据一律实时 |
| 体检说「检测浏览器通道 · 没连上」，可面板照样能用 | 本机全局 opencli 与隔离运行时版本不一致，daemon 被顶成对方那版；下一条浏览器命令会自动把它重启回来，复检后改回「已连接」 |
| Desktop 里体检一直「没连上」 | 浏览器没开。预检页有「打开浏览器」，点了才开上次承载扩展的那个（没记住就用 Chrome），开完自动复检；点了会切到 Chrome 前台（冷启动抢焦点，静默做不到）。仍连不上多半是扩展没装或被禁用 |
| 模型列表里只有出厂的几个、没有自己配的供应商 | 新 profile 不带设置。设置 → 工作台设置 → 配置同步 → 勾 `llm-` 那几行 → 同步 |
| 配置同步里某行说 `@x 还没装` | 那一行点名的包不在这个 profile 的 `node_modules` 里：`dsh plugin --profile workbench add @x`（或在模块市场装），装完 dsh 会自行重组，它报 `restartReason` 时才重启 |
| 启动被拒，说 dsh 太旧 | `npm i -g @deepseek-ai/dsh@latest`，装完重启工作台 |
| 左栏没有「工作台DIY」，模式下拉里也没有「工作台 DIY 模式」 | 多半是 dsh 太旧：DIY preset 从 dsh 0.2.1-rc.2 的 preset 清单派生，旧一代挂不起来，而 dsh 的模式选择器只列挂得起来的 ⇒ 整个不见且不报错。启动体检会把它摆出来并给升级命令；自己核对就看 dsh 的 设置 → 「Agent presets」那一行的红标与原因 |
| 在自己项目里开了 DIY，面板却说没找到模块 | 模块跟**这条会话的工作区**走，不跟工坊走：① 那个工作区要有一个在 `package.json` 里声明 `dsh.workbench` 的包；② 从工坊带过去的，把模块目录挪 / 拷进那个仓库；③ 旧截图不迁移（新的落在 `~/.dsh/workbench/artifacts/<工作区>/`）。细节见工作台模块指引 |

## 从源码跑

```bash
git clone git@github.com:novaeth/dsh-workbench.git
cd dsh-workbench/packages/core
pnpm install
pnpm run dev     # 监听 src/**（重建产物）+ 起工作台 :3081；改完不用重启、不用刷新
pnpm run check   # 门禁：整仓那一套（= pnpm -w run check）
./bin/dsh-workbench   # 只想起工作台、不需要监听改动时用它
```

`pnpm run dev` 先替你把 profile 保障成**本仓这份**（不是源上那份），等首次构建完成再起实例；
`:3081` 已经有实例在跑时就只监听、不重复起第二个。浏览器半侧重建立 `client.js` 后由 dsh 的
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
| 模块的构建与十三条判据 | [module-tools](../module-tools/README.md) |
| 共享包（契约、哑组件、宿主工具） | [shared](../shared/README.md) |
| 最小模块样本 | [module-hello](../module-hello/README.md) |
| 环境、门禁、提交 | [CONTRIBUTING.md](../../CONTRIBUTING.md) |
