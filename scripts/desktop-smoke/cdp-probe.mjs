import fs from 'node:fs';
import { execa } from 'execa';
import { delimiter, join } from 'node:path';

const port = process.argv[2] ?? '9222';
const shot = process.argv[3] ?? 'desktop-smoke.png';
const expectWorkbench = process.argv.includes('--expect-workbench');
const installViaUi = process.argv.includes('--install-via-ui');
const verifyOnly = process.argv.includes('--verify-only');
const selfUpdateFlow = process.argv.includes('--self-update');
const flagValue = (name) => {
  const inline = process.argv.find((one) => one.startsWith(`${name}=`));
  if (inline !== undefined) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  if (index === -1) return '';
  const next = process.argv[index + 1];
  return next === undefined || next.startsWith('--') ? '' : next;
};
const addPluginFlagged = process.argv.some(
  (one) => one === '--add-plugin' || one.startsWith('--add-plugin='),
);
const addPluginSpec = (
  flagValue('--add-plugin') || (addPluginFlagged ? (process.env.DESKTOP_SMOKE_PLUGIN ?? '') : '')
).trim();
const workbenchSpec = process.env.DESKTOP_WORKBENCH_SPEC ?? '@dsh-workbench/core';
const marketSource = process.env.DESKTOP_SMOKE_MARKET ?? 'https://github.com/novaeth/dsh-workbench-market.git';
const moduleName = process.env.DESKTOP_SMOKE_MODULE ?? '@dsh-workbench/module-hello';
const expectedRunningVersion = (process.env.DESKTOP_SMOKE_EXPECT_RUNNING_VERSION ?? '').trim();
const deadlineAt = Date.now() + Number(process.env.DESKTOP_SMOKE_DEADLINE_MS ?? 720_000);
const outDir = process.env.DESKTOP_SMOKE_OUT ?? process.cwd();
const outPath = (name) => join(outDir, name);
const prefix = shot.replace(/\.png$/u, '');
const probeLogFile = process.env.DESKTOP_SMOKE_PROBE_LOG ?? outPath(`${prefix}-probe.log`);
const CDP_WAIT_MS = 180_000;
const PAGE_WAIT_MS = 120_000;
const INSTALL_WAIT_MS = 360_000;
const GATE_WAIT_MS = 360_000;
const READY_WAIT_MS = 450_000;
const MARKET_WAIT_MS = 300_000;
const BRIDGE_WAIT_MS = 600_000;
const BRIDGE_RETRY_MS = 15_000;
const MODULE_WAIT_MS = 90_000;
const POLL_MS = 2000;
const DIALOG_SELECTOR = '[role="dialog"], [aria-modal="true"], dialog[open]';
const SPEC_FIELD_SELECTOR = 'input[aria-label="包名"], input[aria-label="Package"]';
const addOpenTexts = ['添加模块', 'Add module'];
const addRunTexts = ['安装', 'Install'];
const addCloseTexts = ['关闭', 'Close'];
const specLabels = ['包名', 'Package'];
const pluginPreviewRe = /这是一份[^\n]*插件|插件名：|This is [^\n]*plugin|Plugin name:/u;
const pluginInstalledRe = /装上了：|Installed:/u;
const workbenchTitles = ['工作台', 'Workbench'];
const workbenchUpdateTexts = ['更新', 'Update'];
const selfUpdateReadyRe = /新版本已就绪|new version is ready|restart to pick it up|restart required/iu;
const selfUpdateFailedRe =
  /工作台更新失败|工作台更新未成功|The workbench update failed|did not go through|rolled back|已回滚|已用本地备份还原/iu;

const startedAt = Date.now();
const elapsed = () => `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
const append = (file, text) => {
  try {
    fs.appendFileSync(file, text);
  } catch {
    return;
  }
};
const log = (message) => {
  const line = `[${elapsed()}] ${message}`;
  process.stdout.write(`${line}\n`);
  append(probeLogFile, `${line}\n`);
};
const milestones = {};
let activeCdp = null;
let browserState = 'pending';
let extensionConnected = false;

function mark(name) {
  milestones[name] = elapsed();
  log(`MILESTONE ${name} @ ${milestones[name]}`);
}

function writeText(file, text) {
  const target = outPath(file);
  fs.writeFileSync(target, text);
  log(`WROTE ${target} (${text.length} bytes)`);
}

function summary(outcome, extra = {}) {
  log(`SMOKE_SUMMARY ${JSON.stringify({ outcome, elapsed: elapsed(), milestones, ...extra })}`);
}

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function remaining(label, budgetMs) {
  const left = Math.min(deadlineAt - Date.now(), budgetMs);
  if (left <= 0) throw new Error(`${label}: 超过整轮预算（${elapsed()}）`);
  return left;
}

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  return response.json();
}

async function waitForCdp() {
  const until = Date.now() + remaining('等桌面调试端口', CDP_WAIT_MS);
  let last = '';
  while (Date.now() < until) {
    try {
      const version = await fetchJson(`http://127.0.0.1:${port}/json/version`);
      mark('cdp-ready');
      log(`桌面端点就绪：${version.Browser ?? 'unknown'}`);
      return;
    } catch (error) {
      last = String(error?.message ?? error);
      await sleep(1000);
    }
  }
  throw new Error(`桌面在预算内没开调试端口 ${port}：${last}`);
}

async function pagesOf() {
  const response = await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(5000) });
  return response.json();
}

function isAppPage(page) {
  return page.type === 'page' && page.url.startsWith('dsh-app://');
}

function isWelcomePage(page) {
  return page.type === 'page' && page.url.includes('welcome.html');
}

async function waitForPages() {
  const until = Date.now() + remaining('等桌面页面', PAGE_WAIT_MS);
  let pages;
  while (Date.now() < until) {
    pages = await pagesOf().catch(() => []);
    log(`pages: ${pages.map((page) => page.url).join(' | ') || '空'}`);
    if (pages.some(isWelcomePage) || pages.some(isAppPage)) return pages;
    await sleep(1000);
  }
  throw new Error(`桌面页面没出现（预算 ${PAGE_WAIT_MS}ms）`);
}

async function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  const timers = new Map();
  const events = [];
  const settle = (id, work) => {
    const waiter = pending.get(id);
    pending.delete(id);
    const timer = timers.get(id);
    timers.delete(id);
    if (timer !== undefined) clearTimeout(timer);
    if (waiter !== undefined) work(waiter);
  };
  socket.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    if (data.id === undefined) {
      if (['Runtime.consoleAPICalled', 'Runtime.exceptionThrown', 'Log.entryAdded'].includes(data.method)) {
        if (events.length < 300) events.push({ method: data.method, params: data.params });
      }
      return;
    }
    settle(data.id, (waiter) => {
      if (data.error !== undefined) waiter.reject(new Error(JSON.stringify(data.error)));
      else waiter.resolve(data.result);
    });
  });
  socket.addEventListener('close', () => {
    for (const id of [...pending.keys()]) {
      settle(id, (waiter) => waiter.reject(new Error('CDP 连接断了（页面重载或窗口关了）')));
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      timers.set(
        id,
        setTimeout(() => {
          settle(id, (waiter) => waiter.reject(new Error(`CDP ${method} 20 秒没回（页面可能正在重载）`)));
        }, 20_000),
      );
      socket.send(JSON.stringify({ id, method, params }));
    });
  return { send, close: () => socket.close(), events: () => events };
}

