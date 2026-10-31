import fs from 'node:fs';

const port = process.argv[2] ?? '9222';
const shot = process.argv[3] ?? 'desktop-smoke.png';

const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
console.log(`pages: ${pages.length}`);
for (const page of pages) console.log(`- ${page.type} ${page.url}`);

const page = pages.find((one) => one.type === 'page' && !one.url.startsWith('devtools://'));
if (page === undefined) throw new Error('no page target');

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let nextId = 1;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  if (data.id !== undefined) {
    const waiter = pending.get(data.id);
    pending.delete(data.id);
    if (data.error !== undefined) waiter.reject(new Error(JSON.stringify(data.error)));
    else waiter.resolve(data.result);
  }
});

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });

await send('Page.enable');
const text = await send('Runtime.evaluate', {
  expression: 'document.body.innerText',
  returnByValue: true,
});
const body = text.result?.value ?? '';
console.log('BODY_START');
console.log(body.slice(0, 4000));
console.log('BODY_END');

const title = await send('Runtime.evaluate', { expression: 'document.title', returnByValue: true });
console.log(`TITLE: ${title.result?.value ?? ''}`);

const capture = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(shot, Buffer.from(capture.data, 'base64'));
console.log(`SCREENSHOT: ${shot} (${fs.statSync(shot).size} bytes)`);
socket.close();
