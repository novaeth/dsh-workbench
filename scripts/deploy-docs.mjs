import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import ghpages from "gh-pages";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteDir = path.join(rootDir, "packages", "docs", "site-dist");
const dryRun = process.argv.includes("--dry-run");

console.log("▸ 构建文档站");
const build = spawnSync("pnpm", ["run", "build:docs"], {
  cwd: rootDir,
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (build.status !== 0) {
  console.error("✖ 构建失败，没有发布");
  process.exit(build.status ?? 1);
}

const entry = path.join(siteDir, "index.html");
if (!fs.existsSync(entry)) {
  console.error(`✖ 产物不全：找不到 ${entry}`);
  process.exit(1);
}

if (dryRun) {
  console.log(`✔ 构建好了，产物在 ${path.relative(rootDir, siteDir)}；--dry-run 不推送`);
  process.exit(0);
}

console.log("▸ 推送到 gh-pages 分支");
try {
  await new Promise((resolve, reject) => {
    ghpages.publish(
      siteDir,
      { message: "deploy: docs", nojekyll: true },
      (error) => (error ? reject(error) : resolve()),
    );
  });
} catch (error) {
  console.error(`✖ 发布失败：${error?.message ?? error}`);
  process.exit(1);
}

console.log("✔ 文档已发布");
