export const RECORD_KEY = '__dshDiyRecord';
export const RECORD_KEEP_KEY = '__dshDiyRecordKeep';
export const RECORD_OFF_KEY = '__dshDiyRecordOff';
const CALL_CAP = 50;
const BODY_MAX = 16384;

export const RECORD_ARM_SCRIPT = `(() => {
  const KEY = ${JSON.stringify(RECORD_KEY)};
  const KEEP = ${JSON.stringify(RECORD_KEEP_KEY)};
  const OFF = ${JSON.stringify(RECORD_OFF_KEY)};
  const CAP = ${String(CALL_CAP)};
  const BODY_MAX = ${String(BODY_MAX)};
  const blank = () => ({ phase: 'armed', t0: null, t1: null, href: location.href, dropped: 0, calls: [], shots: 0, shotsAt: null });
  const readKeep = () => {
    try {
      const raw = sessionStorage.getItem(KEEP);
      const parsed = raw === null ? null : JSON.parse(raw);
      return parsed !== null && typeof parsed === 'object' ? parsed : blank();
    } catch (error) {
      return blank();
    }
  };
  const state = window[KEY] !== null && typeof window[KEY] === 'object' ? window[KEY] : readKeep();
  state.calls = Array.isArray(state.calls) ? state.calls : [];
  state.phase = typeof state.phase === 'string' ? state.phase : 'armed';
  window[KEY] = state;
  const keep = () => {
    try {
      sessionStorage.setItem(KEEP, JSON.stringify(state));
    } catch (error) {}
  };
  const slice = (value) => {
    try {
      if (value === undefined || value === null || value === '') return '';
      if (typeof value === 'string') return value.slice(0, BODY_MAX);
      if (typeof FormData === 'function' && value instanceof FormData) return '[form-data]';
      if (typeof Blob === 'function' && value instanceof Blob) return '[blob ' + String(value.size) + ']';
      if (typeof URLSearchParams === 'function' && value instanceof URLSearchParams) return String(value).slice(0, BODY_MAX);
      const json = JSON.stringify(value);
      return typeof json === 'string' ? json.slice(0, BODY_MAX) : '';
    } catch (error) {
      return '[unprintable]';
    }
  };
  const repaint = () => {
    if (typeof state.__repaint === 'function') state.__repaint();
  };
  const beatOf = (kind) => {
    try {
      state.beatN = (typeof state.beatN === 'number' ? state.beatN : 0) + 1;
      state.beatKind = kind;
      state.beatAt = Date.now();
      keep();
      if (typeof window.__dshBeatWake === 'function') {
        const wake = window.__dshBeatWake;
        window.__dshBeatWake = null;
        wake();
      }
    } catch (error) {}
  };
  const pending = [];
  const begin = (method, url, body) => {
    if (state.phase !== 'recording') return null;
    const target = String(url === undefined || url === null ? '' : url);
    const verb = String(method === '' || method === undefined ? 'GET' : method).toUpperCase();
    const row = {
      method: verb,
      url: target,
      body: slice(body === undefined || body === null ? '' : body),
      status: 0,
      ct: '',
      response: '',
      at: Date.now(),
    };
    state.calls.push(row);
    if (state.calls.length > CAP) {
      state.dropped = (typeof state.dropped === 'number' ? state.dropped : 0) + (state.calls.length - CAP);
      state.calls.splice(0, state.calls.length - CAP);
    }
    pending.push(row);
    keep();
    repaint();
    return row;
  };
  const complete = (row, status, ct, response) => {
    row.status = typeof status === 'number' ? status : 0;
    row.ct = String(ct === undefined || ct === null ? '' : ct);
    row.response = slice(response === undefined || response === null ? '' : response);
  };
  const record = (method, url, body, status, ct, response) => {
    const row = begin(method, url, body);
    if (row === null) return;
    complete(row, status, ct, response);
    keep();
  };
  const finish = (row, method, url, body, status, ct, response) => {
    const at = row === null || row === undefined ? -1 : pending.indexOf(row);
    if (at >= 0) pending.splice(at, 1);
    if (at >= 0 && state.calls.indexOf(row) >= 0) {
      complete(row, status, ct, response);
      keep();
      repaint();
      return;
    }
    record(method, url, body, status, ct, response);
  };
  const fresh = typeof window[OFF] !== 'function';
  if (fresh) {
    const realFetch = window.fetch;
    const proto = XMLHttpRequest.prototype;
    const realOpen = proto.open;
    const realSend = proto.send;
    const realBeacon = typeof navigator === 'object' && navigator !== null ? navigator.sendBeacon : undefined;
    const hasBeacon = typeof realBeacon === 'function';
    const ctOf = (xhr) => {
      try {
        return typeof xhr.getResponseHeader === 'function' ? xhr.getResponseHeader('content-type') || '' : '';
      } catch (error) {
        return '';
      }
    };
    const textOf = (xhr) => {
      try {
        return typeof xhr.responseText === 'string' ? xhr.responseText : '';
      } catch (error) {
        return '';
      }
    };
    window.fetch = function () {
      const args = arguments;
      const init = args[1] || {};
      const asked = args[0];
      const url = typeof asked === 'string' ? asked : asked !== null && typeof asked === 'object' ? asked.url : '';
      const method = init.method !== undefined ? init.method : asked !== null && typeof asked === 'object' ? asked.method : 'GET';
      const body = init.body === undefined ? '' : init.body;
      const row = begin(method, url, body);
      const done = realFetch.apply(this, args);
      try {
        done.then((response) => {
          try {
            const ct = response.headers.get('content-type') || '';
            const clone = response.clone();
            const target = response.url || url;
            clone.text().then((text) => finish(row, method, target, body, response.status, ct, text)).catch(() => finish(row, method, target, body, response.status, ct, ''));
          } catch (error) {}
        }).catch((error) => {
          try {
            finish(row, method, url, body, 0, 'fetch-error', String(error !== null && typeof error === 'object' && error.message !== undefined ? error.message : error));
          } catch (inner) {}
        });
      } catch (error) {}
      return done;
    };
    proto.open = function (method, url) {
      this.__dshMethod = method;
      this.__dshUrl = url;
      return realOpen.apply(this, arguments);
    };
    proto.send = function (body) {
      const xhr = this;
      if (typeof xhr.__dshLoadEnd === 'function' && typeof xhr.removeEventListener === 'function') {
        try {
          xhr.removeEventListener('loadend', xhr.__dshLoadEnd);
        } catch (error) {}
      }
      const row = begin(xhr.__dshMethod, xhr.__dshUrl, body);
      const onEnd = () => {
        try {
          finish(row, xhr.__dshMethod, xhr.__dshUrl, body, xhr.status, ctOf(xhr), textOf(xhr));
        } catch (error) {}
      };
      xhr.__dshLoadEnd = onEnd;
      xhr.addEventListener('loadend', onEnd);
      return realSend.apply(this, arguments);
    };
    if (hasBeacon) {
      navigator.sendBeacon = function (url, data) {
        try {
          begin('POST', url, data === undefined || data === null ? '' : data);
        } catch (error) {}
        return realBeacon.apply(navigator, arguments);
      };
    }
    const onResize = () => {
      if (typeof state.barX === 'number' && typeof state.barY === 'number') place(state.barX, state.barY);
    };
    window.addEventListener('resize', onResize);
    window[OFF] = () => {
      window.fetch = realFetch;
      proto.open = realOpen;
      proto.send = realSend;
      if (hasBeacon) {
        try {
          navigator.sendBeacon = realBeacon;
        } catch (error) {}
      }
      if (typeof window.removeEventListener === 'function') {
        try {
          window.removeEventListener('resize', onResize);
        } catch (error) {}
      }
    };
  }
  let bar = document.getElementById('__dsh-record-bar');
  const freshBar = bar === null;
  if (freshBar) {
    bar = document.createElement('div');
    bar.id = '__dsh-record-bar';
    document.documentElement.appendChild(bar);
  }
  bar.setAttribute('style', 'position:fixed;z-index:2147483647;right:16px;bottom:16px;display:flex;gap:8px;align-items:center;padding:8px 10px;border-radius:10px;background:#1f2430;color:#fff;box-shadow:0 6px 24px rgba(0,0,0,.35);font:12px/1.5 -apple-system,system-ui,sans-serif');
  let sheet = document.getElementById('__dsh-record-bar-style');
  if (sheet === null) {
    sheet = document.createElement('style');
    sheet.id = '__dsh-record-bar-style';
    sheet.textContent = '@keyframes __dshRecordBreath{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.25;transform:scale(.7)}}#__dsh-record-bar .__dsh-record-dot{animation:__dshRecordBreath 1.1s ease-in-out infinite}';
    const sheetHost = document.head === null || document.head === undefined ? document.documentElement : document.head;
    sheetHost.appendChild(sheet);
  }
  const place = (x, y, width, height) => {
    const rect = bar.getBoundingClientRect();
    const w = typeof width === 'number' ? width : rect.width;
    const h = typeof height === 'number' ? height : rect.height;
    const maxX = Math.max(0, (window.innerWidth || 0) - w);
    const maxY = Math.max(0, (window.innerHeight || 0) - h);
    const left = Math.min(Math.max(0, x), maxX);
    const top = Math.min(Math.max(0, y), maxY);
    state.barX = left;
    state.barY = top;
    bar.style.right = 'auto';
    bar.style.bottom = 'auto';
    bar.style.left = String(left) + 'px';
    bar.style.top = String(top) + 'px';
  };
  const grip = document.createElement('span');
  grip.setAttribute('role', 'button');
  grip.setAttribute('tabindex', '0');
  grip.setAttribute('title', '拖动浮条');
  grip.setAttribute('aria-label', '拖动浮条');
  grip.setAttribute('style', 'flex:0 0 auto;width:12px;height:18px;border-radius:3px;cursor:grab;touch-action:none;background-image:radial-gradient(circle,rgba(255,255,255,.5) 1.2px,transparent 1.3px);background-size:6px 6px;background-position:center center');
  const dot = document.createElement('span');
  dot.className = '__dsh-record-dot';
  dot.setAttribute('aria-hidden', 'true');
  dot.setAttribute('style', 'flex:0 0 auto;display:none;width:8px;height:8px;border-radius:999px;corner-shape:round;background:#ef4444');
  const label = document.createElement('span');
  label.setAttribute('style', 'flex:0 0 auto;white-space:nowrap;font-variant-numeric:tabular-nums');
  const start = document.createElement('button');
  const shot = document.createElement('button');
  const end = document.createElement('button');
  start.type = 'button';
  start.setAttribute('title', '开始录制');
  start.setAttribute('aria-label', '开始录制');
  start.innerHTML = '<svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="4" width="9" height="8" rx="2"></rect><path d="M10.5 7.4 14.5 5v6l-4-2.4z"></path></svg>开始';
  shot.type = 'button';
  shot.setAttribute('title', '拍一张当前页面的截图');
  shot.setAttribute('aria-label', '拍一张当前页面的截图');
  shot.innerHTML = '<svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 5V1.5H5M11 1.5h3.5V5M14.5 11v3.5H11M5 14.5H1.5V11"></path><rect x="6" y="6" width="4" height="4" rx="1"></rect></svg>截图';
  end.type = 'button';
  end.setAttribute('title', '结束录制');
  end.setAttribute('aria-label', '结束录制');
  end.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><rect x="2" y="2" width="8" height="8" rx="1.5" fill="currentColor"></rect></svg>结束';
  const look = (on) => 'display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 8px;border:0;border-radius:6px;font-size:12px;line-height:1;font-family:inherit;white-space:nowrap;cursor:' + (on ? 'pointer' : 'default') + ';color:' + (on ? '#fff' : 'rgba(255,255,255,.45)') + ';background:' + (on ? '#3b82f6' : '#2b3444');
  const paint = () => {
    const phase = state.phase;
    const taken = typeof state.shots === 'number' ? state.shots : 0;
    label.textContent = (phase === 'recording' ? '录制中 · ' : phase === 'finished' ? '录制完成 · ' : '录制 · 等开始 · ') + String(state.calls.length) + ' 条' + (taken > 0 ? ' · 已拍 ' + String(taken) + ' 张' : '');
    dot.style.display = phase === 'recording' ? 'inline-block' : 'none';
    start.disabled = phase !== 'armed';
    shot.disabled = phase !== 'recording';
    end.disabled = phase !== 'recording';
    start.setAttribute('style', look(phase === 'armed'));
    shot.setAttribute('style', look(phase === 'recording'));
    end.setAttribute('style', look(phase === 'recording'));
  };
  state.__repaint = paint;
  const drag = { on: false, px: 0, py: 0, left: 0, top: 0, w: 0, h: 0 };
  const drop = () => {
    if (!drag.on) return;
    drag.on = false;
    grip.style.cursor = 'grab';
    keep();
  };
  grip.onpointerdown = (event) => {
    const rect = bar.getBoundingClientRect();
    drag.on = true;
    drag.px = event.clientX;
    drag.py = event.clientY;
    drag.left = rect.left;
    drag.top = rect.top;
    drag.w = rect.width;
    drag.h = rect.height;
    grip.style.cursor = 'grabbing';
    if (typeof grip.setPointerCapture === 'function') {
      try {
        grip.setPointerCapture(event.pointerId);
      } catch (error) {}
    }
    if (typeof event.preventDefault === 'function') event.preventDefault();
  };
  grip.onpointermove = (event) => {
    if (!drag.on) return;
    place(drag.left + event.clientX - drag.px, drag.top + event.clientY - drag.py, drag.w, drag.h);
  };
  grip.onpointerup = drop;
  grip.onpointercancel = drop;
  grip.onkeydown = (event) => {
    const step = event.shiftKey ? 40 : 16;
    const rect = bar.getBoundingClientRect();
    const left = event.key === 'ArrowLeft' ? rect.left - step : event.key === 'ArrowRight' ? rect.left + step : rect.left;
    const top = event.key === 'ArrowUp' ? rect.top - step : event.key === 'ArrowDown' ? rect.top + step : rect.top;
    if (left === rect.left && top === rect.top) return;
    place(left, top);
    keep();
    if (typeof event.preventDefault === 'function') event.preventDefault();
  };
  start.onclick = () => {
    if (state.phase !== 'armed') return;
    state.phase = 'recording';
    state.t0 = Date.now();
    state.t1 = null;
    state.href = location.href;
    state.calls = [];
    state.dropped = 0;
    beatOf('start');
    keep();
    paint();
  };
  shot.onclick = () => {
    if (state.phase !== 'recording') return;
    state.shots = (typeof state.shots === 'number' ? state.shots : 0) + 1;
    state.shotsAt = Date.now();
    beatOf('shot');
    keep();
    paint();
  };
  end.onclick = () => {
    state.phase = 'finished';
    state.t1 = Date.now();
    beatOf('stop');
    keep();
    paint();
  };
  bar.textContent = '';
  bar.appendChild(grip);
  bar.appendChild(dot);
  bar.appendChild(label);
  bar.appendChild(shot);
  bar.appendChild(start);
  bar.appendChild(end);
  if (typeof state.barX === 'number' && typeof state.barY === 'number') place(state.barX, state.barY);
  paint();
  return { ok: true, fresh, phase: state.phase, t0: state.t0 === undefined ? null : state.t0, t1: state.t1 === undefined ? null : state.t1, href: state.href || location.href, size: state.calls.length, shots: typeof state.shots === 'number' ? state.shots : 0, shotsAt: typeof state.shotsAt === 'number' ? state.shotsAt : null, dropped: typeof state.dropped === 'number' ? state.dropped : 0 };
})()`;

