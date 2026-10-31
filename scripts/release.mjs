import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { execaSync } from "execa";
import enquirer from "enquirer";
import semver from "semver";

const { prompt } = enquirer;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const REGISTRY = "https://registry.npmjs.org/";
const PACKUMENT_ACCEPT = "application/vnd.npm.install-v1+json";
const ROOT_PACKAGE_JSON = path.join(rootDir, "package.json");
const PACKAGES_DIR = path.join(rootDir, "packages");
const STATE_PATH = path.join(rootDir, ".release-state.json");
const STATE_NAME = path.relative(rootDir, STATE_PATH);
const MAX_PUBLISH_ATTEMPTS = 3;
const MAX_REGISTRY_ATTEMPTS = 3;

const FAILURE_PROBE = { attempts: 2, delayMs: 2000 };
const FINAL_PROBE = { attempts: 4, delayMs: 3000 };

const Stage = {
  PREFLIGHT: "preflight",
  SYNC: "sync",
  BUILD: "build",
  REHEARSAL: "rehearsal",
  PUBLISH: "publish",
  DOCS: "docs",
  GIT: "git",
  DONE: "done",
};

const releaseRun = {
  stage: Stage.PREFLIGHT,
  fromVersion: "",
  targetVersion: "",

  resumed: false,
};

class ReleaseError extends Error {}

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function sh(
  command,
  args,
  { cwd = rootDir, capture = false, quiet = false, allowFailure = false } = {},
) {
  const result = execaSync(command, args, {
    cwd,
    stdio: capture ? ["inherit", "pipe", "pipe"] : "inherit",
    reject: false,
  });
  const output = capture ? `${result.stdout ?? ""}${result.stderr ?? ""}` : "";
  if (capture && !quiet) process.stdout.write(output);
  const status = result.exitCode ?? 1;
  if (!allowFailure && status !== 0) {
    throw new ReleaseError(
      `命令失败（exit ${status}）：${command} ${args.join(" ")}${output.trim() ? `\n${output.trim()}` : ""}`,
    );
  }
  return { status, output, signal: result.signal };
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf-8"));
const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

function collectPackageJsonPaths(dir = PACKAGES_DIR) {
  if (!fs.existsSync(dir)) return [];
  const result = [];
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    let stat;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      result.push(...collectPackageJsonPaths(full));
    } else if (entry === "package.json") {
      result.push(full);
    }
  }
  return result;
}

function listPublishablePackages() {
  return fs
    .readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => path.join(PACKAGES_DIR, entry.name, "package.json"))
    .filter((jsonPath) => fs.existsSync(jsonPath))
    .map((jsonPath) => ({ jsonPath, json: readJson(jsonPath) }))
    .filter(({ json }) => Boolean(json.name) && !json.private && Boolean(json.publishConfig))
    .map(({ jsonPath, json }) => ({
      name: json.name,
      version: json.version,
      dir: path.dirname(jsonPath),
      jsonPath,
      registry: json.publishConfig.registry ?? "https://registry.npmjs.org/",
    }));
}

function syncVersions(version) {
  const changed = [];
  const rootPackageJson = readJson(ROOT_PACKAGE_JSON);
  if (rootPackageJson.version !== version) {
    rootPackageJson.version = version;
    writeJson(ROOT_PACKAGE_JSON, rootPackageJson);
    changed.push("package.json");
  }
  for (const jsonPath of collectPackageJsonPaths()) {
    const pkg = readJson(jsonPath);
    if (pkg.version === version) continue;
    pkg.version = version;
    writeJson(jsonPath, pkg);
    changed.push(pkg.name ?? path.relative(rootDir, jsonPath));
  }
  console.log(
    changed.length
      ? `   ✅ 版本号已同步为 v${version}：${changed.join("、")}`
      : `   ℹ️  所有文件已是 v${version}`,
  );
}

function saveState(state) {
  writeJson(STATE_PATH, state);
}

function loadState() {
  return fs.existsSync(STATE_PATH) ? readJson(STATE_PATH) : null;
}

function clearState() {
  if (fs.existsSync(STATE_PATH)) fs.unlinkSync(STATE_PATH);
}

function readCommittedVersion() {
  try {
    const result = sh("git", ["show", "HEAD:package.json"], {
      capture: true,
      quiet: true,
      allowFailure: true,
    });
    return result.status === 0 ? (JSON.parse(result.output).version ?? "") : "";
  } catch {
    return "";
  }
}

