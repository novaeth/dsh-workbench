# @dsh-workbench/adapter-runtime

工作台运行时的强耦合适配器组合：opencli、browser、data。

## 模块

```text
src/foundation/  命令解析、隔离路径、session、错误形状
src/cli/         opencli 命令、隔离运行时、窗口参数
src/browser/     页面读取与查找
src/data/        DataReader（http / browser / command / recipe / 批量 recipe / 公共通道）
src/git/         git 读端口
src/libs/        本机库读端口
src/command/     命令面读端口
channel/         随包出货的 opencli 插件（workbench fetch / workbench send）
```

`foundation` 是最底层；`browser` / `cli` / `data` / `git` / `libs` / `command` 同层，
共享 `foundation` 的命令解析、隔离路径、session 和错误形状，所以放在同一个包内，但保持独立目录。

`channel/` 不是源码目录：它是**资产**，不进 `tsc`、不进 barrel，只被复制进隔离运行时
（`plugins-npm` → peer symlink → `opencli plugin install`）。`cookie` / `cookieValue` 两种凭据来源
的配方会先走它，跑不起来就回落页面脚本；`endpoint` / `meta` / `global` / `storage` 永远走页面脚本。

## 入口

```ts
import { createDataReader, browserRead, createOpencli } from '@dsh-workbench/adapter-runtime';
import { scriptOf, scriptOfMany, describeRecipe } from '@dsh-workbench/shared/host';
```

## 边界

只依赖 `@dsh-workbench/shared`；不依赖 supply、profile、probe，也不依赖 core 内部。
`src/data` 可以依赖 `src/browser`，`src/browser` 可以依赖 `src/cli`，反向禁止。

## 验证

```bash
pnpm --filter @dsh-workbench/adapter-runtime run build
pnpm --filter @dsh-workbench/adapter-runtime run test
```
