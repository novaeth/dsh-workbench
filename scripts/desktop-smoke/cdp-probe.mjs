import fs from 'node:fs';

const port = process.argv[2] ?? '9222';
const shot = process.argv[3] ?? 'desktop-smoke.png';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    expression: `(async () => {
      if (typeof window.dshWelcome?.skip === 'function') {
        await window.dshWelcome.skip();
        return 'skip()';
      }
      document.querySelector('#api-key')?.click();
      await new Promise((resolve) => setTimeout(resolve, 500));
      document.querySelector('#skip-key')?.click();
      return 'clicked';
    })()`,
    awaitPromise: true,
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
cdp.close();
