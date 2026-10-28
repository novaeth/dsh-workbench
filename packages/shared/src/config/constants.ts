/** 外壳插件的包名：浏览器模块表与宿主按它注册、认领这枚插件。 */
export const PLUGIN_ID = "@dsh-workbench/core";

/** 外壳宿主 HTTP API 的根前缀；prefs / actions / provision 等路由都挂在它下面。 */
export const API_PREFIX = "/workbench/api";

/** 模块偏好读写的路由前缀，挂在外壳 API 下：走写通道，拒写回 write-refused。 */
export const PREFS_PREFIX = `${API_PREFIX}/prefs`;

/** 事实（facts）SSE 事件流的端点路径；前端 `EventSource` 按它带 `since` 游标续传。 */
export const EVENTS_PATH = "/workbench/events";
/** 写动作的路由前缀，挂在外壳 API 下：模块的写通道 POST 到这里。 */
export const ACTIONS_PREFIX = `${API_PREFIX}/actions`;

/** 机器供给（provision）的路由前缀：只收 POST，装机时用它铺一份运行环境。 */
export const PROVISION_PREFIX = `${API_PREFIX}/provision`;

/** 面板运行态上报的路径段：崩溃与卡片收尾分别 POST 到 `panel-state/crash`、`panel-state/cards`。 */
export const PANEL_STATE_PATH = "panel-state";

/** DIY 调试动作的路径段；宿主按它登记 `/workbench/api/diy-debug` 前缀。 */
export const DIY_DEBUG_PATH = "diy-debug";
/** 调试动作的子路径（`diy-debug/act`）；仓内暂无调用点，动作现走 `DIY_DEBUG_SERVICE`。 */
export const DIY_DEBUG_ACT_PATH = `${DIY_DEBUG_PATH}/act`;

/** DIY 录制交接的路径段；宿主按它登记 `/workbench/api/diy-record` 前缀。 */
export const DIY_RECORD_PATH = "diy-record";
/** 录制动作的子路径（`diy-record/act`）；仓内暂无调用点，录制现走 `DIY_RECORD_SERVICE`。 */
export const DIY_RECORD_ACT_PATH = `${DIY_RECORD_PATH}/act`;

/** 面板运行态的路由前缀，挂在外壳 API 下：上报口用它，拒报回 report-refused。 */
export const PANEL_STATE_PREFIX = `${API_PREFIX}/${PANEL_STATE_PATH}`;

/** 钉住的 opencli 插件版本：`opencli-runtime` 按它校验、取那一份。 */
export const OPENCLI_PIN = "1.8.8";

/** 缺陷看板套件的 dsh 服务名（`workbenchIssues`）：套件照它登记自己那份服务。 */
export const ISSUES_SERVICE = "workbenchIssues";

/** 面板套件的 dsh 服务名（`workbenchPanels`）：宿主经它取套件公布的清单与订阅。 */
export const PANELS_SERVICE = "workbenchPanels";

/** 单元花名册服务的 dsh 服务名（`workbenchUnits`）：模块经它认领自己的单元。 */
export const UNITS_SERVICE = "workbenchUnits";

/** 面板运行态服务的 dsh 服务名（`workbenchPanelState`）：宿主注册，读口按它取。 */
export const PANEL_STATE_SERVICE = "workbenchPanelState";

/** DIY 调试约定服务的 dsh 服务名（`workbenchDiyDebug`）：调试动作走它，不走 HTTP。 */
export const DIY_DEBUG_SERVICE = "workbenchDiyDebug";

/** DIY 录制交接服务的 dsh 服务名（`workbenchDiyRecord`）：`diy-acts.ts` 经它收发录制三拍。 */
export const DIY_RECORD_SERVICE = "workbenchDiyRecord";

/** 会话投影服务的 dsh 服务名（`sessionProjections`）：宿主经 `stateOf(session, 'agentPreset')` 读那一档。 */
export const SESSION_PROJECTIONS_SERVICE = "sessionProjections";