async function fetchVersions(name) {
  const url = `${REGISTRY}${name.replace("/", "%2F")}`;
  let lastError;
  for (let attempt = 1; attempt <= MAX_REGISTRY_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { accept: PACKUMENT_ACCEPT } });
      if (response.status === 404) return {};
      if (!response.ok)
        throw new ReleaseError(`registry 查询失败：${name} → HTTP ${response.status}`);
      const packument = await response.json();
      return packument.versions ?? {};
    } catch (error) {
      lastError = error;
      if (attempt < MAX_REGISTRY_ATTEMPTS) await sleep(attempt * 1000);
    }
  }
  throw lastError;
}

async function inspectTarget(targetVersion) {
  const packages = listPublishablePackages();
  const versions = new Map(
    await Promise.all(packages.map(async (pkg) => [pkg.name, await fetchVersions(pkg.name)])),
  );
  const published = packages
    .filter((pkg) => versions.get(pkg.name)?.[targetVersion])
    .map((pkg) => pkg.name);
  return {
    packages: packages.map((pkg) => pkg.name),
    published,
    pending: packages.filter((pkg) => !published.includes(pkg.name)).map((pkg) => pkg.name),
  };
}

async function verifyPublished(targetVersion, { attempts, delayMs }) {
  let progress = await inspectTarget(targetVersion);
  for (let attempt = 1; attempt < attempts && progress.pending.length; attempt += 1) {
    console.log(
      `   … registry 还没同步到 v${targetVersion}（${progress.published.length}/${progress.packages.length}），${delayMs / 1000} 秒后复查`,
    );
    await sleep(delayMs);
    progress = await inspectTarget(targetVersion);
  }
  return progress;
}

function parseArgs(argv) {
  const options = {
    help: false,
    resume: false,
    yes: false,
    dryRun: false,
    skipBuild: false,
    skipRehearsal: false,
    skipGate: false,
    allowDirty: false,
    target: "",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const [flag, inline] = argv[i].split("=");
    const value = () => (inline !== undefined ? inline : (argv[++i] ?? ""));
    switch (flag) {
      case "-h":
      case "--help":
        options.help = true;
        break;
      case "--resume":
        options.resume = true;
        break;
      case "-y":
      case "--yes":
        options.yes = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--skip-build":
        options.skipBuild = true;
        break;
      case "--skip-rehearsal":
        options.skipRehearsal = true;
        break;
      case "--skip-gate":
        options.skipGate = true;
        break;
      case "--allow-dirty":
        options.allowDirty = true;
        break;
      case "--target":
        options.target = value();
        break;
      default:
        throw new ReleaseError(`未知参数：${flag}（用 --help 查看用法）`);
    }
  }
  return options;
}

function printUsage() {
  console.log(`
发布脚本：可中断、可续跑、幂等

  pnpm run release                        交互式发布新版本
  pnpm run release:resume                 续跑上一次中断的发布
  pnpm run release:dry                    彩排：改版本号 + 构建 + publish --dry-run，不上传

  node scripts/release.mjs --target 0.2.0 --yes

门禁整次发布只跑一遍：preflight 里那次 pnpm run check（--resume 也一样跑）。
发布走 pnpm -r publish --ignore-scripts —— 各包的 prepublishOnly / prepack 只拦手敲的
pnpm publish，彩排与真发都不会再触发它们。

选项：
  --resume          读取 ${STATE_NAME} 续跑，不重新选择版本号（门禁照跑一遍）
  --target <ver>    直接指定目标版本号（跳出版本选择）
  -y, --yes         跳过确认（配合 --target 可无人值守）
  --dry-run         只彩排不发布，结束后回滚本地版本号
  --skip-build      跳过构建：发磁盘上现有产物（prepack 已关，不再兜底重建）
  --skip-rehearsal  跳过 dry-run 彩排（不推荐）
  --skip-gate       跳过门禁（真的跳过：发布不会再补跑；不推荐）
  --allow-dirty     允许工作区有未提交的改动
`);
}

