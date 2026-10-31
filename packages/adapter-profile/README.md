# @dsh-workbench/adapter-profile

工作台的 profile 适配器。

## 职责

- profile 创建与配置同步
- registry notebook 与 release 信息

`self-update` 属于 probe（它需要运行时种子与工具链），不在本包。

## 入口

```ts
import { createRegistryNotebook, profileCreateAction, configSyncAction } from '@dsh-workbench/adapter-profile';
```

## 边界

只处理 profile 配置、registry 与发布元数据；不复制 probe 的 runtime-seed / toolchain / platform。

## 验证

```bash
pnpm --filter @dsh-workbench/adapter-profile run build
pnpm --filter @dsh-workbench/adapter-profile run test
```
