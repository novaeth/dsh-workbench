// ⚠️ 本文件由 dsh-wb-module build 生成，请勿手改。改 src/ 后跑：dsh-wb-module build
window.__ModuleLoader__.load({
  id: "@dsh-workbench/module-hello",
  factory(require) {
    const module = { exports: {} };
    const exports = module.exports;
    "use strict";
    var __defProp = Object.defineProperty;
    var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames = Object.getOwnPropertyNames;
    var __hasOwnProp = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp(target, name, { get: all[name], enumerable: true });
    };
    var __copyProps = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames(from))
          if (!__hasOwnProp.call(to, key) && key !== except)
            __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

    // src/client.tsx
    var client_exports = {};
    __export(client_exports, {
      apply: () => apply,
      inject: () => inject
    });
    module.exports = __toCommonJS(client_exports);
    var import_react = require("react");
    var import_client = require("@dsh-workbench/core/client");

    // src/messages.ts
    var helloMessages = {
      zh: {
        "hello.cardTitle": "\u793A\u4F8B\u6A21\u5757",
        "hello.heading": "hello, workbench",
        "hello.body": "\u8FD9\u5F20\u5361\u7247\u6765\u81EA\u4E00\u4E2A\u72EC\u7ACB\u7684\u5DE5\u4F5C\u53F0\u6A21\u5757\u3002"
      },
      en: {
        "hello.cardTitle": "Sample module",
        "hello.heading": "hello, workbench",
        "hello.body": "This card comes from a standalone workbench module."
      }
    };

    // src/client.tsx
    var UNIT_ID = "hello";
    var helloClient = {
      unit: UNIT_ID,
      messages: helloMessages,
      card: (props) => {
        const { Card, IconBrandMark } = import_client.kit.components;
        return (0, import_react.createElement)(
          Card,
          {
            t: props.t,
            title: props.t("hello.cardTitle"),
            refreshing: false,
            onRefresh: props.onRefresh
          },
          (0, import_react.createElement)("p", null, (0, import_react.createElement)(IconBrandMark, { size: 16 }), " ", props.t("hello.heading")),
          (0, import_react.createElement)("p", null, props.t("hello.body"))
        );
      }
    };
    var inject = ["workbenchUnits"];
    function apply(ctx) {
      const units = ctx.get("workbenchUnits");
      if (units === void 0) {
        console.warn(`[${UNIT_ID}] \u5916\u58F3\u6CA1\u6709\u63D0\u4F9B workbenchUnits \u670D\u52A1\uFF1A\u8FD9\u5F20\u5361\u7247\u88C5\u4E0D\u8FDB\u6765`);
        return;
      }
      ctx.effect(() => units.registerUnit(helloClient), `module-hello: \u6CE8\u518C ${UNIT_ID}`);
    }

    return module.exports;
  },
});
