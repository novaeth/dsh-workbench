# @dsh-workbench/adapter-runtime

工作台运行时的强耦合适配器组合：opencli、browser、data。

## 模块

```text
src/cli/      opencli 命令、隔离运行时、窗口参数
src/browser/  页面读取与查找
src/data/     DataReader（http / browser / command）
```

三者共享命令解析、隔离路径、session 和错误形状，所以放在同一个包内，但保持独立目录。

## 入口

```ts
import { createDataReader, browserRead, createOpencli } from '@dsh-workbench/adapter-runtime';
```

## 边界

只依赖 `@dsh-workbench/shared`；不依赖 supply、profile、probe，也不依赖 core 内部。
`src/data` 可以依赖 `src/browser`，`src/browser` 可以依赖 `src/cli`，反向禁止。

## 验证

```bash
pnpm --filter @dsh-workbench/adapter-runtime run build
pnpm --filter @dsh-workbench/adapter-runtime run test
```
