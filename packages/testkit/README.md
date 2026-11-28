# @dsh-workbench/testkit（私有）

开发夹具与测试的唯一数据源。不发布。

## 分层

| 入口 | 是什么 |
|---|---|
| world | World 模型、构造器、不变量（validateWorld） |
| project | World → 每条接管路由的契约 payload（纯函数） |
| captures/real-host | 真宿主捕获（带版本/日期/来源），parity 的 oracle |
| src/__tests__ | 契约 golden、投影、parity、覆盖门禁 |

## 加一个场景

1. 在 world(...) 里写模块、能力、面板、preflight、bundle、faults；
2. 跑 pnpm --filter @dsh-workbench/testkit test，不变量会拒绝不可能的组合；
3. 需要新读口时：加路由常量 + 投影 + golden + parity 捕获，coverage 用例会强制补齐。

## 加一条路由

project/routes.ts 的 READ_ROUTES 加进去 → 投影 → UPDATE_GOLDENS=1 生成 golden →
在 captures/real-host 放真宿主捕获 → coverage.test.ts 的 PARITY_ROUTES 或
RUNTIME_ROUTES 显式归类。缺任何一件，测试会红。