async function bodyOf(cdp) {
  try {
    const result = await cdp.send('Runtime.evaluate', {
      expression: '(document.body.innerText || document.body.textContent || "")',
      returnByValue: true,
    });
    return result.result?.value ?? '';
  } catch (error) {
    log(`body 读不到（页面在重载？）：${String(error?.message ?? error)}`);
    return '';
  }
}

async function preflightOf(cdp) {
  const result = await cdp.send('Runtime.evaluate', {
    expression: `fetch('/workbench/api/preflight').then((r) => r.json()).then((value) => JSON.stringify(value)).catch(() => '')`,
    awaitPromise: true,
    returnByValue: true,
  });
  const raw = result.result?.value ?? '';
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function stepStates(snapshot) {
  const steps = snapshot?.steps;
  if (!Array.isArray(steps)) return 'none';
  return steps.map((item) => `${item.id}:${item.status}${item.action === undefined ? '' : `(${item.action})`}`).join(' ');
}

function readTail(file, length) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    return text.replaceAll('\n', ' | ').slice(-length);
  } catch {
    return '';
  }
}

function tailBody(body, length = 240) {
  return body.replaceAll('\n', ' | ').slice(-length);
}

async function capture(cdp, file) {
  const target = outPath(file);
  try {
    const image = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(target, Buffer.from(image.data, 'base64'));
    log(`SHOT ${target} (${fs.statSync(target).size} bytes)`);
    return target;
  } catch (error) {
    log(`SHOT 失败（证据少一张，不影响判定）：${String(error?.message ?? error)}`);
    return undefined;
  }
}

async function fail(cdp, reason, body, snapshot) {
  log(`FAIL ${reason}`);
  if (activeCdp !== null) writeText(`${prefix}-console-events.json`, `${JSON.stringify(activeCdp.events(), null, 2)}\n`);
  if (snapshot !== undefined) log(`PREFLIGHT_FAILED: ${JSON.stringify(snapshot).slice(0, 8000)}`);
  writeText(`${prefix}-failed-body.txt`, body);
  if (snapshot !== undefined) writeText(`${prefix}-failed-preflight.json`, `${JSON.stringify(snapshot, null, 2)}\n`);
  await capture(cdp, `${prefix}-failed.png`).catch(() => undefined);
  throw new Error(`${reason}（现场：${prefix}-failed-body.txt / ${prefix}-failed-preflight.json）`);
}

function dialogScope() {
  return `(() => {
  const direct = document.querySelector(${JSON.stringify(DIALOG_SELECTOR)});
  if (direct !== null) return direct;
  const labels = ${JSON.stringify(specLabels)};
  const field = [...document.querySelectorAll('input[aria-label]')].find((node) => labels.includes(node.getAttribute('aria-label') ?? ''));
  if (field === undefined) return document.body;
  const actions = ${JSON.stringify([...addRunTexts, ...addCloseTexts])};
  let node = field.parentElement;
  while (node !== null && ![...node.querySelectorAll('button')].some((one) => actions.includes((one.innerText ?? '').trim()))) node = node.parentElement;
  return node ?? document.body;
})()`;
}

function clickExpression(texts, scope = 'document') {
  const root = scope === 'dialog' ? dialogScope() : scope === 'document' ? 'document' : `(${scope})`;
  return `(() => {
  const wanted = ${JSON.stringify(texts)};
  const root = ${root};
  if (root === null || root === undefined) return 'missing';
  const nodes = [...root.querySelectorAll('button, a, [role="button"], [role="tab"]')].filter((node) => node.disabled !== true && node.getAttribute('aria-disabled') !== 'true');
  const labelOf = (node) => (node.getAttribute('aria-label') ?? '').trim();
  const textOf = (node) => (node.innerText ?? '').trim();
  for (const text of wanted) {
    const exact = nodes.find((node) => textOf(node) === text || labelOf(node) === text);
    if (exact !== undefined) { exact.click(); return text; }
  }
  for (const text of wanted) {
    const loose = nodes.find((node) => textOf(node).includes(text) || labelOf(node).includes(text));
    if (loose !== undefined) { loose.click(); return '~' + text; }
  }
  return 'missing';
})()`;
}

async function click(cdp, texts, waitMs = 2000, scope = 'document') {
  const result = await cdp.send('Runtime.evaluate', { expression: clickExpression(texts, scope), returnByValue: true });
  log(`STEP click ${JSON.stringify(texts)}: ${JSON.stringify(result.result?.value)}`);
  await sleep(waitMs);
  return result.result?.value;
}

async function pressEscape(cdp) {
  await cdp.send('Runtime.evaluate', {
    expression: `(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return 'escape'; })()`,
    returnByValue: true,
  });
}

async function clickWaiting(cdp, texts, budgetMs = 60_000, scope = 'document') {
  const until = Date.now() + remaining(`等按钮 ${texts[0]}`, budgetMs);
  while (Date.now() < until) {
    const last = await click(cdp, texts, 1200, scope);
    if (last !== 'missing') return last;
    await sleep(1000);
  }
  throw new Error(`等不到按钮：${JSON.stringify(texts)}`);
}

async function addPluginDialog(cdp) {
  const until = Date.now() + remaining('等 Add plugin 弹窗', 60_000);
  while (Date.now() < until) {
    await click(cdp, ['Add plugin'], 800);
    const state = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const field = document.querySelector('input[aria-label="Package name or address"]');
        if (field !== null) { field.focus(); return JSON.stringify({ ok: true }); }
        const dialog = document.querySelector('[role="dialog"], [aria-modal="true"]');
        return JSON.stringify({ ok: false, dialog: dialog !== null, body: (document.body.innerText || '').slice(-160) });
      })()`,
      returnByValue: true,
    });
    const raw = state.result?.value ?? '{}';
    log(`add-plugin wait: ${raw}`);
    if (raw.includes('"ok":true')) return;
    await sleep(1500);
  }
  throw new Error('Add plugin 弹窗没出来（60s，重试过点 Add plugin）');
}

async function confirmInstall(cdp, budgetMs = 60_000) {
  const until = Date.now() + remaining('等安装确认弹窗里的 Install', budgetMs);
  let last = '';
  while (Date.now() < until) {
    const answer = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const dialog = document.querySelector('[role="dialog"], [aria-modal="true"]');
        const scope = dialog ?? document;
        const buttons = [...scope.querySelectorAll('button')];
        const target = buttons.filter((node) => (node.innerText ?? '').trim() === 'Install').at(-1);
        if (target !== undefined) {
          target.click();
          return JSON.stringify({ clicked: true });
        }
        return JSON.stringify({
          clicked: false,
          labels: buttons.map((node) => (node.innerText ?? '').trim()).filter((one) => one !== ''),
        });
      })()`,
      returnByValue: true,
    });
    last = String(answer.result?.value ?? '');
    log(`confirm install: ${last}`);
    try {
      const state = JSON.parse(last);
      if (state.clicked === true) return true;
    } catch {

    }
    await sleep(500);
  }
  log(`confirm install 等到超时：${last}`);
  return false;
}

async function waitForBody(cdp, pattern, budgetMs, label) {
  const until = Date.now() + remaining(label, budgetMs);
  let body;
  while (Date.now() < until) {
    body = await bodyOf(cdp);
    log(`${label}: ${tailBody(body, 200)}`);
    if (pattern.test(body)) return body;
    await sleep(POLL_MS);
  }
  throw new Error(`${label}: 等不到 ${String(pattern)}`);
}

