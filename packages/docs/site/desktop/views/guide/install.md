# 三种装法

同一份插件，三种落点。差别只在「数据从哪来、进程算谁的」。

| 对比项 | **独立实例**（推荐） | **装进 `dsh web`** | **Desktop** |
| --- | --- | --- | --- |
| 长什么样 | 自己的 `:3081` 与 profile | 就在 `dsh web` 里多一列面板 | 就在 DeepSeek Harness.app 里多一列面板 |
| 数据 | 会话 / 项目 / 附件跟 web 共用，设置各一份 | 沿用当前会话 | 沿用 Desktop 的会话 |
| 适合 | 想并行、想独立一份设置、想折腾 | 只想多一列面板 | 平时就在 Desktop 里 |

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

## 卸载

- 装在插件页 / Desktop：在插件页移除。
- 独立实例：先移除，再删 `~/.dsh/profiles/workbench` 与 `~/.dsh/workbench`（它不会碰你的项目、也不会删共用数据）。

## 拿不准选哪个？

先用独立实例。它有自己的 profile、端口和进程，装错了删掉那两个目录就回到原样（会话与项目跟 web 是同一份，删不掉）；
确认想常驻了，再决定要不要并进 `dsh web` 或 Desktop。
