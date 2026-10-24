# @dsh-workbench/adapters-default

工作台默认适配器集。

## 职责

- 把四个实现包组成一个普通依赖集，暴露六个逻辑适配器 id
- 让 `@dsh-workbench/core` 只依赖本包，就能获得默认行为
- 不把适配器变成独立 dsh 插件，也不需要用户额外 enable

## 入口

```ts
import { DEFAULT_ADAPTERS } from '@dsh-workbench/adapters-default';
```

## 默认集合

```text
opencli · browser · supply · profile · probe · data
```

## 边界

四个实现包都是本包的普通 `dependencies`，不是 optional，也不是 peer；逻辑适配器仍是 opencli / browser / supply / profile / probe / data。

## 验证

```bash
pnpm --filter @dsh-workbench/adapters-default run build
pnpm --filter @dsh-workbench/adapters-default run test
```
