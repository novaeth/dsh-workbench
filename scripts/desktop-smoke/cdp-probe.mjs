import fs from 'node:fs';

const port = process.argv[2] ?? '9222';
const shot = process.argv[3] ?? 'desktop-smoke.png';
const expectWorkbench = process.argv.includes('--expect-workbench');
const installViaUi = process.argv.includes('--install-via-ui');
const workbenchSpec = process.env.DESKTOP_WORKBENCH_SPEC ?? '@dsh-workbench/core';
const quick = process.env.DESKTOP_SMOKE_QUICK === '1';

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });


async function dumpPreflight(cdp, label) {
  const result = await cdp.send('Runtime.evaluate', {
    expression: `fetch('/workbench/api/preflight').then((r) => r.json()).then((value) => JSON.stringify(value)).catch((error) => 'ERR ' + String(error))`,
    awaitPromise: true,
    returnByValue: true,
  });
  console.log(`PREFLIGHT_${label}: ${(result.result?.value ?? '').slice(0, 6000)}`);
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

async function pagesOf() {
  const response = await fetch(`http://127.0.0.1:${port}/json`);
  return response.json();
}

async function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    if (data.id === undefined) return;
    const waiter = pending.get(data.id);
    pending.delete(data.id);
    if (data.error !== undefined) waiter.reject(new Error(JSON.stringify(data.error)));
    else waiter.resolve(data.result);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  return { send, close: () => socket.close() };
}

let pages = await pagesOf();
console.log(`pages: ${pages.length}`);
for (const page of pages) console.log(`- ${page.type} ${page.url}`);