async function installFromPluginPage(cdp) {
  await waitForBody(cdp, /Plugins|插件/u, PAGE_WAIT_MS, 'app-shell');
  await clickWaiting(cdp, ['Plugins'], 60_000);
  await waitForBody(cdp, /Add plugin|Loading plugins|添加插件/u, 60_000, 'plugins-page');
  writeText(`${prefix}-plugins-body.txt`, await bodyOf(cdp));
  await addPluginDialog(cdp);

  const fields = await cdp.send('Runtime.evaluate', {
    expression: `JSON.stringify([...document.querySelectorAll('input, textarea')].map((node, index) => ({ index, tag: node.tagName, type: node.type, placeholder: node.placeholder, aria: node.getAttribute('aria-label'), visible: node.offsetParent !== null })))`,
    returnByValue: true,
  });
  log(`FIELDS: ${fields.result?.value ?? ''}`);

  await cdp.send('Input.insertText', { text: workbenchSpec });
  await sleep(500);
  const filled = await cdp.send('Runtime.evaluate', {
    expression: `document.querySelector('input[aria-label="Package name or address"]')?.value ?? ''`,
    returnByValue: true,
  });
  const filledValue = filled.result?.value ?? '';
  log(`filled: ${JSON.stringify(filledValue)}`);
  if (filledValue !== workbenchSpec) throw new Error(`安装规格没填进去（字段读到 ${JSON.stringify(filledValue)}）`);

  await clickWaiting(cdp, ['Install'], 60_000);
  mark('install-clicked');

  let installBody = '';
  let installed = false;
  const installUntil = Date.now() + remaining('等插件安装', INSTALL_WAIT_MS);
  while (Date.now() < installUntil) {
    await sleep(POLL_MS);
    installBody = await bodyOf(cdp);
    log(`install wait: ${tailBody(installBody, 200)}`);
    if (/Installed|Enable now|重启 DSH|restart DSH/u.test(installBody)) {
      installed = true;
      break;
    }
    if (/failed|Failed|错误|失败|not found|refused/u.test(installBody)) break;
  }
  if (!installed) {
    writeText(`${prefix}-install-body.txt`, installBody);
    await fail(cdp, 'workbench plugin install did not finish', installBody, await preflightOf(cdp));
  }
  mark('installed');
  if (/Enable now/u.test(installBody)) await click(cdp, ['Enable now']);
  await pressEscape(cdp);
  await sleep(3000);
}

function stepStatusOf(snapshot, id) {
  const steps = snapshot?.steps;
  if (!Array.isArray(steps)) return '';
  return String(steps.find((item) => item.id === id)?.status ?? '');
}

async function launchSmokeBrowser() {
  const binary = (process.env.DESKTOP_SMOKE_CHROME ?? '').trim();
  const extension = (process.env.DESKTOP_SMOKE_EXTENSION ?? '').trim();
  if (binary === '' || extension === '') {
    log('浏览器扩展：没给 DESKTOP_SMOKE_CHROME / DESKTOP_SMOKE_EXTENSION，跳过"装扩展再重试"');
    browserState = 'missing-env';
    return browserState;
  }
  const profile = join(process.env.RUNNER_TEMP ?? outDir, 'opencli-browser-profile');
  const chromeLog = outPath(`${prefix}-chrome.log`);
  log(`模拟用户装扩展：起浏览器 ${binary}（--load-extension=${extension}，日志 ${chromeLog}）`);
  const fd = fs.openSync(chromeLog, 'a');
  const child = execa(
    binary,
    [
      `--user-data-dir=${profile}`,
      `--load-extension=${extension}`,
      `--disable-extensions-except=${extension}`,
      '--remote-debugging-port=9333',
      '--disable-features=DisableLoadExtensionCommandLineSwitch',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--window-size=1280,900',
      '--no-first-run',
      '--no-default-browser-check',
    ],
    { detached: true, stdio: ['ignore', fd, fd], cleanup: false },
  );
  child.catch((error) => log(`浏览器起不来：${String(error?.message ?? error)}`));
  browserState = 'launched';
  mark('browser-launched');
  return browserState;
}

function doctorCommand() {
  const bin = (process.env.DESKTOP_SMOKE_OPENCLI ?? '').trim();
  if (bin === '') return null;
  return { file: bin, args: ['doctor'] };
}

async function doctorText() {
  const command = doctorCommand();
  if (command === null) return '';
  const nodeBin = (process.env.DESKTOP_SMOKE_NODE_BIN ?? '').trim();
  const path =
    nodeBin === ''
      ? process.env.PATH
      : [nodeBin, process.env.PATH ?? ''].filter((one) => one !== '').join(delimiter);
  const result = await execa(command.file, command.args, {
    timeout: 60_000,
    reject: false,
    env: { ...process.env, PATH: path ?? '' },
  }).catch((error) => ({ exitCode: null, stdout: '', stderr: String(error), failed: true }));
  const text = `${result?.stdout ?? ''}\n${result?.stderr ?? ''}`;
  if (text.trim() === '') {
    log(`doctor 没输出：file=${command.file} args=${JSON.stringify(command.args)} exit=${String(result?.exitCode)}`);
  }
  return text;
}

async function chromeTargets() {
  try {
    const response = await fetch('http://127.0.0.1:9333/json', { signal: AbortSignal.timeout(3000) });
    const pages = await response.json();
    return pages.map((page) => `${page.type}:${page.url}`).join(' | ');
  } catch (error) {
    return `（读不到调试端口）${String(error?.message ?? error)}`;
  }
}

async function waitExtensionConnected() {
  const until = Date.now() + remaining('等浏览器扩展连上', BRIDGE_WAIT_MS);
  while (Date.now() < until) {
    const text = await doctorText();
    const connected = /"extensionConnected":true/u.test(text) || /\[OK\] Extension:/u.test(text);
    const lines = text
      .split('\n')
      .filter((one) => /Extension:|extensionConnected|Issues:/u.test(one))
      .slice(-3)
      .join(' | ');
    log(`extension wait: ${connected ? 'connected' : 'not-connected'} :: ${lines}`);
    log(`chrome targets: ${await chromeTargets()}`);
    const chromeLog = outPath(`${prefix}-chrome.log`);
    if (!connected && fs.existsSync(chromeLog)) {
      log(`chrome log: ${readTail(chromeLog, 400)}`);
    }
    if (connected) {
      extensionConnected = true;
      return true;
    }
    await sleep(3000);
  }
  return false;
}

async function bridgeGate(cdp, snapshot, body, state) {
  const steps = Array.isArray(snapshot?.steps) ? snapshot.steps : [];
  const busy = steps.some((step) => step.status === 'running' || step.status === 'pending');
  if (busy) {
    log(`体检还在跑，先等它：${steps.map((step) => `${step.id}:${step.status ?? '?'}`).join(' · ')}`);
    return false;
  }
  const bridge = stepStatusOf(snapshot, 'bridge');
  if (bridge === '' || bridge === 'ok') return true;
  if (browserState === 'pending') await launchSmokeBrowser();
  if (browserState === 'missing-env') return true;
  if (!extensionConnected) {
    const connected = await waitExtensionConnected();
    if (!connected) {
      await fail(cdp, '浏览器扩展没连上（doctor 一直报 not connected）', body, snapshot);
    }
  }
  if (state.deadline === 0) state.deadline = Date.now() + remaining('等浏览器通道', BRIDGE_WAIT_MS);
  if (Date.now() > state.deadline) {
    await fail(cdp, `浏览器通道没连上（装扩展 + Retry 之后 bridge 还是 ${bridge}）`, body, snapshot);
  }
  if (Date.now() - state.retriedAt >= BRIDGE_RETRY_MS) {
    state.retriedAt = Date.now();
    await click(cdp, ['Retry', '重试'], 1200);
  }
  return false;
}

