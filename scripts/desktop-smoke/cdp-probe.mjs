import fs from 'node:fs';
import { join } from 'node:path';

const port = process.argv[2] ?? '9222';
const shot = process.argv[3] ?? 'desktop-smoke.png';
const expectWorkbench = process.argv.includes('--expect-workbench');
const installViaUi = process.argv.includes('--install-via-ui');
const verifyOnly = process.argv.includes('--verify-only');
const workbenchSpec = process.env.DESKTOP_WORKBENCH_SPEC ?? '@dsh-workbench/core';
const marketSource = process.env.DESKTOP_SMOKE_MARKET ?? 'https://github.com/novaeth/dsh-workbench-market.git';
const moduleName = process.env.DESKTOP_SMOKE_MODULE ?? '@dsh-workbench/module-hello';
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
const MODULE_WAIT_MS = 240_000;
const POLL_MS = 2000;

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
    if (data.id === undefined) return;
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
  return { send, close: () => socket.close() };
}

async function bodyOf(cdp) {
  const result = await cdp.send('Runtime.evaluate', { expression: 'document.body.innerText', returnByValue: true });
  return result.result?.value ?? '';
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

function tailBody(body, length = 240) {
  return body.replaceAll('\n', ' | ').slice(-length);
}

async function capture(cdp, file) {
  const target = outPath(file);
  const image = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(target, Buffer.from(image.data, 'base64'));
  log(`SHOT ${target} (${fs.statSync(target).size} bytes)`);
  return target;
}

async function fail(cdp, reason, body, snapshot) {
  log(`FAIL ${reason}`);
  if (snapshot !== undefined) log(`PREFLIGHT_FAILED: ${JSON.stringify(snapshot).slice(0, 8000)}`);
  writeText(`${prefix}-failed-body.txt`, body);
  if (snapshot !== undefined) writeText(`${prefix}-failed-preflight.json`, `${JSON.stringify(snapshot, null, 2)}\n`);
  await capture(cdp, `${prefix}-failed.png`).catch(() => undefined);
  throw new Error(`${reason}（现场：${prefix}-failed-body.txt / ${prefix}-failed-preflight.json）`);
}

function clickExpression(texts, scope = 'document') {
  const root = scope === 'dialog' ? `(document.querySelector('[role="dialog"], [aria-modal="true"]') ?? document.body)` : 'document';
  return `(() => {
  const wanted = ${JSON.stringify(texts)};
  const nodes = [...${root}.querySelectorAll('button, a, [role="button"], [role="tab"]')];
  for (const text of wanted) {
    const exact = nodes.find((node) => node.innerText?.trim() === text);
    if (exact !== undefined) { exact.click(); return text; }
  }
  for (const text of wanted) {
    const loose = nodes.find((node) => node.innerText?.includes(text));
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

async function waitForGateAndReady(cdp) {
  const gateShot = `${prefix}-gate.png`;
  const gateOpenShot = `${prefix}-gate-open.png`;
  const continueTexts = ['Enter the workbench anyway', '仍然进入工作台'];
  let gateCaptured = false;
  let gateBody = '';
  let readyBody = '';
  let snapshot;

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
    if (phase === 'ready' && !/Preparing the workbench|准备工作台/u.test(readyBody) && /Workbench panel|工作台面板/u.test(readyBody)) {
      mark('ready');
      return snapshot;
    }
    await sleep(POLL_MS);
  }
  writeText(`${prefix}-not-ready-body.txt`, readyBody);
  await fail(cdp, 'preflight not ready', readyBody, snapshot);
}

async function smokeMarket(cdp) {
  const result = { market: marketSource, module: moduleName, listed: false, installed: false, restartHint: false };
  const opened = await click(cdp, ['Browse the module market', 'Choose modules'], 3000);
  if (opened === 'missing') await fail(cdp, '打开市场页没找到入口', await bodyOf(cdp));
  await waitForBody(cdp, /Workbench module market|Discover/u, MARKET_WAIT_MS, 'market-page');
  mark('market-open');
  await click(cdp, ['Discover'], 2000);

  let body = await bodyOf(cdp);
  if (!/dsh-workbench-market|github\.com/u.test(body)) {
    const add = await click(cdp, ['Add index source', 'Manage index sources…'], 1500);
    if (add === 'missing') await fail(cdp, '发现页上没有添加索引源的入口', body);
    const focused = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const field = document.querySelector('input[aria-label="Index URL"]');
        if (field === null) return 'missing';
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
  await sleep(1500);

  const confirmed = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const dialog = document.querySelector('[role="dialog"], [aria-modal="true"]');
      const scope = dialog ?? document;
      const buttons = [...scope.querySelectorAll('button')].filter((node) => node.innerText?.trim() === 'Install');
      const button = buttons.at(-1);
      if (button === undefined) return 'missing';
      button.click();
      return buttons.length;
    })()`,
    returnByValue: true,
  });
  log(`STEP confirm install: ${JSON.stringify(confirmed.result?.value)}`);
  if (confirmed.result?.value === 'missing') {
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

async function verifyFeatures(cdp) {
  const body = await bodyOf(cdp);
  writeText(`${prefix}-verify-body.txt`, body);
  const card = /Sample module|示例模块|hello, workbench/u.test(body);
  if (!card) await fail(cdp, '装上模块后面板里没有示例模块的卡片', body);
  return { card };
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
  mark('cdp-connected');

  if (installViaUi) await installFromPluginPage(cdp);
  const snapshot = await waitForGateAndReady(cdp);

  const result = verifyOnly
    ? await verifyFeatures(cdp)
    : installViaUi
      ? await smokeMarket(cdp)
      : { skipped: true };
  if (installViaUi && result.installed === false) {
    await fail(cdp, 'market module install did not finish', await bodyOf(cdp), snapshot);
  }
  writeText(`${prefix}-smoke.json`, `${JSON.stringify({ ...result, phase: snapshot?.phase ?? 'unknown' }, null, 2)}\n`);

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
