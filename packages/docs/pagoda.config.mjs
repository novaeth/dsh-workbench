import { defineConfig } from "@pagoda-cli/core";

export default defineConfig({
  name: "@dsh-workbench/docs",
  site: {
    headerTitle: "dsh-workbench",
    title: "dsh-workbench · Agent 工作台",
    subtitle: "少切换。更专注。",
    description:
      "只取平台里你真正用得上的部分，收进一屏；即使平台不提供接口，agent 也能读取与操作。看板轻交互；写入留痕，复杂操作交给 agent。",
    defaultRoute: "index",
    icon: "/logo.svg",
    logoLink: "index",
    nav: [
      { title: "首页", view: "index" },
      {
        title: "指南",
        view: "guide",
        items: [
          { title: "总览", view: "index" },
          { title: "快速开始", view: "quickstart" },
          { title: "三种装法", view: "install" },
          { title: "面板与模块", view: "modules" },
          { title: "数据与设置", view: "data" },
          { title: "架构", view: "architecture" },
        ],
      },
      { title: "常见问题", view: "faq" },
      { title: "更新日志", view: "changelog" },
    ],
    layout: {
      responsive: true,
      showAnchor: true,
      showSimulator: false,
    },
    build: {
      publicPath: "",
    },
  },
});
