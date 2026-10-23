import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagesDir = path.join(rootDir, "packages");

const targets = fs
  .readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
  .map((entry) => path.join(packagesDir, entry.name, "package.json"))
  .filter((file) => fs.existsSync(file))
  .map((file) => ({ file, json: JSON.parse(fs.readFileSync(file, "utf-8")) }))
  .map(({ file, json }) => ({
    name: json.name ?? path.basename(path.dirname(file)),
    script: json.scripts?.coverage ? "coverage" : json.scripts?.test ? "test" : "",
  }))
  .filter(({ script }) => script !== "");

if (targets.length === 0) {
  console.error("✖ 没有一个包声明了 coverage / test —— 仓库不完整，或这份脚本该改了");
  process.exit(1);
}

const runOne = ({ name, script }) =>
  new Promise((resolve) => {
    const note = script === "coverage" ? "" : "（没有 coverage 入口，跑它自己声明的 test）";
    console.log(`\n▶ ${name} · ${script}${note}`);
    const child = spawn("pnpm", ["--filter", name, "run", script], { cwd: rootDir });

    let pending = "";
    const write = (chunk) => {
      pending += chunk.toString();
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) process.stdout.write(`[${name}] ${line}\n`);
    };
    child.stdout.on("data", write);
    child.stderr.on("data", write);
    child.on("error", (error) => {
      console.error(`[${name}] ✖ 起不来：${error.message}`);
      resolve({ name, script, status: -1 });
    });
    child.on("close", (status) => {
      if (pending !== "") process.stdout.write(`[${name}] ${pending}\n`);
      resolve({ name, script, status });
    });
  });

const results = await Promise.all(targets.map(runOne));
const failed = results
  .filter((result) => result.status !== 0)
  .map((result) => `${result.name}（${result.script}，exit ${result.status ?? "信号中断"}）`);

if (failed.length > 0) {
  console.error(`\n✖ ${failed.length} 个包的测试没过：${failed.join("、")}`);
  process.exit(1);
}
console.log(`\n✅ ${targets.length} 个包的测试都过了`);