/** 面板清单一次取回的行数上限（条）：外部模块拿它当 opencli `--pageSize`。 */
export const PANEL_LIST_LIMIT = 50;

/** 单次 opencli 调用的默认超时（毫秒）；调用点没传 `timeoutMs` 时按它算。 */
export const OPENCLI_TIMEOUT_MS = 120_000;

/** 同时最多几条 opencli 在跑（条）：`opencli.ts` 超出就排队。 */
export const OPENCLI_MAX_CONCURRENT = 4;

/** 启动预热站点那一跳的超时（毫秒）；超时按未热对待，不挡面板。 */
export const WARM_TIMEOUT_MS = 20_000;

/** 体检结果算「还新鲜」的时长（毫秒）：期内再来的强制体检直接回上一次那份快照。 */
export const PREFLIGHT_FRESH_MS = 30_000;

/** 装 / 卸模块包的超时（毫秒）：pnpm 与取包内容都按它算。 */
export const INSTALL_TIMEOUT_MS = 300_000;

/** 查 registry 版本那一次请求的超时（毫秒）。 */
export const VERSION_CHECK_TIMEOUT_MS = 10_000;

/** 版本查询结果的缓存有效期（毫秒）：期内不发第二次请求。 */
export const VERSION_CHECK_TTL_MS = 600_000;

/** 单元探测结果的缓存有效期（毫秒）。 */
export const PROBE_TTL_MS = 30_000;

/** 加载态至少显示多久（毫秒）：一瞬完成的读写也得让用户看见那一下。 */
export const MIN_BUSY_MS = 500;

/** 工具读出来的值交给面板后的保留时长（毫秒）：过期就不再算这一拍。 */
export const HANDOFF_TTL_MS = 15_000;

/** 跑本地 git 命令的超时（毫秒）；短于对外的 `OPENCLI_TIMEOUT_MS`。 */
export const GIT_TIMEOUT_MS = 10_000;

/** 面板轮询事实的间隔（毫秒）：SSE 断了走这条兜底轮询。 */
export const PANEL_POLL_MS = 2000;

/** 没起中文名的工作区默认标题：左栏按它分组、显示。 */
export const DEFAULT_WORKSPACE_TITLE = "default-workspace";

/** 记住当前项目的 localStorage 键。 */
export const STORAGE_KEY_PROJECT = "dsh-workbench.project";

/** 记住右栏展开与否的 localStorage 键。 */
export const STORAGE_KEY_RIGHTBAR = "dsh-workbench.rightbar.expanded";

/** 记住右栏当前列的 localStorage 键。 */
export const STORAGE_KEY_RIGHTBAR_COLUMN = "dsh-workbench.rightbar.column";

/** 记住右栏宽度（像素数字的字符串）的 localStorage 键。 */
export const STORAGE_KEY_RIGHTBAR_WIDTH = "dsh-workbench.rightbar.width";

/** 记住「添加模块」浮层选过的安装源的 localStorage 键。 */
export const STORAGE_KEY_MARKET_REGISTRY = "dsh-workbench.market.registry";

/** 记住「添加模块」浮层上次填过的自定义源地址的 localStorage 键。 */
export const STORAGE_KEY_MARKET_REGISTRY_CUSTOM = "dsh-workbench.market.registry.custom";

/** 右栏宽度达到或超过多少像素就按全屏对待（阈值，像素）。 */
export const RIGHTBAR_FULLSCREEN_WIDTH = 768;

/** dsh i18n 的命名空间：词表都注册在它下面，`ctx.locale.register` / `bind` 按它取。 */
export const LOCALE_NS = "workbench";

/** 外壳支持的语言标识，顺序即回退顺序：首项是基准，其余词表必须与它逐键同构。 */
export const LOCALES = ["zh", "en"] as const;
