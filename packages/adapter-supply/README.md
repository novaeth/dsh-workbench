# @dsh-workbench/adapter-supply

工作台的供应适配器。

## 职责

- 已安装模块发现与声明校验
- bundle / package / plugin 路由与安装计划
- registry 声明、插件目录与登录提示
- 插件来源解析（plugin-source）

## 入口

```ts
import { profileDirOf, profileModules, readInstalledModule } from '@dsh-workbench/adapter-supply';
```

## 边界

只依赖 `@dsh-workbench/shared` 的宿主契约与纯工具；不读取 core 内部文件，不拥有 profile 的 self-update。

## 验证

```bash
pnpm --filter @dsh-workbench/adapter-supply run build
pnpm --filter @dsh-workbench/adapter-supply run test
```
