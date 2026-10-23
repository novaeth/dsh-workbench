import { defineConfig } from "@pagoda-cli/core";

export default defineConfig({
  name: "@dsh-workbench/docs",
  site: {
    headerTitle: "dsh-workbench",
    title: "dsh-workbench · Agent 工作台",
    subtitle: "把工作交给 agent，把结果留给自己",
    description:
      "dsh 插件：左栏项目与会话、中间常驻对话、右侧实时数据面板。界面只读，写入只走 agent 工具；不改 dsh 本身。",
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