async function hostProbe(cdp) {
  const result = await cdp.send('Runtime.evaluate', {
    expression: `(async () => {
      const statusOf = async (path) => {
        try {
          const r = await fetch(path);
          const body = await r.text();
          return { status: r.status, body: body.slice(0, 400) };
        } catch (error) {
          return { status: 0, body: String(error) };
        }
      };
      const boot = window.__DSH_BOOT__;
      return JSON.stringify({
        href: location.href,
        health: await statusOf('/workbench/api/health'),
        preflight: await statusOf('/workbench/api/preflight'),
        units: await statusOf('/workbench/api/unit-manifests'),
        bootKeys: boot === undefined || boot === null ? null : Object.keys(boot),
        plugins: (boot?.entries ?? boot?.modules ?? boot?.plugins ?? []).slice(0, 20),
        scripts: [...document.querySelectorAll('script')].map((node) => node.src).filter((src) => src !== '').slice(0, 20),
      });
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  try {
    return JSON.parse(result.result?.value ?? '{}');
  } catch {
    return { raw: String(result.result?.value ?? '') };
  }
}

async function waitForGateAndReady(cdp) {
  const gateShot = `${prefix}-gate.png`;
  const gateOpenShot = `${prefix}-gate-open.png`;
  const continueTexts = ['Enter the workbench anyway', '仍然进入工作台'];
  let gateCaptured = false;
  let gateBody = '';
  let readyBody = '';
  let snapshot;
  const bridgeState = { retriedAt: 0, deadline: 0 };

  const gateUntil = Date.now() + remaining('等体检画面', GATE_WAIT_MS);
  while (Date.now() < gateUntil) {
    gateBody = await bodyOf(cdp);
    snapshot = await preflightOf(cdp);
    const phase = snapshot?.phase ?? '';
    log(`health wait [${phase}] ${stepStates(snapshot)} :: ${tailBody(gateBody, 220)}`);
    if (phase === 'failed') await fail(cdp, 'preflight failed', gateBody, snapshot);
    if (!gateCaptured && (gateBody.includes('›') || /Check the environment|检查环境/u.test(gateBody))) {
      await capture(cdp, gateShot);
      const opened = await cdp.send('Runtime.evaluate', {
        expression: `(() => { const head = document.querySelector('li[data-expandable="true"] .head'); if (head === null) return false; head.click(); return true; })()`,
        returnByValue: true,
      });
      if (opened.result?.value === true) {
        await sleep(800);
        await capture(cdp, gateOpenShot);
      }
      gateCaptured = true;
      mark('gate-seen');
      writeText(`${prefix}-gate-body.txt`, gateBody);
      writeText(`${prefix}-gate-preflight.json`, `${JSON.stringify(snapshot, null, 2)}\n`);
    }
    if (!(await bridgeGate(cdp, snapshot, gateBody, bridgeState))) {
      await sleep(POLL_MS);
      continue;
    }
    const continueText = continueTexts.find((text) => gateBody.includes(text));
    if (continueText !== undefined) {
      await click(cdp, [continueText], 3000);
      continue;
    }
    if (!/Preparing the workbench|准备工作台/u.test(gateBody)) break;
    await sleep(POLL_MS);
  }

  const readyUntil = Date.now() + remaining('等体检 ready', READY_WAIT_MS);
  while (Date.now() < readyUntil) {
    readyBody = await bodyOf(cdp);
    snapshot = await preflightOf(cdp);
    const phase = snapshot?.phase ?? '';
    log(`ready wait [${phase}] ${stepStates(snapshot)} :: ${tailBody(readyBody, 220)}`);
    if (phase === 'failed') await fail(cdp, 'preflight failed', readyBody, snapshot);
    if (!(await bridgeGate(cdp, snapshot, readyBody, bridgeState))) {
      await sleep(POLL_MS);
      continue;
    }
    const continueText = continueTexts.find((text) => readyBody.includes(text));
    if (continueText !== undefined) {
      await click(cdp, [continueText], 3000);
      continue;
    }
    if (phase === 'ready' && !/Preparing the workbench|准备工作台/u.test(readyBody) && /Workbench panel|工作台面板/u.test(readyBody)) {
      mark('ready');
      return snapshot;
    }
    await sleep(POLL_MS);
  }
  writeText(`${prefix}-not-ready-body.txt`, readyBody);
  writeText(`${prefix}-host-probe.json`, `${JSON.stringify(await hostProbe(cdp), null, 2)}\n`);
  await fail(cdp, 'preflight not ready', readyBody, snapshot);
}

async function openMarket(cdp) {
  const opened = await click(
    cdp,
    [
      'Browse the module market',
      'Choose modules',
      'Browse modules',
      'Open the module market',
      'Workbench module market',
      '模块市场',
      '浏览模块',
      '工作台模块市场',
    ],
    3000,
  );
  if (opened === 'missing') await fail(cdp, '打开市场页没找到入口', await bodyOf(cdp));
  await waitForBody(
    cdp,
    /装在这台机器上|Installed on this machine|Discover/u,
    MARKET_WAIT_MS,
    'market-page',
  );
  mark('market-open');
}

async function openInstalledTab(cdp) {
  const tabs = ['已安装', 'Installed'];
  const until = Date.now() + remaining('切到已安装', 30_000);
  while (Date.now() < until) {
    const hit = await click(cdp, tabs, 800);
    if (hit !== 'missing') return;
    await sleep(1000);
  }
  log('没找到「已安装」页签：接着按原样点「添加模块」（老版本没有页签）');
}

async function clickStep(cdp, texts, budgetMs, scope, step) {
  const until = Date.now() + remaining(step, budgetMs);
  let last;
  while (Date.now() < until) {
    last = await click(cdp, texts, 1200, scope);
    if (last !== 'missing') return last;
    await sleep(1000);
  }
  await fail(cdp, `${step}：等不到按钮 ${JSON.stringify(texts)}（scope=${scope}，可能是 disabled 或入口文案变了）`, await bodyOf(cdp));
}

async function alertTextOf(cdp) {
  const result = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
  const field = document.querySelector(${JSON.stringify(SPEC_FIELD_SELECTOR)});
  if (field === null) return '';
  const node = ${dialogScope()}.querySelector('[role="alert"]');
  return (node?.textContent ?? '').trim();
})()`,
    returnByValue: true,
  });
  return result.result?.value ?? '';
}