function checkNpmLogin() {

  const whoami = sh("npm", ["whoami", `--registry=${REGISTRY}`], {
    capture: true,
    quiet: true,
    allowFailure: true,
  });
  const user = whoami.output.trim();
  if (whoami.status === 0 && user) {
    console.log(`✅ npm 已登录：${user}`);
    return;
  }
  if (!/ENEEDAUTH|not logged in|401|Unauthorized/i.test(whoami.output)) {
    console.log("⚠️  无法确认 npm 登录状态（可能只是本地 npm 缓存问题，也可能是未登录）：");
    console.log(`   ${whoami.output.trim().split("\n")[0] || whoami.output.trim()}`);
    console.log("   即使未登录也不会留下半套发布：第一个包就会失败，此时本地版本号会自动回滚。");
    return;
  }
  console.log("⚠️  npm 未登录，启动登录流程…\n");
  const login = sh("npm", ["login", `--registry=${REGISTRY}`], { allowFailure: true });
  if (login.status !== 0) throw new ReleaseError("npm 登录失败");
  console.log("\n✅ 登录成功\n");
}

function preflight(options, { checkDirty }) {
  if (checkDirty && !options.allowDirty) {
    const status = sh("git", ["status", "--porcelain"], { capture: true, quiet: true });
    const dirty = status.output.trim();
    if (dirty) {
      throw new ReleaseError(
        `工作区有未提交的改动，发布会把它们一起提交：\n${dirty}\n请先提交或暂存；确认无碍可加 --allow-dirty。`,
      );
    }
  }
  checkNpmLogin();
  if (options.skipGate) {

    console.log("\n🔒 门禁：--skip-gate，跳过（发布不会再补跑）");
    return;
  }

  console.log(
    options.resume
      ? "\n🔒 门禁（pnpm run check）：续跑也跑一遍 —— 断了之后改过的代码必须门禁"
      : "\n🔒 门禁（pnpm run check）…",
  );
  sh("pnpm", ["run", "check"]);
  console.log("   ✅ 门禁通过（整次发布只跑这一遍）");
}

const PRERELEASE_CHANNELS = ["beta", "rc", "alpha"];

function versionOptions(currentVersion) {
  const options = [];
  const seen = new Set();
  const add = (label, version) => {
    if (version === null || version === undefined || seen.has(version)) return;
    seen.add(version);
    options.push({ label, version });
  };
  const prerelease = semver.prerelease(currentVersion);
  const currentChannel = typeof prerelease?.[0] === "string" ? prerelease[0] : undefined;
  if (currentChannel === undefined) {
    for (const kind of ["patch", "minor", "major"]) {
      add(`${kind} 正式版`, semver.inc(currentVersion, kind));
    }
  } else {
    add("转为正式版", semver.inc(currentVersion, "patch"));
  }
  const channels =
    currentChannel === undefined
      ? PRERELEASE_CHANNELS
      : [currentChannel, ...PRERELEASE_CHANNELS.filter((one) => one !== currentChannel)];
  for (const channel of channels) {
    const label =
      currentChannel === channel
        ? `${channel} 下一版`
        : currentChannel === undefined
          ? `${channel} patch 预发布`
          : `${channel} 同核预发布`;
    add(label, semver.inc(currentVersion, "prerelease", channel));
    add(`${channel} minor 预发布`, semver.inc(currentVersion, "preminor", channel));
    add(`${channel} major 预发布`, semver.inc(currentVersion, "premajor", channel));
  }
  return options;
}

async function askVersion(currentVersion) {
  const options = versionOptions(currentVersion);
  const labels = options.map((one) => `${one.label}（${one.version}）`);
  const { selected } = await prompt({
    type: "select",
    name: "selected",
    message: `选择发布版本（当前 v${currentVersion}）`,
    choices: labels.concat("custom"),
  });
  if (selected !== "custom") return options[labels.indexOf(selected)].version;
  const { version } = await prompt({
    type: "input",
    name: "version",
    message: "输入自定义版本号",
    initial: currentVersion,
  });
  return version;
}

function printPlan(targetVersion, inspect) {
  const names = inspect?.packages ?? listPublishablePackages().map((pkg) => pkg.name);
  console.log(`\n将发布 v${targetVersion}（可发布的包共 ${names.length} 个）：`);
  const tag = publishTagOf(targetVersion);
  if (tag !== undefined) {
    console.log(`   预发布：npm dist-tag 打到 ${tag}，latest 保持不动`);
  }
  for (const name of names) {
    const published = inspect ? inspect.published.includes(name) : false;
    console.log(`   ${published ? "⏭️  已在 registry，将跳过" : "📤"} ${name}`);
  }
  if (inspect?.published.length) {
    console.log(
      `\n⚠️  v${targetVersion} 已经有 ${inspect.published.length} 个包在 registry 上，本次只补发剩下的。`,
    );
  }
  console.log("\n流程：同步版本号 → 构建 → 彩排(dry-run) → 发布 → 部署文档 → 提交/打 tag/推送");
}

