# 适配器集合（AdapterSet）

工作台的宿主侧适配器只有一份契约：`AdapterSet`。契约住
`@dsh-workbench/shared/host`，默认实现在 `@dsh-workbench/adapters-default`。
外壳只在组合根 `dynamic import` 默认集合兜底；默认包是 core 的硬依赖（`dependencies`），
第三方 set 从 profile 解析。

## 契约

```ts
interface AdapterSet {
  apiVersion: number;
  id: string;
  version: string;
  data: DataReader;
  supply: EnvSupplyPort;
  modules: ModulePort;
  profile: ProfilePort;
  probe: ProbePort;
  runtime: RuntimePort;
  plugins: PluginSurface;
  actions: HostActions;
}
```

- `EnvSupplyPort` 是第三方可实现的窄口：`resolvePluginSource`、`libInstallCommand`、
  `pluginInstallPlan`、`latestVersion`、`missingReleaseParts`、`probeRelease`、
  `splitNpmSpec`（7 个方法，参数/返回都有类型）。
- `ModulePort` 是模块/profile/registry/自更新那一组；`supply` 与 `modules` 分开，
  `supply` 只给探针与市场用。
- `ProbePort`：`probeUnits` / `registerPreflight` / `declaredPluginCommands`。
- `RuntimePort`：`packageRoot` / `opencliCommand` / `seed` / `warnUnwritableRoot`。
- `PluginSurface`：`declarationLookup` / `createUnits`。
- `HostActions`：config sync 与 profile create 的 handler/action。

## 默认实现

```ts
import { createAdapterSet } from '@dsh-workbench/adapters-default';

const set = createAdapterSet(ctx);
```

`createAdapterSet` 只装配端口、返回完整 `AdapterSet`，不写 root。`runtime.seed` 由宿主 `apply`
无条件调一次（默认集合与第三方完整集合同一条路），所以工厂自己再 seed 只会双写。
它不依赖 `core` 包（方向是 core → adapters-default）。

## 第三方 set

```ts
// @acme/adapters-set
import type { AdapterSet } from '@dsh-workbench/shared/host';

export function createAdapterSet(ctx): AdapterSet {
  return {
    apiVersion: 1,
    id: '@acme/adapters-set',
    version: '1.0.0',
    data: myDataReader,
    supply: myEnvSupply,
    modules: myModulePort,
    profile: myProfile,
    probe: myProbe,
    runtime: myRuntime,
    plugins: myPlugins,
    actions: myActions,
  };
}
```

只替换一部分时，可以只交 `CoreAdapterSet`（`apiVersion` / `id` / `version` + `data` / `supply` / `profile` / `probe`）；
`modules` / `runtime` / `plugins` / `actions` 由默认 set 补齐。

安装与配置：

```bash
cd ~/.dsh/profiles/<名字>
pnpm add @acme/adapters-set@1.0.0
```

```yaml
# ~/.dsh/profiles/<名字>/cordis.patch.yml
- id: workbench
  config:
    adapterSet: "@acme/adapters-set"
```

不写 `adapterSet` = 默认 set，行为与以前一致。值只接受包名；
`file:` / `http:` / 绝对路径 / 相对路径都是 `malformed`。

设置 → 工作台设置 → 适配器集合 只在「配了集合」或「加载失败」时出现：显示当前 `id@version`、
是否由默认成员补齐，以及失败原因；默认集合正常生效时整条不占位。
失败主句用 `adapterSet.*` 文案键，技术原文仍进 `detail` / 日志。

## 加载与回退

`loadAdapterSet(ctx, spec)` 在 `shared/host/adapter-set.ts`：

1. 从 `profileContext.dir` 解析：先读那个包的 `package.json`，按 `exports` 的 `import` 条件 /
   `module` / `main` 定入口（纯 ESM 包、双条件包都拿 `import` 那一份）；
   读不到再 `createRequire(profile/package.json).resolve(spec)` 兜底；
2. `import(url)`；
3. 取 `createAdapterSet`（或 `default`）；
4. 校验 `apiVersion`、`id` / `version`、core 四个成员及其关键方法；完整 set 还校验 `modules` / `runtime` / `plugins` / `actions` 及其方法；
5. 失败不抛：`apply` 用默认 set，启动日志与 `/health` 的 `adapterSet` 里可见
   `failure` / `detail`。

加载不依赖 bundle 顺序：它在 `apply` 里显式发生，晚于 profile 合并、早于
`createHostRoutes` / `mountUnits`。

## 门禁

`pnpm run check:adapter-defaults` 除了包图，还扫 `core/src`、`shared/src`、`module-tools/src`：
除 `core` 的 `app/host.ts` 默认兜底 dynamic import 外，生产源码（测试除外）里任何具体适配器
import / require——含裸副作用 import、`import(/* @vite-ignore */ …)`、无空格的 `from'…'`、
`adapter-*` 与子路径——都判红。门禁只认字面量：`import(pkg)`、模板串与字符串拼接不在这条范围内，
那类写法靠 review。