async function domSnapshot(cdp) {
  const result = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
  const all = [...document.querySelectorAll('button, [role="button"], [role="tab"], [role="dialog"], [aria-modal="true"], input, [role="tabpanel"]')];
  return JSON.stringify({
    marketRoot: [...document.querySelectorAll('[id^="workbench-market"]')].map((node) => ({ id: node.id, hidden: node.hidden === true })),
    dialogs: document.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog[open]').length,
    nodes: all.slice(0, 120).map((node) => ({
      tag: node.tagName,
      text: (node.innerText ?? '').trim().slice(0, 40),
      aria: node.getAttribute('aria-label'),
      role: node.getAttribute('role'),
      id: node.id || null,
      hidden: node.hidden === true,
      selected: node.getAttribute('aria-selected'),
      disabled: node.disabled === true || node.getAttribute('aria-disabled') === 'true',
      inPanel: node.closest('[id^="workbench-market"]') !== null,
    })),
  });
})()`,
    returnByValue: true,
  });
  return String(result.result?.value ?? '');
}

async function waitForAddDialog(cdp) {
  const until = Date.now() + remaining('等添加模块浮层', MODULE_WAIT_MS);
  let last = '';
  while (Date.now() < until) {
    const state = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const dialog = ${dialogScope()};
        const field = document.querySelector(${JSON.stringify(SPEC_FIELD_SELECTOR)});
        const buttons = [...dialog.querySelectorAll('button')].map((node) => (node.innerText ?? '').trim() || (node.getAttribute('aria-label') ?? '').trim()).filter((one) => one !== '');
        return JSON.stringify({ field: field !== null, buttons });
      })()`,
      returnByValue: true,
    });
    last = state.result?.value ?? '';
    log(`add-plugin dialog wait: ${last}`);
    if (last.includes('"field":true')) return;
    await sleep(1500);
  }
  writeText(`${prefix}-add-plugin-dom.json`, `${await domSnapshot(cdp)}\n`);
  await fail(
    cdp,
    `添加模块浮层没出来（等不到 ${SPEC_FIELD_SELECTOR}，浮层选择器 ${DIALOG_SELECTOR}；最后看到 ${last}）`,
    await bodyOf(cdp),
  );
}

async function fillAddSpec(cdp, spec) {
  const focused = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const field = document.querySelector(${JSON.stringify(SPEC_FIELD_SELECTOR)}); if (field === null) return 'missing'; field.focus(); return field.value; })()`,
    returnByValue: true,
  });
  log(`add-plugin spec field: ${JSON.stringify(focused.result?.value)}`);
  if (focused.result?.value === 'missing') {
    await fail(cdp, `添加模块浮层里没有包名输入框 ${SPEC_FIELD_SELECTOR}`, await bodyOf(cdp));
  }
  await cdp.send('Input.insertText', { text: spec });
  await sleep(500);
  const filled = await cdp.send('Runtime.evaluate', {
    expression: `document.querySelector(${JSON.stringify(SPEC_FIELD_SELECTOR)})?.value ?? ''`,
    returnByValue: true,
  });
  const value = filled.result?.value ?? '';
  log(`add-plugin filled: ${JSON.stringify(value)}`);
  if (value !== spec) {
    await fail(
      cdp,
      `包名没填进去（字段读到 ${JSON.stringify(value)}，要填 ${JSON.stringify(spec)}）`,
      await bodyOf(cdp),
    );
  }
}

async function waitForPluginPreview(cdp) {
  const until = Date.now() + remaining('等插件预检预览', MODULE_WAIT_MS);
  let body = '';
  while (Date.now() < until) {
    body = await bodyOf(cdp);
    const alert = await alertTextOf(cdp);
    log(`plugin preview wait: ${alert === '' ? '' : `ALERT ${alert} :: `}${tailBody(body, 200)}`);
    if (pluginPreviewRe.test(body)) return body;
    if (alert !== '') {
      writeText(`${prefix}-add-plugin-body.txt`, body);
      await fail(cdp, `插件预检没通过：${alert}`, body);
    }
    await sleep(POLL_MS);
  }
  writeText(`${prefix}-add-plugin-body.txt`, body);
  await fail(cdp, '预检之后没出现插件预览（等不到插件预览/插件名那两行）', body);
}

async function addPluginViaMarket(cdp, spec) {
  const result = { spec, preview: false, installed: false, market: false };
  await openMarket(cdp);
  result.market = true;
  mark('add-plugin-market');
  await openInstalledTab(cdp);
  await clickStep(cdp, addOpenTexts, 60_000, 'document', '点开添加模块');
  await waitForAddDialog(cdp);
  await fillAddSpec(cdp, spec);
  await clickStep(cdp, addRunTexts, 30_000, 'dialog', '点预检');
  mark('plugin-check-clicked');
  const previewBody = await waitForPluginPreview(cdp);
  result.preview = true;
  mark('plugin-preview');
  writeText(`${prefix}-add-plugin-preview-body.txt`, previewBody);
  await clickStep(cdp, addRunTexts, 30_000, 'dialog', '点安装');
  mark('plugin-install-clicked');
  const doneBody = await waitForBody(
    cdp,
    /装上了：|Installed:|模块安装失败|Module install failed|已取消|Cancelled/u,
    INSTALL_WAIT_MS,
    'plugin-installed',
  );
  if (!pluginInstalledRe.test(doneBody)) {
    writeText(`${prefix}-add-plugin-body.txt`, doneBody);
    await fail(cdp, '安装结果不是「装上了」那一行（失败或被取消）', doneBody);
  }
  result.installed = true;
  mark('plugin-installed');
  writeText(`${prefix}-add-plugin-body.txt`, doneBody);
  writeText(`${prefix}-add-plugin.json`, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

async function smokeMarket(cdp) {
  const result = { market: marketSource, module: moduleName, listed: false, installed: false, restartHint: false };
  await openMarket(cdp);
  await click(cdp, ['Discover'], 2000);

  let body = await bodyOf(cdp);
  if (!/dsh-workbench-market|github\.com/u.test(body)) {
    const add = await click(
      cdp,
      ['Add module source', '添加模块来源', 'Add index source', 'Manage index sources…', '管理索引源…'],
      1500,
    );
    if (add === 'missing') await fail(cdp, '发现页上没有添加索引源的入口', body);
    const focused = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const labels = ['Index URL', '索引 URL'];
        const byLabel = [...document.querySelectorAll('input[aria-label]')].find((node) =>
          labels.includes(node.getAttribute('aria-label') ?? ''));
        const field = byLabel ?? document.querySelector('[role="dialog"] input, [data-modal-autofocus]');
        if (field === null || field === undefined) return 'missing';
        field.focus();
        return field.value;
      })()`,
      returnByValue: true,
    });
    log(`source field: ${JSON.stringify(focused.result?.value)}`);
    if (focused.result?.value === 'missing') {
      writeText(`${prefix}-market-dialog-body.txt`, await bodyOf(cdp));
      await fail(cdp, '索引源弹窗里没有 Index URL 输入框', await bodyOf(cdp));
    }
    await cdp.send('Input.insertText', { text: marketSource });
    await sleep(300);
    await click(cdp, ['Add'], 3000, 'dialog');
    mark('market-source-added');
    await pressEscape(cdp);
    await sleep(2000);
  }

  body = await waitForBody(cdp, /module-hello|Sample module/u, MARKET_WAIT_MS, 'market-listing');
  result.listed = true;
  mark('market-listed');
  writeText(`${prefix}-market-body.txt`, body);

  const installClicked = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const button = [...document.querySelectorAll('button')].find((node) => (node.getAttribute('aria-label') ?? '').startsWith('Install '));
      if (button === undefined) return 'missing';
      button.click();
      return button.getAttribute('aria-label');
    })()`,
    returnByValue: true,
  });
  log(`STEP row install: ${JSON.stringify(installClicked.result?.value)}`);
  if (installClicked.result?.value === 'missing') {
    await fail(cdp, '市场条目上没有安装按钮', body);
  }
  const confirmed = await confirmInstall(cdp);
  if (!confirmed) {
    writeText(`${prefix}-market-confirm-body.txt`, await bodyOf(cdp));
    await fail(cdp, '安装确认弹窗里没有 Install 按钮', await bodyOf(cdp));
  }
  mark('market-install-clicked');

  const doneBody = await waitForBody(
    cdp,
    /Installed:|restart once|Failed:|Didn't install|Not installable|no newer version|could not be installed/u,
    MODULE_WAIT_MS,
    'market-install',
  );
  writeText(`${prefix}-market-installed.txt`, doneBody);
  result.installed = /Installed:|restart once/u.test(doneBody);
  result.restartHint = /restart/u.test(doneBody);
  mark('market-installed');
  return result;
}

async function unitsOf(cdp) {
  const result = await cdp.send('Runtime.evaluate', {
    expression: `fetch('/workbench/api/unit-manifests').then((r) => r.json()).then((value) => JSON.stringify(value)).catch(() => '')`,
    awaitPromise: true,
    returnByValue: true,
  });
  const raw = result.result?.value ?? '';
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function workbenchVersionOf(cdp, check = true) {
  const result = await cdp.send('Runtime.evaluate', {
    expression: `fetch('/workbench/api/module-versions${check ? '' : '?check=0'}').then((r) => r.json()).then((value) => JSON.stringify(value)).catch(() => '')`,
    awaitPromise: true,
    returnByValue: true,
  });
  const raw = result.result?.value ?? '';
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function workbenchRowScope() {
  return `(() => {
  const titles = ${JSON.stringify(workbenchTitles)};
  const visible = (node) => node.getClientRects().length > 0;
  const titled = (node) => {
    const leaf = [...node.querySelectorAll('*')].some((child) => child.children.length === 0 && titles.includes((child.textContent ?? '').trim()));
    return leaf || titles.some((title) => (node.innerText ?? '').trim().startsWith(title));
  };
  const rows = [...document.querySelectorAll('li')].filter(titled);
  return rows.find(visible) ?? rows[0] ?? null;
})()`;
}

async function workbenchRowOf(cdp) {
  const result = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
  const row = ${workbenchRowScope()};
  if (row === null) return JSON.stringify({ found: false });
  const buttons = [...row.querySelectorAll('button, a, [role="button"]')].map((node) => ({
    text: (node.innerText ?? '').trim(),
    label: (node.getAttribute('aria-label') ?? '').trim(),
    disabled: node.disabled === true || node.getAttribute('aria-disabled') === 'true',
  }));
  return JSON.stringify({ found: true, text: (row.innerText ?? '').slice(0, 500), buttons, html: row.outerHTML.slice(0, 4000) });
})()`,
    returnByValue: true,
  });
  try {
    return JSON.parse(result.result?.value ?? '{"found":false}');
  } catch {
    return { found: false };
  }
}