function build() {
  console.log("\n🔨 构建所有包…");

  if ((process.env.WB_STAGE_DIR ?? "") !== "") {
    console.log(
      `   ⚠️  环境里有 WB_STAGE_DIR=${process.env.WB_STAGE_DIR}（那是判据内部的暂存开关）—— 发版构建忽略它，产物照常落包内。` +
        "\n      想只建到别处看看用 `cd packages/core && WB_STAGE_DIR=<目录> node scripts/build.mjs`，别带进发版。",
    );
    delete process.env.WB_STAGE_DIR;
  }
  process.env.WB_RELEASE = "1";
  try {
    sh("pnpm", ["run", "build"]);
    releaseArtifactBuilt = true;
  } finally {
    delete process.env.WB_RELEASE;
  }
  assertNoFixtures();
  console.log("   ✅ 构建完成");
}

function assertNoFixtures() {
  const before = shippedArtifactFingerprints();
  const { status } = sh("node", ["scripts/check-release-artifacts.mjs", "--shipped"], {
    cwd: path.join(rootDir, "packages", "core"),
    allowFailure: true,
  });
  if (status !== 0) {
    const after = shippedArtifactFingerprints();
    const changed = [...after].filter(([rel, hash]) => before.get(rel) !== hash).map(([rel]) => rel);
    const gone = [...before.keys()].filter((rel) => !after.has(rel));
    const touched = [...changed, ...gone.map((rel) => `${rel}（消失）`)];
    if (touched.length > 0) {
      throw new ReleaseError(
        `发布构建的产物在审计之前被**别的进程重写了**（${touched.slice(0, 6).join("、")}）—— ` +
          "多半是 `pnpm run dev` 的 watcher：门禁里 `check:standalone` 会动 `src/`，它就顺手把开发产物写了回来。" +
          "**先停掉 `pnpm run dev` 再发版**（这不是「夹具漏进产物」：那种情况指纹不变、清单会指着同一批文件）。",
      );
    }
    const note = releaseArtifactBuilt
      ? ""
      : "（注意：这次是 --skip-build，审的是磁盘上**现有**产物，不是本次构建的）";
    throw new ReleaseError(
      `发布产物审计没过（逐份清单见上一屏）—— 夹具只许在开发构建里，见 内部设计记录${note}`,
    );
  }
  console.log("   ✅ 出货文件集里没有夹具（M1 内容标记 / M2 夹具文件名 / M3 出货覆盖）");
}

function shippedArtifactFingerprints() {
  const root = path.join(rootDir, "packages", "core");
  const out = new Map();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.set(path.relative(root, full), createHash("sha256").update(fs.readFileSync(full)).digest("hex"));
    }
  };
  for (const rel of ["client.js", "dist"]) {
    const full = path.join(root, rel);
    if (!fs.existsSync(full)) continue;
    if (fs.statSync(full).isDirectory()) walk(full);
    else out.set(rel, createHash("sha256").update(fs.readFileSync(full)).digest("hex"));
  }
  return out;
}

function publishTagOf(version) {
  const prerelease = semver.prerelease(version);
  if (prerelease === null) return undefined;
  return typeof prerelease[0] === "string" ? prerelease[0] : "next";
}

function publishArgs({ dryRun, targetVersion }) {
  const tag = publishTagOf(targetVersion);
  const args = [
    "-r",
    "publish",
    "--access",
    "public",
    "--no-git-checks",
    "--ignore-scripts",
    `--registry=${REGISTRY}`,
    ...(tag === undefined ? [] : [`--tag=${tag}`]),
  ];
  if (dryRun) args.push("--dry-run");
  return args;
}

function rehearse(options, targetVersion) {
  console.log("\n🧪 彩排（pnpm publish --dry-run，只打包、不上传）…");
  const result = sh("pnpm", publishArgs({ ...options, dryRun: true, targetVersion }), { allowFailure: true });
  if (result.status !== 0) {
    throw new ReleaseError(
      "彩排失败：上面的包无法正常打包/发布，修好再发（registry 上还没有任何本次改动）",
    );
  }
  console.log("   ✅ 彩排通过");
}

