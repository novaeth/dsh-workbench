# @dsh-workbench/adapter-probe

工作台的启动体检与运行时适配器。

## 职责

- preflight / doctor / browser wake
- opencli 与 pnpm 的隔离安装命令
- runtime seed、toolchain、版本范围
- self-update（依赖 runtime seed 与工具链）

## 入口

```ts
import { createPreflight, probeUnits, startSelfUpdate } from '@dsh-workbench/adapter-probe';
```

## 边界

这是唯一拥有 `runtime-seed` / `toolchain` / `platform` 的适配器；其他包不得复制这三份实现。

## 验证

```bash
pnpm --filter @dsh-workbench/adapter-probe run build
pnpm --filter @dsh-workbench/adapter-probe run test
```