function buttonTextsOf(row) {
  const buttons = Array.isArray(row?.buttons) ? row.buttons : [];
  return buttons.flatMap((one) => [one.text, one.label]).filter((one) => one !== '');
}

function updateButtonOf(row) {
  const buttons = Array.isArray(row?.buttons) ? row.buttons : [];
  return buttons.find((one) => workbenchUpdateTexts.includes(one.text) || workbenchUpdateTexts.includes(one.label));
}

async function smokeSelfUpdate(cdp) {
  const result = { updated: false, ready: false, live: false, to: '' };
  await openMarket(cdp);
  writeText(`${prefix}-body.txt`, await bodyOf(cdp));
  const rowUntil = Date.now() + remaining('等工作台那一行的「更新」钮', MODULE_WAIT_MS);
  let row = await workbenchRowOf(cdp);
  let updateButton = updateButtonOf(row);
  while (updateButton === undefined && Date.now() < rowUntil) {
    log(`self-update row wait: found=${String(row.found)} buttons=${JSON.stringify(buttonTextsOf(row))}`);
    await sleep(POLL_MS);
    row = await workbenchRowOf(cdp);
    updateButton = updateButtonOf(row);
  }
  log(`STEP workbench row: found=${String(row.found)} buttons=${JSON.stringify(buttonTextsOf(row))}`);
  writeText(`${prefix}-row.json`, `${JSON.stringify(row, null, 2)}\n`);
  if (row.found !== true) {
    await fail(cdp, '市场页上找不到工作台那一行（按标题「工作台」/「Workbench」定位）', await bodyOf(cdp));
  }
  if (updateButton === undefined) {
    await fail(cdp, '工作台那一行没有「更新」钮（盘上/源上版本没读到？）', await bodyOf(cdp));
  }
  const before = await workbenchVersionOf(cdp);
  writeText(`${prefix}-before.json`, `${JSON.stringify(before, null, 2)}\n`);
  const beforeWorkbench = before?.workbench ?? null;
  const markerFrom = typeof before?.selfUpdate?.from === 'string' ? before.selfUpdate.from : '';
  const from = typeof beforeWorkbench?.installed === 'string' ? beforeWorkbench.installed : '';
  const to = typeof beforeWorkbench?.latest === 'string' ? beforeWorkbench.latest : '';
  if (
    beforeWorkbench === null ||
    beforeWorkbench.local === true ||
    from === '' ||
    to === '' ||
    to === from ||
    (markerFrom !== '' && markerFrom !== from)
  ) {
    await fail(
      cdp,
      `自更新之前版本接口不对：installed=${JSON.stringify(from)} latest=${JSON.stringify(to)} local=${String(beforeWorkbench?.local)} marker.from=${JSON.stringify(markerFrom)}`,
      await bodyOf(cdp),
    );
  }
  const clicked = await click(cdp, workbenchUpdateTexts, 3000, workbenchRowScope());
  if (clicked === 'missing') {
    await fail(cdp, '工作台那一行点不到「更新」钮（可能被 disabled）', await bodyOf(cdp));
  }
  mark('self-update-clicked');

  const aliveExpression = `(async () => {
      const body = document.body.innerText || document.body.textContent || '';
      const titles = ${JSON.stringify(workbenchTitles)};
      const status = await fetch('/workbench/api/module-versions?check=0').then((r) => r.status).catch(() => 0);
      return JSON.stringify({
        visibility: document.visibilityState,
        row: titles.some((title) => body.includes(title)),
        panel: /Workbench panel|工作台面板/u.test(body),
        status,
      });
    })()`;
  const aliveUntil = Date.now() + 90_000;
  let aliveState = {};
  let live = false;
  while (Date.now() < aliveUntil) {
    const alive = await cdp.send('Runtime.evaluate', {
      expression: aliveExpression,
      awaitPromise: true,
      returnByValue: true,
    });
    try {
      aliveState = JSON.parse(alive.result?.value ?? '{}');
    } catch {
      aliveState = {};
    }
    if (aliveState.row === true && aliveState.status === 200) {
      live = true;
      break;
    }
    log(
      `self-update alive wait: visibility=${String(aliveState.visibility)} 市场行=${String(aliveState.row)} 版本接口=${String(aliveState.status)}`,
    );
    await sleep(POLL_MS);
  }
  writeText(`${prefix}-alive.txt`, `${JSON.stringify(aliveState, null, 2)}\n`);
  result.live = live;
  if (live !== true) {
    await fail(
      cdp,
      `点了更新之后界面没回来：visibility=${String(aliveState.visibility)} 市场行=${String(aliveState.row)} 版本接口=${String(aliveState.status)}`,
      await bodyOf(cdp),
    );
  }

  const readyUntil = Date.now() + remaining('等工作台自更新就绪', INSTALL_WAIT_MS);
  let readyBody = '';
  let body = '';
  while (Date.now() < readyUntil) {
    body = await bodyOf(cdp);
    log(`self-update wait: ${tailBody(body, 220)}`);
    if (selfUpdateFailedRe.test(body)) {
      writeText(`${prefix}-failed-body.txt`, body);
      await fail(cdp, '自更新报失败或回滚（界面出现失败/回滚文案）', body);
    }
    if (selfUpdateReadyRe.test(body)) {
      readyBody = body;
      break;
    }
    await sleep(POLL_MS);
  }
  if (readyBody === '') {
    await fail(
      cdp,
      `自更新没在预算内就绪（等不到「新版本已就绪，重启后生效」）：${tailBody(body, 200)}`,
      body,
    );
  }
  writeText(`${prefix}-ready.txt`, readyBody);
  mark('self-update-ready');

  const afterRow = await workbenchRowOf(cdp);
  writeText(`${prefix}-row-after.json`, `${JSON.stringify(afterRow, null, 2)}\n`);

  const after = await workbenchVersionOf(cdp, false);
  const afterWorkbench = after?.workbench ?? null;
  const installedAfter = typeof afterWorkbench?.installed === 'string' ? afterWorkbench.installed : '';
  const runningAfter = typeof afterWorkbench?.running === 'string' ? afterWorkbench.running : '';
  writeText(
    `${prefix}-ready.json`,
    `${JSON.stringify({ from, to, installed: installedAfter, running: runningAfter, local: afterWorkbench?.local === true }, null, 2)}\n`,
  );
  if (installedAfter !== to) {
    await fail(
      cdp,
      `盘上没换成新版：接口 installed=${JSON.stringify(installedAfter)}，期望 ${JSON.stringify(to)}`,
      await bodyOf(cdp),
    );
  }
  if (runningAfter !== from) {
    await fail(
      cdp,
      `不重启时跑的应该还是旧版：接口 running=${JSON.stringify(runningAfter)}，期望 ${JSON.stringify(from)}`,
      await bodyOf(cdp),
    );
  }
  result.updated = true;
  result.ready = true;
  result.to = to;
  mark('self-update-verified');
  return result;
}

