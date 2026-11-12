# 三种装法

同一份插件有三种安装位置，差别只在「进程归谁、设置放在哪」。

| 对比项 | **独立实例**（推荐） | **装进 `dsh web`** | **Desktop** |
| --- | --- | --- | --- |
| 长什么样 | 自己的 `:3081` 与 profile | 就在 `dsh web` 里多一列面板 | 就在 DeepSeek Harness.app 里多一列面板 |
| 数据 | 会话 / 项目 / 附件跟 web 共用，设置各一份 | 沿用当前会话 | 沿用 Desktop 的会话 |
| 适合 | 想并行运行、想要独立设置、愿意多折腾 | 只想多一列面板 | 平时就在 Desktop 里 |

:::tip 三种装法都要做的一步：装 OpenCLI 浏览器扩展
工作台会自己安装 opencli 的隔离运行时，但**浏览器里的 OpenCLI 扩展（opencli 的浏览器插件）需要你安装一次**，因为面板的数据
来自你浏览器里的登录状态。不安装也能进入工作台，只是依赖登录状态的面板取不到数据。步骤见下面「安装后第一次打开」。
:::

## 独立实例

与 `dsh web` 并存：它使用 `:3081`，web 使用 `:3080`。端口写在实例自己的 profile 里，
所以无论用启动器（`npx @dsh-workbench/core`）还是直接 `dsh workbench`，启动的都是同一个实例、同一个端口。

:::warning Windows 上别走这条
独立实例的启动器还是 bash 脚本，`create` 与 `setup` 在 Windows 上会报找不到 `bash`。
用 `dsh web` 的插件页或 Desktop 的插件页装，效果一样。
:::

```bash
npx @dsh-workbench/core create
```

创建完成后，每次这样启动：

```bash
npx @dsh-workbench/core
```

更换实例或端口：

```bash
npx @dsh-workbench/core --profile wb2
WORKBENCH_PORT=3091 npx @dsh-workbench/core
```

全局安装过也可以，之后不必再带 `npx`：

```bash
npm i -g @dsh-workbench/core
dsh-workbench
```

## 装进你现在的 `dsh web`

不想多一个实例、端口与进程时：

1. `dsh web` 侧栏 **Plugins → Add plugin**
2. 填 `@dsh-workbench/core`，**Install → Enable now**
3. 刷新页面

会话、项目、附件继续沿用，不会另开一份；独立实例看到的也是同一份。之后的使用方式与独立实例相同。

## 装进 Desktop（DeepSeek Harness.app）

1. 侧栏 **Plugins → Add plugin**
2. 填 `@dsh-workbench/core`，**Install → Enable now**
3. 重开窗口 / 刷新

:::warning Desktop 不需要运行 `setup`
Desktop 使用自己那份配置。运行 `setup` 会另外创建一个实例（设置与运行时各一份），而不是你要安装进去的那个；会话和项目本来就是共用的。
:::

Desktop 里个别浏览器调试能力不可用，网页浏览与录制不受影响。安装模块或更新工作台时如果遇到权限、重启提示，请退出并重新打开 Desktop。

## 安装后第一次打开

三种装法第一次打开时都会先出现「准备工作台」这一屏，并依次执行自检（共 6 步）：检查运行环境、
检查运行时、安装后台工具（opencli 的隔离运行时放在 `~/.dsh/workbench/opencli`，**不碰**你本机的
`~/.opencli`）、连接浏览器、检查 DIY 模式、连上站点。这一遍不需要你操作，等它运行完成即可；如果安装失败
（无网络或来源不可达），这一屏会给出原因和一条可以直接复制的命令，这条命令需要在终端里运行。

### 安装一次 OpenCLI 浏览器扩展

面板（以及网页浏览、录制这类浏览器工具）读取的是你浏览器里的登录状态，所以还需要在浏览器里安装一次扩展：

1. 用 Chrome / Edge / Brave / Chromium / Vivaldi 打开
   [OpenCLI（Chrome 应用商店）](https://chromewebstore.google.com/detail/opencli/ildkmabpimmkaediidaifkhjpohdnifk)，点安装
2. 到扩展页确认它已启用；用你平时登录这些平台的浏览器账号，保持浏览器开着（不用停在某个页面）
3. 回到「准备工作台」这一屏点「重试」

自检里「连接浏览器」显示已连接，说明配置成功。Desktop 的这一屏还多一个「打开浏览器」：
它会打开上次承载扩展的那个浏览器（没记住就用 Chrome），打开后自动复检。

### 自检未通过也能使用

浏览器没有连接也不影响进入工作台，点「先进入工作台」即可；但在连接成功之前，依赖登录状态的面板都取不到数据。
平台登录同样按卡片提示进行，登录一次即可。

自检提示连接了多个浏览器账号时，请先选择一个默认账号：页面上会给出可以直接复制的命令，
按它的提示操作即可。每个浏览器账号各有一个扩展实例，工作台不会自行猜测。

## 卸载

- 安装在插件页 / Desktop：在插件页移除即可。
- 独立实例：先在插件页移除，再删除 `~/.dsh/profiles/workbench` 与 `~/.dsh/workbench`（不会影响你的项目，也不会删除共用数据）。
- 浏览器里的 OpenCLI 扩展不会随工作台卸载；不再使用时，到浏览器的扩展页移除。

## 拿不准选哪个？

建议先用独立实例。它有自己的 profile、端口和进程；安装错了，删除那两个目录就能恢复原样（会话与项目跟 web 是同一份，不会被删除）。
确认要长期使用之后，再决定是否合并进 `dsh web` 或 Desktop。