export const RECORD_READ_SCRIPT = `(async () => {
  const KEY = ${JSON.stringify(RECORD_KEY)};
  const KEEP = ${JSON.stringify(RECORD_KEEP_KEY)};
  const BEAT_WAIT = 3000;
  let state = window[KEY] !== null && typeof window[KEY] === 'object' ? window[KEY] : null;
  if (state === null) {
    try {
      const raw = sessionStorage.getItem(KEEP);
      state = raw === null ? null : JSON.parse(raw);
    } catch (error) {
      state = null;
    }
  }
  if (state === null || typeof state !== 'object') return { ok: false, code: 'not-armed', phase: 'none', calls: [], shots: 0, shotsAt: null, beat: false, beatKind: '' };
  const from = typeof state.beatSeen === 'number' ? state.beatSeen : 0;
  let resolveWake = null;
  const woken = new Promise((resolve) => {
    resolveWake = resolve;
  });
  const onBeat = () => {
    const go = resolveWake;
    resolveWake = null;
    if (go !== null) go();
  };
  window.__dshBeatWake = onBeat;
  const changed = () => (typeof state.beatN === 'number' ? state.beatN : 0) !== from;
  if (!changed()) {
    let timer = null;
    await Promise.race([woken, new Promise((resolve) => { timer = setTimeout(resolve, BEAT_WAIT); })]);
    if (timer !== null) clearTimeout(timer);
  }
  if (window.__dshBeatWake === onBeat) window.__dshBeatWake = null;
  const after = typeof state.beatN === 'number' ? state.beatN : 0;
  const beat = after !== from;
  state.beatSeen = after;
  return { ok: true, phase: typeof state.phase === 'string' ? state.phase : 'armed', t0: state.t0 === undefined ? null : state.t0, t1: state.t1 === undefined ? null : state.t1, href: typeof state.href === 'string' ? state.href : '', here: location.href, dropped: typeof state.dropped === 'number' ? state.dropped : 0, shots: typeof state.shots === 'number' ? state.shots : 0, shotsAt: typeof state.shotsAt === 'number' ? state.shotsAt : null, beat, beatKind: beat && typeof state.beatKind === 'string' ? state.beatKind : '', calls: Array.isArray(state.calls) ? state.calls : [] };
})()`;