async function clientBundleReport(cdp) {
  const result = await cdp.send('Runtime.evaluate', {
    expression: `(async () => {
      const names = performance.getEntriesByType('resource').map((one) => one.name);
      const targets = names.filter((name) => name.includes('plugin') || name.includes('dsh-workbench'));
      const reports = [];
      for (const target of targets.slice(-8)) {
        const text = await fetch(target).then((r) => r.text()).catch(() => '');
        reports.push({ url: target, size: text.length, retry: text.includes('maxRetries') || text.includes('retryDelayMs') });
      }
      return JSON.stringify({ names, reports });
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  return result.result?.value ?? '';
}

async function pageInternals(cdp) {
  const result = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const scripts = [...document.querySelectorAll('script')].map((node) => node.src || ('inline:' + (node.textContent || '').slice(0, 60)));
      const boot = window.__DSH_BOOT__;
      let bootKeys = null;
      let entries = null;
      if (boot !== undefined && boot !== null) {
        bootKeys = Object.keys(boot);
        const list = boot.entries ?? boot.modules ?? boot.plugins ?? [];
        entries = (Array.isArray(list) ? list : []).slice(0, 12).map((one) => (typeof one === 'string' ? one : JSON.stringify(one).slice(0, 120)));
      }
      return JSON.stringify({ href: location.href, scripts, loader: typeof window.__ModuleLoader__, bootKeys, entries });
    })()`,
    returnByValue: true,
  });
  return result.result?.value ?? '';
}

async function writeVerifyEvidence(cdp, body, units) {
  writeText(`${prefix}-verify-body.txt`, body);
  writeText(`${prefix}-units.json`, `${JSON.stringify(units, null, 2)}\n`);
  writeText(`${prefix}-client-bundles.json`, await clientBundleReport(cdp));
  writeText(`${prefix}-page-internals.json`, await pageInternals(cdp));
  writeText(`${prefix}-console-events.json`, `${JSON.stringify(cdp.events(), null, 2)}\n`);
}

async function cardIds(cdp) {
  const result = await cdp.send('Runtime.evaluate', {
    expression: `JSON.stringify([...document.querySelectorAll('[id^="wb-card-"]')].map((one) => one.id))`,
    returnByValue: true,
  });
  try {
    return JSON.parse(result.result?.value ?? '[]');
  } catch {
    return [];
  }
}