async function publish(options, targetVersion) {
  console.log("\n📤 发布（pnpm publish 会自动跳过已存在的版本）…");
  const args = publishArgs({ ...options, targetVersion });
  for (let attempt = 1; attempt <= MAX_PUBLISH_ATTEMPTS; attempt += 1) {
    const result = sh("pnpm", args, { allowFailure: true });
    if (result.status === 0) return;
    if (result.signal) throw new ReleaseError(`发布进程被 ${result.signal} 中断`);
    const progress = await verifyPublished(targetVersion, FAILURE_PROBE);
    console.log(
      `\n⚠️  第 ${attempt} 次发布中断：registry 上已有 ${progress.published.length}/${progress.packages.length} 个包`,
    );
    if (!progress.pending.length) {
      console.log("   待发布的包其实都已就位，继续后续流程");
      return;
    }
    console.log(`   仍缺：${progress.pending.join("、")}`);
    if (attempt < MAX_PUBLISH_ATTEMPTS) {
      console.log(`   ${attempt * 2} 秒后重试（已发布的包会自动跳过）…`);
      await sleep(attempt * 2000);
    }
  }
  throw new ReleaseError(`发布失败：尝试 ${MAX_PUBLISH_ATTEMPTS} 次后仍有包未发布`);
}

function commitAndPush(targetVersion) {
  const message = `chore: 发布版本 v${targetVersion}`;
  const tag = `v${targetVersion}`;
  console.log("\n📝 提交、推送并打 tag…");
  sh("git", ["add", "-A"]);
  const committed = sh("git", ["commit", "-m", message], { capture: true, allowFailure: true });
  if (committed.status !== 0) {
    if (/nothing to commit|no changes added/i.test(committed.output)) {
      console.log("   ℹ️  没有需要提交的改动，跳过 commit");
    } else {
      throw new ReleaseError(`git commit 失败：\n${committed.output.trim()}`);
    }
  }
  const tagged = sh("git", ["tag", tag], { capture: true, allowFailure: true });
  if (tagged.status !== 0) {
    if (/already exists/i.test(tagged.output)) console.log(`   ℹ️  tag ${tag} 已存在，跳过`);
    else throw new ReleaseError(`git tag 失败：\n${tagged.output.trim()}`);
  }
  sh("git", ["push"]);
  sh("git", ["push", "origin", tag]);
  console.log(`   ✅ 已提交、推送并打 tag ${tag}`);
}

async function finish(options, targetVersion) {
  releaseRun.stage = Stage.GIT;
  try {
    commitAndPush(targetVersion);
  } catch (error) {
    throw new ReleaseError(
      `${error instanceof Error ? error.message : String(error)}\n   包已发布，请手动完成 git 收尾（或稍后执行 pnpm run release:resume）：\n     git add -A && git commit -m "chore: 发布版本 v${targetVersion}"\n     git tag v${targetVersion} && git push && git push origin v${targetVersion}`,
    );
  }

  clearState();

  releaseRun.stage = Stage.DONE;
  console.log(`\n🎉 v${targetVersion} 发布完成！`);
}

function describeState(state) {
  const published = state.published?.length
    ? `已发布 ${state.published.length} 个包`
    : "尚未确认已发布";
  const remaining = state.remaining?.length ? `，未发布 ${state.remaining.length} 个` : "";
  return `${published}${remaining}`;
}