export const RECORD_STOP_SCRIPT = `(() => {
  const KEY = ${JSON.stringify(RECORD_KEY)};
  const KEEP = ${JSON.stringify(RECORD_KEEP_KEY)};
  const OFF = ${JSON.stringify(RECORD_OFF_KEY)};
  let state = window[KEY] !== null && typeof window[KEY] === 'object' ? window[KEY] : null;
  if (state === null) {
    try {
      const raw = sessionStorage.getItem(KEEP);
      state = raw === null ? null : JSON.parse(raw);
    } catch (error) {
      state = null;
    }
  }
  let unhooked = 0;
  if (typeof window[OFF] === 'function') {
    try {
      window[OFF]();
      unhooked = 1;
    } catch (error) {}
  }
  const bar = document.getElementById('__dsh-record-bar');
  if (bar !== null) bar.remove();
  const sheet = document.getElementById('__dsh-record-bar-style');
  if (sheet !== null) sheet.remove();
  try {
    delete window[KEY];
  } catch (error) {
    window[KEY] = undefined;
  }
  try {
    delete window[OFF];
  } catch (error) {
    window[OFF] = undefined;
  }
  try {
    sessionStorage.removeItem(KEEP);
  } catch (error) {}
  return { ok: true, unhooked, phase: state !== null && typeof state === 'object' ? state.phase : 'none', t0: state !== null && typeof state === 'object' && state.t0 !== undefined ? state.t0 : null, t1: state !== null && typeof state === 'object' && state.t1 !== undefined ? state.t1 : null, calls: state !== null && typeof state === 'object' && Array.isArray(state.calls) ? state.calls : [], dropped: state !== null && typeof state === 'object' && typeof state.dropped === 'number' ? state.dropped : 0 };
})()`;