async function panelDialog(cdp) {
  const result = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const dialogs = [...document.querySelectorAll('[role="dialog"]')];
      const rows = dialogs.flatMap((one) => [...one.querySelectorAll('li, [role="listitem"], [role="row"]')]);
      return JSON.stringify({ dialogs: dialogs.length, rows: rows.map((one) => (one.textContent ?? '').slice(0, 40)) });
    })()`,
    returnByValue: true,
  });
  try {
    return JSON.parse(result.result?.value ?? '{"dialogs":0,"rows":[]}');
  } catch {
    return { dialogs: 0, rows: [] };
  }
}

async function showModuleOnPanel(cdp, unitId, titles) {
  let state = await panelDialog(cdp);
  if (state.dialogs === 0) {
    const text = await click(cdp, ['选择模块', 'Choose modules'], 1500);
    if (text === 'missing') {
      await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const trigger = document.querySelector('[aria-label="面板模块"], [aria-label="Panel modules"]');
          if (trigger !== null) trigger.click();
          return 'pressed';
        })()`,
        returnByValue: true,
      });
      await sleep(1500);
    }
    state = await panelDialog(cdp);
  }
  const result = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const unit = ${JSON.stringify(unitId)};
      const titles = ${JSON.stringify(titles)};
      const dialogs = [...document.querySelectorAll('[role="dialog"]')];
      if (dialogs.length === 0) return 'no-dialog';
      const rows = dialogs.flatMap((one) => [...one.querySelectorAll('li, [role="listitem"], [role="row"]')]);
      const row = rows.find((one) => titles.some((title) => (one.textContent ?? '').includes(title)));
      if (row === undefined) return 'row-missing:' + rows.map((one) => (one.textContent ?? '').slice(0, 16)).join('/');
      const toggle = row.querySelector('[role="switch"], button[role="switch"], input[type="checkbox"]');
      if (toggle === null) return 'switch-missing';
      const on = toggle.getAttribute('aria-checked') === 'true' || toggle.checked === true;
      if (on) return 'already-on';
      toggle.click();
      return 'clicked:' + unit;
    })()`,
    returnByValue: true,
  });
  const outcome = result.result?.value ?? '';
  log(`STEP panel module ${unitId} [${titles.join('/')}] dialogs=${state.dialogs} rows=${JSON.stringify(state.rows)} -> ${JSON.stringify(outcome)}`);
  await sleep(1500);
  return outcome;
}

function titlesOfManifests(units) {
  const manifests = Array.isArray(units?.manifests) ? units.manifests : [];
  const chosen = manifests.filter((one) => one.id !== 'panels');
  const titles = [];
  for (const manifest of chosen) {
    if (typeof manifest.title?.zh === 'string') titles.push(manifest.title.zh);
    if (typeof manifest.title?.en === 'string') titles.push(manifest.title.en);
    if (typeof manifest.id === 'string') titles.push(manifest.id);
  }
  return titles;
}

async function verifyFeatures(cdp) {
  const startedAt = Date.now();
  let reloaded = false;
  let reloadCard = false;
  let pickAttempts = 0;
  const until = Date.now() + remaining('等模块卡片', MODULE_WAIT_MS);
  let body = '';
  let ids = [];
  let cards = [];
  while (Date.now() < until) {
    body = await bodyOf(cdp);
    const units = await unitsOf(cdp);
    ids = Array.isArray(units?.manifests) ? units.manifests.map((one) => one.id) : [];
    cards = await cardIds(cdp);
    const target = ids.find((id) => id !== 'panels') ?? 'hello';
    log(`verify wait :: host units ${ids.join(',') || '（空）'} :: cards ${cards.join(',') || '（无）'} :: ${tailBody(body, 140)}`);
    if (cards.includes(`wb-card-${target}`) && /hello, workbench/u.test(body)) {
      await writeVerifyEvidence(cdp, body, units);
      if (expectedRunningVersion !== '') {
        const payload = await workbenchVersionOf(cdp, false);
        const running = typeof payload?.workbench?.running === 'string' ? payload.workbench.running : '';
        writeText(`${prefix}-verify-running.json`, `${JSON.stringify(payload, null, 2)}\n`);
        if (running !== expectedRunningVersion) {
          await fail(
            cdp,
            `重启后跑的工作台版本不对：接口 running=${JSON.stringify(running)}，期望 ${JSON.stringify(expectedRunningVersion)}`,
            body,
          );
        }
      }
      mark('module-card');
      return { card: true, units: ids };
    }
    if (pickAttempts < 8 && target !== '') {
      pickAttempts += 1;
      const outcome = await showModuleOnPanel(cdp, target, titlesOfManifests(units));
      await pressEscape(cdp);
      await sleep(1500);
      if (/clicked|already-on/u.test(outcome) || pickAttempts < 3) continue;
      await sleep(3000);
      continue;
    }
    if (!reloaded && Date.now() - startedAt > 25_000) {
      reloaded = true;
      log('面板 25s 没出卡片：重载页面看是不是首屏竞态');
      await cdp.send('Page.reload');
      await sleep(4000);
      const reloadUntil = Date.now() + 45_000;
      while (Date.now() < reloadUntil) {
        const reloadBody = await bodyOf(cdp);
        const continueText = ['Enter the workbench anyway', '仍然进入工作台'].find((text) => reloadBody.includes(text));
        if (continueText !== undefined) await click(cdp, [continueText], 1500);
        log(`reload wait :: ${tailBody(reloadBody, 140)}`);
        if ((await cardIds(cdp)).some((id) => id === `wb-card-${target}`)) {
          reloadCard = true;
          break;
        }
        await sleep(POLL_MS);
      }
    }
    await sleep(POLL_MS);
  }
  const units = await unitsOf(cdp);
  await writeVerifyEvidence(cdp, body, units);
  await fail(
    cdp,
    `装上模块后面板里没有示例模块的卡片（host units: ${ids.join(',') || '空'}；cards: ${cards.join(',') || '无'}；reload 之后${reloadCard ? '有' : '仍然没'}卡片）`,
    body,
  );
}

async function main() {
  await waitForCdp();
  let pages = await waitForPages();

  const welcome = pages.find(isWelcomePage);
  if (welcome !== undefined) {
    const welcomeCdp = await connect(welcome.webSocketDebuggerUrl);
    const skipped = await welcomeCdp.send('Runtime.evaluate', {
      expression: `(() => {
        document.querySelector('#api-key')?.click();
        setTimeout(() => document.querySelector('#skip-key')?.click(), 700);
        return 'scheduled';
      })()`,
      returnByValue: true,
    });
    log(`welcome skip: ${skipped.result?.value ?? 'unknown'}`);
    welcomeCdp.close();
    mark('welcome-skip');
    const until = Date.now() + remaining('等主窗口', PAGE_WAIT_MS);
    while (Date.now() < until && !pages.some(isAppPage)) {
      await sleep(1000);
      pages = await pagesOf().catch(() => []);
    }
  }

  const target = pages.find(isAppPage) ?? pages.find((page) => page.type === 'page' && !page.url.startsWith('devtools://'));
  if (target === undefined) throw new Error('no page target');
  mark('app-page');
  log(`target: ${target.url}`);

  const cdp = await connect(target.webSocketDebuggerUrl);
  activeCdp = cdp;
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  mark('cdp-connected');

  if (installViaUi) await installFromPluginPage(cdp);
  const snapshot = await waitForGateAndReady(cdp);
  if (addPluginFlagged && addPluginSpec === '') {
    await fail(
      cdp,
      '--add-plugin 传了但包名是空的（flag 和 DESKTOP_SMOKE_PLUGIN 都没给出 spec，拒绝静默跳过）',
      await bodyOf(cdp),
      snapshot,
    );
  }

  const result =
    addPluginSpec !== ''
      ? await addPluginViaMarket(cdp, addPluginSpec)
      : selfUpdateFlow
        ? await smokeSelfUpdate(cdp)
        : verifyOnly
            ? await verifyFeatures(cdp)
            : installViaUi
              ? await smokeMarket(cdp)
              : { skipped: true };
  if (addPluginSpec !== '' && (result.preview !== true || result.installed !== true)) {
    await fail(cdp, '添加模块流程没走完（预览或结果屏没出现）', await bodyOf(cdp), snapshot);
  }
  if (selfUpdateFlow && (result.updated !== true || result.ready !== true || result.live !== true)) {
    await fail(cdp, '工作台自更新流程没走完（界面/就绪/记账有一项不对）', await bodyOf(cdp), snapshot);
  }
  if (installViaUi && result.installed === false) {
    await fail(cdp, 'market module install did not finish', await bodyOf(cdp), snapshot);
  }
  writeText(
    `${prefix}-smoke.json`,
    `${JSON.stringify(
      { ...result, phase: snapshot?.phase ?? 'unknown', bridge: stepStatusOf(snapshot, 'bridge') || 'none' },
      null,
      2,
    )}\n`,
  );

  const finalBody = await bodyOf(cdp);
  writeText(`${prefix}-final-body.txt`, finalBody);
  const title = await cdp.send('Runtime.evaluate', { expression: 'document.title', returnByValue: true });
  log(`TITLE: ${title.result?.value ?? ''}`);
  await capture(cdp, shot);
  if (expectWorkbench && !/Workbench panel|工作台面板/u.test(finalBody)) {
    await fail(cdp, 'workbench panel not found in Desktop renderer', finalBody, snapshot);
  }
  summary('passed', result);
  cdp.close();
  setTimeout(() => process.exit(0), 300);
}

const watchdog = setTimeout(() => {
  log('FATAL 整轮 deadline 到了，强制退出');
  summary('failed', { reason: 'deadline' });
  process.exit(1);
}, Math.max(1000, deadlineAt - Date.now()));

async function dumpOnFatal() {
  if (activeCdp === null) return;
  try {
    writeText(`${prefix}-fatal-body.txt`, await bodyOf(activeCdp));
  } catch {
    return;
  }
  try {
    await capture(activeCdp, `${prefix}-fatal.png`);
  } catch {
    return;
  }
}

main().catch((error) => {
  log(`FATAL ${error?.stack ?? String(error)}`);
  summary('failed', { reason: String(error?.message ?? error) });
  void dumpOnFatal().finally(() => setTimeout(() => process.exit(1), 300));
});

watchdog.unref();
