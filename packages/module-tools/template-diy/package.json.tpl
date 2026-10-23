{
  "name": "__NAME__",
  "version": "0.1.0",
  "private": true,
  "description": "__DESC__",
  "type": "module",
  "exports": {
    ".": "./dist/host.js",
    "./client": "./client.js"
  },
  "files": ["dist", "client.js", "cordis.patch.yml"],
  "scripts": {
    "build": "dsh-wb-module build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "selfcheck": "dsh-wb-module build && dsh-wb-module design check && node scripts/smoke.mjs",
    "check": "dsh-wb-module check",
    "lint": "dsh-wb-module lint",
    "design": "dsh-wb-module design check",
    "prepack": "dsh-wb-module build"
  },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "platform": "web",
      "inject": ["@dsh-workbench/core"],
      "external": ["@dsh-workbench/core/client", "@deepseek-ai/dsh-client-ui-primitives"]
    },
    "workbench": {
      "apiVersion": 1,
      "unit": "__UNIT__",
      "card": { "titleKey": "__UNIT__.cardTitle", "order": 90 },
      "tools": [],
      "host": { "inject": [] }
    },
    "workbenchFaces": { "host": "src/host.ts", "client": "src/client.tsx" }
  },
  "peerDependencies": { "@dsh-workbench/core": "__SHELL_RANGE__", "react": "*" },
  "peerDependenciesMeta": { "react": { "optional": true } },
  "devDependencies": {
    "@deepseek-ai/dsh-client-ui-primitives": "__DSH_UI_VERSION__",
    "@dsh-workbench/core": "__SHELL_RANGE__",
    "@dsh-workbench/module-tools": "__SHELL_RANGE__",
    "@types/node": "^24.19.0",
    "@types/react": "^19.3.0",
    "react": "^19.3.0",
    "typescript": "5.9",
    "vitest": "^5.0.2"
  }
}
