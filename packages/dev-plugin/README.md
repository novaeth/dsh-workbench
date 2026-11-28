# @dsh-workbench/dev-plugin（私有）

dev 期 dsh 夹具插件。不发布。

## 它做什么

- 宿主侧：用 dsh webServer 的 exact 路由接管 /workbench/api/* 里需要假的端点；
  没接管的请求继续落到真工作台前缀处理器。
- 浏览器侧：侧栏的面板列表里有一项「调试场景」，点开是会 portal 到 body 的浮层面板，按落点分组、默认全部折叠，行用 dsh Button（模块市场 / 面板 / 添加模块 / 启动页 / 通用）；也可用 ?wbScene=… 直接进某屏，应用后地址栏会清掉（当前场景在服务端）；「真实」把接管全部摘掉。
- 默认不接管：dev 起来仍是真宿主；选场景才激活。

## 场景

src/host/scenes/ 按落点分四份：market / panel / add-module / boot-gate，
共 104 个场景（由旧 dev-fixtures 反建）。scenes.ts 只负责拼起来变成 World；每屏都过 validateWorld。

## 已知限制

- core 的 /workbench/events 不能覆盖；dev client 包了一层 EventSource，切场景后推一帧新 epoch 让页面重读，不刷新页面；
- prefs/panels 用更深的 exact 路径接管；prefs 其余键仍走真宿主。

## 命令

pnpm --filter @dsh-workbench/dev-plugin run build
pnpm --filter @dsh-workbench/dev-plugin test
