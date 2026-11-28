// ⚠️ 本文件由 dsh-wb-module build 生成，请勿手动修改。修改 src/ 后运行：dsh-wb-module build
window.__ModuleLoader__.load({
  id: "@dsh-workbench/module-fixture",
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
    var UNIT = "fixture";
    var fixtureClient = {
      unit: UNIT,
      card: ({ t, onRefresh }) => (0, import_react.createElement)(
        import_client.kit.components.Card,
        { t, title: t("fixture.title"), refreshing: false, onRefresh },
        (0, import_react.createElement)("span", null, "fixture card")
      ),
      messages: {
        zh: { "fixture.title": "\u5939\u5177\u6A21\u5757" },
        en: { "fixture.title": "Fixture module" }
      }
    };
    var inject = ["workbenchUnits"];
    function unitApiOf(ctx) {
      return ctx.get("workbenchUnits");
    }
    function apply(ctx) {
      const api = unitApiOf(ctx);
      if (api === void 0) {
        console.warn("[fixture] \u5916\u58F3\u6CA1\u6709\u63D0\u4F9B workbenchUnits \u670D\u52A1");
        return;
      }
      ctx.effect(() => api.registerUnit(fixtureClient), "module-fixture: \u6CE8\u518C fixture");
    }

    return module.exports;
  },
});