async function handleFailure(error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n❌ ${message}`);

  const { fromVersion, targetVersion, stage } = releaseRun;
  const fallbackVersion = fromVersion || readCommittedVersion() || targetVersion;
  const beforePublish =
    stage === Stage.PREFLIGHT ||
    stage === Stage.SYNC ||
    stage === Stage.BUILD ||
    stage === Stage.REHEARSAL;

  if (!targetVersion) {
    console.error("   未改动任何文件，无需回滚。");
    return;
  }

  let progress = null;
  if (!beforePublish || releaseRun.resumed) {
    try {
      progress = await verifyPublished(targetVersion, FINAL_PROBE);
    } catch (inspectError) {
      const detail = inspectError instanceof Error ? inspectError.message : String(inspectError);
      console.error(`\n⚠️  无法查询 registry 确认发布进度：${detail}`);
      saveState({
        fromVersion,
        targetVersion,
        published: [],
        remaining: [],
        reason: `${message}（无法确认 registry 状态）`,
        updatedAt: new Date().toISOString(),
      });
      console.error(
        `\n保留本地版本号，现场已写入 ${STATE_NAME}。请先到 npm 上确认 v${targetVersion} 到底发出去了哪些包：`,
      );
      console.error(`  · 一个都没发出去 → git checkout -- . 回到 v${fallbackVersion} 后重新发布；`);
      console.error("  · 发出去一部分 → 直接执行 pnpm run release:resume 把剩下的补齐。");
      return;
    }
  }

  if (!progress || !progress.published.length) {
    console.error(
      `\n⏪ registry 上没有任何 v${targetVersion} 的包，还没有半套发布，回滚本地版本号…`,
    );
    if (semver.valid(fallbackVersion)) syncVersions(fallbackVersion);
    console.error(`   已回到 v${fallbackVersion}，修复后重新执行：pnpm run release`);
    return;
  }

  saveState({
    fromVersion,
    targetVersion,
    published: progress.published,
    remaining: progress.pending,
    reason: message,
    updatedAt: new Date().toISOString(),
  });

  console.error(
    `\n⚠️  v${targetVersion} 已经有包进了 registry，本地版本号保持不动，现场已写入 ${STATE_NAME}`,
  );
  console.error(`   已发布（${progress.published.length}）：${progress.published.join("、")}`);
  if (progress.pending.length) {
    console.error(`   未发布（${progress.pending.length}）：${progress.pending.join("、")}`);
  }

  if (!progress.pending.length) {
    console.error("\n包其实都已经发布成功，只是收尾（文档/git）没走完。继续收尾：");
    console.error("  pnpm run release:resume");
    return;
  }

  console.error(`
继续把剩下的包补齐（pnpm publish 会跳过 registry 上已有的版本，可安全重复执行）：
  pnpm run release:resume

要判断这次该整包修复还是换版本号，先分清改的是哪个包：
  · 只改了「未发布」列表里的包 → 修好后直接 release:resume；
  · 改了「已发布」列表里的包 → 已发布的版本无法覆盖，只能撤销该版本或换新版本号重发：
      npm unpublish <包名>@${targetVersion} --force     # 仅 72 小时内有效，不推荐
      git checkout -- . 后删掉 ${STATE_NAME}，再选一个新版本号发布`);
}

async function execute(options, targetVersion, fromVersion, inspect) {
  releaseRun.fromVersion = fromVersion;
  releaseRun.targetVersion = targetVersion;

  releaseRun.stage = Stage.SYNC;
  syncVersions(targetVersion);

  if (options.skipBuild) {
    console.log(
      "\n⚠️  --skip-build：跳过构建，发出去的将是磁盘上现有产物（prepack 已关，不会兜底重建）",
    );
  } else {
    releaseRun.stage = Stage.BUILD;
    build();
  }

  const progress = inspect ?? (await inspectTarget(targetVersion));

  if (options.dryRun) {
    if (progress.pending.length && !options.skipRehearsal) {
      releaseRun.stage = Stage.REHEARSAL;
      rehearse(options, targetVersion);
    }
    syncVersions(fromVersion);
    console.log(`\n🎉 彩排结束：没有上传任何包，本地版本号已回滚到 v${fromVersion}`);
    return;
  }

  if (!progress.pending.length) {
    console.log(`\nℹ️  v${targetVersion} 的所有包都已在 registry 上，跳过彩排与发布，直接收尾。`);
  } else {
    if (!options.skipRehearsal) {
      releaseRun.stage = Stage.REHEARSAL;
      rehearse(options, targetVersion);
    }
    releaseRun.stage = Stage.PUBLISH;
    await publish(options, targetVersion);
  }

  await finish(options, targetVersion);
}

async function startRelease(options) {
  const currentVersion = readJson(ROOT_PACKAGE_JSON).version;
  console.log(`\n🚀 当前版本 v${currentVersion}\n`);

  if (options.yes && !options.target) {
    throw new ReleaseError("--yes 需要配合 --target <版本号> 使用：非交互模式下没法选择版本类型");
  }
  const targetVersion = (options.target || (await askVersion(currentVersion))).trim();
  if (!semver.valid(targetVersion)) throw new ReleaseError(`非法版本号：${targetVersion}`);
  if (!semver.gt(targetVersion, currentVersion)) {
    throw new ReleaseError(
      `目标版本 v${targetVersion} 必须高于当前版本 v${currentVersion}；若要续跑未完成的发布请用 --resume`,
    );
  }

  preflight(options, { checkDirty: true });

  let inspect;
  try {
    inspect = await inspectTarget(targetVersion);
  } catch (error) {
    console.log(
      `⚠️  查询 registry 失败（${error instanceof Error ? error.message : String(error)}），按全部未发布处理`,
    );
  }
  if (inspect && !inspect.pending.length) {
    throw new ReleaseError(
      `v${targetVersion} 在 registry 上已经完整存在，无需发布；代码有更新请换一个版本号。`,
    );
  }

  printPlan(targetVersion, inspect);

  if (!options.yes) {
    const { confirmed } = await prompt({
      type: "confirm",
      name: "confirmed",
      message: `确认发布 v${targetVersion}？`,
      initial: true,
    });
    if (!confirmed) {
      console.log("已取消。");
      return;
    }
  }

  await execute(options, targetVersion, currentVersion, inspect);
}

async function resumeRelease(options, state) {
  const targetVersion = (state?.targetVersion || readJson(ROOT_PACKAGE_JSON).version).trim();
  if (!semver.valid(targetVersion))
    throw new ReleaseError(`状态文件里的版本号非法：${targetVersion}`);
  const fromVersion = state?.fromVersion || readCommittedVersion() || targetVersion;

  releaseRun.resumed = true;
  console.log(`\n🔄 续跑发布 v${targetVersion}`);
  if (state) {
    console.log(
      `   上次记录：${describeState(state)}${state.reason ? `；中断原因：${state.reason}` : ""}`,
    );
  }

  preflight(options, { checkDirty: false });

  let inspect;
  try {
    inspect = await inspectTarget(targetVersion);
    console.log(
      `   registry 实况：已发布 ${inspect.published.length}/${inspect.packages.length}${inspect.pending.length ? `，仍缺 ${inspect.pending.join("、")}` : ""}`,
    );
  } catch (error) {
    console.log(
      `   ⚠️  查询 registry 失败（${error instanceof Error ? error.message : String(error)}），交给 pnpm 自己跳过已存在的版本`,
    );
  }

  await execute(options, targetVersion, fromVersion, inspect);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const state = loadState();
  if (state && !options.resume) {
    const { resume } = await prompt({
      type: "confirm",
      name: "resume",
      message: `检测到未完成的发布 v${state.targetVersion}（${describeState(state)}）。继续这次发布？`,
      initial: true,
    });
    if (!resume) {
      console.log(`已取消。放弃这次发布：删除 ${STATE_NAME} 并 git checkout -- .`);
      return;
    }
    options.resume = true;
  }

  if (options.resume) await resumeRelease(options, state);
  else await startRelease(options);
}

let handling = false;

let releaseArtifactBuilt = false;

function restoreDevArtifact() {
  if (!releaseArtifactBuilt) return;
  releaseArtifactBuilt = false;
  console.log("\n🧪 把外壳的开发产物建回开发档（发布构建是 WB_RELEASE=1，夹具按设计不在里面）…");
  try {
    const { status } = sh("node", ["scripts/build.mjs", "client"], {
      cwd: `${rootDir}/packages/core`,
      allowFailure: true,
    });
    if (status === 0) console.log("   ✅ 开发档已重建 —— `pnpm run dev` 与 `?wbMock=1` 照常");
    else console.error("   ⚠️  开发档重建失败，跑一次 `cd packages/core && node scripts/build.mjs client` 即可");
  } catch (error) {
    console.error(`   ⚠️  开发档重建没跑成：${error instanceof Error ? error.message : String(error)}`);
  }
}

process.on("exit", restoreDevArtifact);

async function bail(error, exitCode) {
  if (handling) return;
  handling = true;
  await handleFailure(error);
  process.exit(exitCode);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (handling) {
      console.error("\n⚠️  再次收到中断信号，强制退出。");
      process.exit(130);
    }
    void bail(new ReleaseError(`收到 ${signal}，发布被中断`), 130);
  });
}
process.on("uncaughtException", (error) => {
  void bail(error, 1);
});

main().catch((error) => {
  void bail(error, 1);
});