const welcome = pages.find((one) => one.type === 'page' && one.url.includes('welcome.html'));
if (welcome !== undefined) {
  const cdp = await connect(welcome.webSocketDebuggerUrl);
  const skipped = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      document.querySelector('#api-key')?.click();
      setTimeout(() => document.querySelector('#skip-key')?.click(), 700);
      return 'scheduled';
    })()`,
    returnByValue: true,
  });
  console.log(`welcome skip: ${skipped.result?.value ?? 'unknown'}`);
  cdp.close();
  await sleep(5000);
  pages = await pagesOf();
  console.log(`pages after skip: ${pages.length}`);
  for (const page of pages) console.log(`- ${page.type} ${page.url}`);
}

const appPage = pages.find((one) => one.type === 'page' && one.url.startsWith('dsh-app://'));
const target = appPage ?? pages.find((one) => one.type === 'page' && !one.url.startsWith('devtools://'));
if (target === undefined) throw new Error('no page target');
console.log(`target: ${target.url}`);

const cdp = await connect(target.webSocketDebuggerUrl);
await cdp.send('Page.enable');

if (installViaUi) {
  const clickText = (text) => `(() => {
    const nodes = [...document.querySelectorAll('button, a, [role="button"], [role="tab"]')];
    const exact = nodes.find((node) => node.innerText?.trim() === ${JSON.stringify(text)});
    const loose = nodes.find((node) => node.innerText?.includes(${JSON.stringify(text)}));
    const target = exact ?? loose;
    target?.click();
    return target === undefined ? 'missing' : (target.innerText ?? '').trim();
  })()`;

  const step = async (label, expression) => {
    const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true });
    console.log(`${label}: ${JSON.stringify(result.result?.value)}`);
    await sleep(2000);
  };

  await step('open plugins', clickText('Plugins'));
  const bodyAfterPlugins = await cdp.send('Runtime.evaluate', { expression: 'document.body.innerText', returnByValue: true });
  console.log('PLUGINS_BODY_START');
  console.log((bodyAfterPlugins.result?.value ?? '').slice(0, 3000));
  console.log('PLUGINS_BODY_END');
  await step('add plugin', clickText('Add plugin'));

  const fields = await cdp.send('Runtime.evaluate', {
    expression: `JSON.stringify([...document.querySelectorAll('input, textarea')].map((node, index) => ({ index, tag: node.tagName, type: node.type, placeholder: node.placeholder, aria: node.getAttribute('aria-label'), visible: node.offsetParent !== null })))`,
    returnByValue: true,
  });
  console.log(`FIELDS: ${fields.result?.value ?? ''}`);

  const focus = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const field = document.querySelector('input[aria-label="Package name or address"]') ?? [...document.querySelectorAll('input, textarea')].filter((node) => node.offsetParent !== null).at(-1);
      if (field === undefined) return 'no field';
      field.focus();
      return field.getAttribute('placeholder');
    })()`,
    returnByValue: true,
  });
  console.log(`focus: ${JSON.stringify(focus.result?.value)}`);
  await cdp.send('Input.insertText', { text: workbenchSpec });
  await sleep(500);
  const filled = await cdp.send('Runtime.evaluate', {
    expression: `document.querySelector('input[aria-label="Package name or address"]')?.value ?? ''`,
    returnByValue: true,
  });
  console.log(`filled: ${JSON.stringify(filled.result?.value)}`);
  const installButton = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const button = [...document.querySelectorAll('button')].find((node) => node.innerText?.trim() === 'Install');
      if (button === undefined) return 'missing';
      button.click();
      return { disabled: button.disabled };
    })()`,
    returnByValue: true,
  });
  console.log(`install click: ${JSON.stringify(installButton.result?.value)}`);
  await sleep(2000);
  const afterInstallClick = await cdp.send('Runtime.evaluate', { expression: 'document.body.innerText', returnByValue: true });
  console.log('AFTER_INSTALL_CLICK_START');
  console.log((afterInstallClick.result?.value ?? '').slice(-2000));
  console.log('AFTER_INSTALL_CLICK_END');

  let last = '';
  for (let i = 0; i < 72; i += 1) {
    await sleep(5000);
    const current = await cdp.send('Runtime.evaluate', { expression: 'document.body.innerText', returnByValue: true });
    last = current.result?.value ?? '';
    console.log(`install wait ${i + 1}s: ${last.slice(-300).replaceAll('\n', ' | ')}`);
    if (/Enable now|Installed|failed|Failed|错误|失败/u.test(last)) break;
  }
  if (!/Enable now|Installed/u.test(last)) {
    throw new Error(`workbench plugin install did not finish: ${last.slice(-400)}`);
  }
  if (/Enable now/u.test(last)) await step('enable now', clickText('Enable now'));
  await step('close dialog', `(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return 'escape'; })()`);
  await sleep(5000);
  const gateShot = shot.replace(/\.png$/u, '-gate.png');
  const gateOpenShot = shot.replace(/\.png$/u, '-gate-open.png');
  const failedShot = shot.replace(/\.png$/u, '-failed.png');
  const continueTexts = ['Enter the workbench anyway', '仍然进入工作台'];
  let gateCaptured = false;
  for (let i = 0; i < (quick ? 12 : 72); i += 1) {
    const current = await cdp.send('Runtime.evaluate', { expression: 'document.body.innerText', returnByValue: true });
    const body = current.result?.value ?? '';
    const snapshot = await preflightOf(cdp);
    const phase = snapshot?.phase ?? '';
    console.log(`health wait ${i * 5}s [${phase}]: ${body.slice(-700).replaceAll('\n', ' | ')}`);
    if (phase === 'failed') {
      const failedImage = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(failedShot, Buffer.from(failedImage.data, 'base64'));
      await dumpPreflight(cdp, 'FAILED');
      throw new Error(`preflight failed: ${failedShot}`);
    }
    if (!gateCaptured && (body.includes('›') || /Check the environment|检查环境/u.test(body))) {
      const gateImage = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(gateShot, Buffer.from(gateImage.data, 'base64'));
      console.log(`GATE_SCREENSHOT: ${gateShot} (${fs.statSync(gateShot).size} bytes)`);
      const opened = await cdp.send('Runtime.evaluate', {
        expression: `(() => { const head = document.querySelector('li[data-expandable="true"] .head'); if (head === null) return false; head.click(); return true; })()`,
        returnByValue: true,
      });
      if (opened.result?.value === true) {
        await sleep(800);
        const openImage = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(gateOpenShot, Buffer.from(openImage.data, 'base64'));
        console.log(`GATE_OPEN_SCREENSHOT: ${gateOpenShot} (${fs.statSync(gateOpenShot).size} bytes)`);
      }
      gateCaptured = true;
      await dumpPreflight(cdp, 'AT_GATE');
      if (quick) break;
    }
    const continueText = continueTexts.find((text) => body.includes(text));
    if (continueText !== undefined) {
      await step('enter anyway', clickText(continueText));
      await sleep(5000);
      continue;
    }
    if (!/Preparing the workbench|准备工作台/u.test(body)) break;
    await sleep(5000);
  }
  if (quick) {
    const quickImage = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(shot, Buffer.from(quickImage.data, 'base64'));
    console.log(`SCREENSHOT: ${shot} (${fs.statSync(shot).size} bytes)`);
    cdp.close();
    process.exit(0);
  }
  for (let i = 0; i < 90; i += 1) {
    const current = await cdp.send('Runtime.evaluate', { expression: 'document.body.innerText', returnByValue: true });
    const body = current.result?.value ?? '';
    const snapshot = await preflightOf(cdp);
    const phase = snapshot?.phase ?? '';
    console.log(`ready wait ${i * 5}s [${phase}]: ${body.slice(-600).replaceAll('\n', ' | ')}`);
    if (phase === 'failed') {
      const failedImage = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(failedShot, Buffer.from(failedImage.data, 'base64'));
      await dumpPreflight(cdp, 'FAILED');
      throw new Error(`preflight failed: ${failedShot}`);
    }
    if (phase === 'ready' && !/Preparing the workbench|准备工作台/u.test(body) && /Workbench panel|工作台面板/u.test(body)) break;
    await sleep(5000);
  }
  await dumpPreflight(cdp, 'AFTER_GATE');
  const finalSnapshot = await preflightOf(cdp);
  console.log(`PREFLIGHT_FINAL_PHASE: ${finalSnapshot?.phase ?? 'unknown'}`);
  if (finalSnapshot?.phase !== 'ready') {
    throw new Error(`preflight not ready: ${finalSnapshot?.phase ?? 'unknown'}`);
  }
  const final = await cdp.send('Runtime.evaluate', { expression: 'document.body.innerText', returnByValue: true });
  console.log('FINAL_BODY_START');
  console.log((final.result?.value ?? '').slice(-2500));
  console.log('FINAL_BODY_END');
}

const text = await cdp.send('Runtime.evaluate', {
  expression: 'document.body.innerText',
  returnByValue: true,
});
const body = text.result?.value ?? '';
console.log('BODY_START');
console.log(body.slice(0, 4000));
console.log('BODY_END');
const title = await cdp.send('Runtime.evaluate', { expression: 'document.title', returnByValue: true });
console.log(`TITLE: ${title.result?.value ?? ''}`);
const capture = await cdp.send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(shot, Buffer.from(capture.data, 'base64'));
console.log(`SCREENSHOT: ${shot} (${fs.statSync(shot).size} bytes)`);
if (expectWorkbench && !/Workbench panel|工作台DIY/u.test(body)) {
  throw new Error('workbench panel not found in Desktop renderer');
}
cdp.close();
