# 三种装法

同一份插件，三种落点。差别只在「进程算谁的、设置放哪」。

| 对比项 | **独立实例**（推荐） | **装进 `dsh web`** | **Desktop** |
| --- | --- | --- | --- |
| 长什么样 | 自己的 `:3081` 与 profile | 就在 `dsh web` 里多一列面板 | 就在 DeepSeek Harness.app 里多一列面板 |
| 数据 | 会话 / 项目 / 附件跟 web 共用，设置各一份 | 沿用当前会话 | 沿用 Desktop 的会话 |
| 适合 | 想并行、想独立一份设置、想折腾 | 只想多一列面板 | 平时就在 Desktop 里 |

:::tip 三种装法都要做的一步：装 OpenCLI 浏览器扩展
工作台会自己装 opencli 的隔离运行时，但**浏览器里的 OpenCLI 扩展（opencli 的浏览器插件）要你装一次** —— 面板的数据
走你浏览器里的登录状态。没装也能进工作台，只是要靠登录状态的面板取不到数据。步骤见下面「装完第一次打开」。
:::

## 独立实例

与 `dsh web` 并存：它在 `:3081`，web 在 `:3080`。

```bash
npx @dsh-workbench/core create
```

建好之后每次这样起：

```bash
npx @dsh-workbench/core
```

换实例、换端口：

```bash
npx @dsh-workbench/core --profile wb2
WORKBENCH_PORT=3091 npx @dsh-workbench/core
```

全局装过也可以，之后不用再带 `npx`：

```bash
npm i -g @dsh-workbench/core
dsh-workbench
```

## 装进你现在的 `dsh web`

不想多一个实例、端口、进程时：

1. `dsh web` 侧栏 **Plugins → Add plugin**
2. 填 `@dsh-workbench/core`，**Install → Enable now**
3. 刷新页面

会话、项目、附件接着用，不另开一份；独立实例看到的也是同一份。之后和独立实例一样用。

## 装进 Desktop（DeepSeek Harness.app）

1. 侧栏 **Plugins → Add plugin**
2. 填 `@dsh-workbench/core`，**Install → Enable now**
3. 重开窗口 / 刷新

:::warning Desktop 不要跑 `setup`
Desktop 用自己那份配置。跑 `setup` 会另建一个实例（设置与运行时另起一份），不是你想装进的那个；会话和项目本来就是共用的。
:::

Desktop 里个别浏览器调试能力不可用；网页浏览与录制照常。装模块 / 更新工作台遇到权限或
重启提示，退出并重开 Desktop。

## 装完第一次打开

三种装法第一次打开都会先出「准备工作台」这一屏，过一遍自检：装 opencli 的隔离运行时
（落在 `~/.dsh/workbench/opencli`，**不碰**你本机的 `~/.opencli`）、检查浏览器连接、
检查 DIY 模式。这一遍不用你操作，等它跑完；装不上时（没网 / 源不通）这一屏会把原因和一条能直接
照抄的命令摆出来，那条得在终端跑。

### 装一次 OpenCLI 浏览器扩展

面板（以及网页浏览、录制这类浏览器工具）读的是你浏览器里的登录状态，所以还要在浏览器里装一次扩展：

1. 用 Chrome / Edge / Brave / Chromium / Vivaldi 打开
   [OpenCLI（Chrome 应用商店）](https://chromewebstore.google.com/detail/opencli/ildkmabpimmkaediidaifkhjpohdnifk)，点安装
2. 到扩展页确认它已启用；用你平时登录这些平台的浏览器账号，保持浏览器开着（不用停在某个页面）
3. 回到「准备工作台」这一屏点「重试」

自检里「连接浏览器」显示已连接，就说明这条路通了。Desktop 的这一屏还多一个「打开浏览器」：
它打开上次承载扩展的那个浏览器（没记住就用 Chrome），开完自动复检。

### 自检没过也能用

浏览器没连上不拦路，点「先进入工作台」照样能进；但在连上之前，要靠登录状态的面板都取不到数据。
平台登录也照卡片提示来，登录一次就够。

自检说连上了多个浏览器账号时，先选一个默认账号：页面上会给一条能直接复制的命令，
按它的提示做（多个浏览器账号各有一个扩展实例，工作台不会替你猜）。

## 卸载

- 装在插件页 / Desktop：在插件页移除。
- 独立实例：先移除，再删 `~/.dsh/profiles/workbench` 与 `~/.dsh/workbench`（它不会碰你的项目、也不会删共用数据）。
- 浏览器里的 OpenCLI 扩展不随工作台卸载；不再用就去浏览器的扩展页移除。

## 拿不准选哪个？

先用独立实例。它有自己的 profile、端口和进程，装错了删掉那两个目录就回到原样（会话与项目跟 web 是同一份，删不掉）；
确认想常驻了，再决定要不要并进 `dsh web` 或 Desktop。
