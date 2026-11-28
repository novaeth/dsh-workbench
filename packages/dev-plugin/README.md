# @dsh-workbench/dev-plugin（私有）

dev 期 dsh 夹具插件。不发布。

## 它做什么

- 宿主侧：用 dsh webServer 的 exact 路由接管 /workbench/api/* 里需要假的端点；
  没接管的请求继续落到真工作台前缀处理器。
- 浏览器侧：侧栏的面板列表里有一项「调试场景」，点开是 dsh MenuSurface（portal 到 body）的浮层面板，点外部/按 Esc 关闭，按落点分组、默认折叠（当前场景所在组自动展开并高亮），展开状态在关闭/重开之间保留；行用 dsh Button；启动页场景右上角还有一个 dev-only 的「退出启动页」，卡在 gate 里也能切回真宿主；右上角「重置」切回真宿主（模块市场 / 面板 / 面板配置 / 添加模块 / 启动页 / 通用）；也可用 ?wbScene=… 直接进某屏，应用后地址栏会清掉（当前场景在服务端）；「真实」把接管全部摘掉。
- 默认不接管：dev 起来仍是真宿主；选场景才激活。

## 场景

src/host/scenes/ 按落点分四份：market / panel / add-module / boot-gate，
共 107 个场景（由旧 dev-fixtures 反建）。scenes.ts 只负责拼起来变成 World；每屏都过 validateWorld。
panel 场景按屏幕再分两组：`面板` 是看板内容区（一张卡、空看板、配置/清单读取中、配置/清单读失败、八张卡、崩卡、卡片内层），`面板配置` 是浮层里的行、开关、徽标、拖动与插件。

## 已知限制

- core 的 /workbench/events 不能覆盖；浏览器里切场景成功后整页 reload，确保市场等 fact 缓存重新取数；非浏览器环境退回推一帧新 epoch；
- prefs/panels 用更深的 exact 路径接管；prefs 其余键仍走真宿主。

## 命令

pnpm --filter @dsh-workbench/dev-plugin run build
pnpm --filter @dsh-workbench/dev-plugin test
