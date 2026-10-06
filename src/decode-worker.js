/* 解码 Worker：解析帧 → 喷泉码增量消元 → 回代 → 校验/解压；IndexedDB 断点续传。依赖 QX（codec.js，构建时拼在前面） */
'use strict';
const { parseFrame, crc32n, hex, FountainDecoder } = self.QX;

/* ---------- IndexedDB ---------- */
const DBN = 'qrx4', KEEP_MS = 3 * 86400e3;
let dbP = null;
function db() {
  if (dbP) return dbP;
  dbP = new Promise((res) => {
    let rq;
    try { rq = indexedDB.open(DBN, 1); } catch (e) { return res(null); }
    rq.onupgradeneeded = () => {
      const d = rq.result;
      d.createObjectStore('sessions', { keyPath: 'sid' });
      d.createObjectStore('frames', { keyPath: ['sid', 'seq'] }).createIndex('sid', 'sid');
    };
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => res(null);
  });
  return dbP;
}
const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function idbSessionGet(sid) { const d = await db(); if (!d) return null; return reqP(d.transaction('sessions').objectStore('sessions').get(sid)).catch(() => null); }
async function idbFrames(sid) { const d = await db(); if (!d) return [];
  return reqP(d.transaction('frames').objectStore('frames').index('sid').getAll(sid)).catch(() => []); }
async function idbDeleteSession(sid) {
  const d = await db(); if (!d) return;
  const tx = d.transaction(['sessions', 'frames'], 'readwrite');
  tx.objectStore('sessions').delete(sid);
  tx.objectStore('frames').delete(IDBKeyRange.bound([sid, 0], [sid, Infinity]));
  return new Promise(r => { tx.oncomplete = tx.onerror = tx.onabort = r; });
}
async function idbClearAll() {
  const d = await db(); if (!d) return;
  const tx = d.transaction(['sessions', 'frames'], 'readwrite');
  tx.objectStore('sessions').clear(); tx.objectStore('frames').clear();
  return new Promise(r => { tx.oncomplete = tx.onerror = tx.onabort = r; });
}
async function idbCleanup() {
  const d = await db(); if (!d) return;
  const all = await reqP(d.transaction('sessions').objectStore('sessions').getAll()).catch(() => []);
  for (const s of all) if (Date.now() - s.updated > KEEP_MS) await idbDeleteSession(s.sid);
}
let pend = [], flushT = 0;
function persist(sid, seq, payload) {
  pend.push({ sid, seq, payload: payload.slice() });
  if (!flushT) flushT = setTimeout(flush, 600);
}
async function flush() {
  flushT = 0;
  const items = pend; pend = [];
  if (!items.length || !S) return;
  const d = await db(); if (!d) return;
  try {
    const tx = d.transaction(['sessions', 'frames'], 'readwrite');
    tx.objectStore('sessions').put({ sid: S.sid, K: S.K, len: S.len, crc: S.crc, C: S.C, updated: Date.now() });
    const fs = tx.objectStore('frames');
    for (const it of items) fs.put(it);
  } catch (e) { /* 存储满等情况：只是不能续传，不影响本次接收 */ }
}

/* ---------- 会话 ---------- */
let S = null;          // {sid,K,len,crc,C,dec,t0,done}
const doneSids = new Set();
let lastText = '';

function post(m, tr) { self.postMessage(m, tr || []); }

function progress() {
  const d = S.dec;
  post({ type: 'progress', sid: S.sid, K: S.K, rank: d.rank, known: d.known, received: d.received,
    newly: d.newly.slice(), missing: S.K - d.rank <= 60 ? d.missingRanges(60) : '' });
}

async function startSession(f) {
  if (S && !S.done) await flush();
  S = { sid: f.sid, K: f.K, len: f.len, crc: f.crc, C: f.C, dec: new FountainDecoder(f.sid, f.K, f.C), t0: performance.now(), done: false };
  post({ type: 'session', sid: S.sid, K: S.K, len: S.len, C: S.C, v: f.v });
  // 续传：把之前存下的有效帧重放一遍
  const saved = await idbSessionGet(f.sid);
  if (saved && saved.K === f.K && saved.crc === f.crc && saved.C === f.C) {
    const frames = await idbFrames(f.sid);
    const allNew = [];
    for (const fr of frames) { if (S.dec.add(fr.seq, fr.payload) === 'useful') allNew.push(...S.dec.newly); }
    if (frames.length) {
      S.dec.newly = allNew;
      post({ type: 'log', msg: `已从本机恢复 ${frames.length} 帧（会话 ${f.sid}）` });
      progress();
      if (S.dec.done) await finish();
    }
  }
}

let chain = Promise.resolve();
function onTexts(texts) {
  for (const t of texts) chain = chain.then(() => onText(t)).catch(e => post({ type: 'log', msg: '解码异常：' + e.message }));
}
async function onText(txt) {
  if (txt === lastText) return; lastText = txt;
  const f = parseFrame(txt);
  if (!f) { post({ type: 'foreign', text: txt.slice(0, 80) }); return; }
  await onFrame(f);
}
/** 彩格码的块：识别线程已校验过 CRC，字段与 parseFrame 的结果相同 */
function onFrames(frames) {
  for (const f of frames) chain = chain.then(() => onFrame(f)).catch(e => post({ type: 'log', msg: '解码异常：' + e.message }));
}
async function onFrame(f) {
  if (doneSids.has(f.sid + f.crc)) return;
  if (!S || S.sid !== f.sid || S.K !== f.K || S.crc !== f.crc || S.C !== f.C) await startSession(f);
  if (S.done) return;
  const r = S.dec.add(f.seq, f.payload);
  if (r !== 'useful') { if (r === 'useless') post({ type: 'tick', received: S.dec.received }); return; }
  persist(S.sid, f.seq, f.payload);
  progress();
  if (S.dec.done) await finish();
}

async function finish() {
  S.done = true; doneSids.add(S.sid + S.crc);
  const t = performance.now();
  post({ type: 'solving', pct: 0 });
  let lastP = 0;
  S.dec.solve(p => { if (p - lastP > 0.02) { lastP = p; post({ type: 'solving', pct: p }); } });
  const pkt = S.dec.packet(S.len);
  const secs = (performance.now() - S.t0) / 1000;
  if (hex(crc32n(pkt), 8) !== S.crc) { post({ type: 'fail', msg: 'CRC 校验失败，请重置后重扫' }); await idbDeleteSession(S.sid); return; }
  try {
    const dv = new DataView(pkt.buffer, pkt.byteOffset, pkt.byteLength), mlen = dv.getUint32(0);
    const meta = JSON.parse(new TextDecoder().decode(pkt.subarray(4, 4 + mlen)));
    let data = pkt.slice(4 + mlen);
    if (meta.z === 'lzma') {
      if (!self.LZMA) throw new Error('缺少 LZMA 解压器');
      const r = self.LZMA.decompress(data);     // 同步；合法 UTF-8 会还成字符串
      if (r == null) throw new Error('LZMA 解压失败');
      data = typeof r === 'string' ? new TextEncoder().encode(r) : Uint8Array.from(r, x => x & 255);
    } else if (meta.z) {
      if (typeof DecompressionStream === 'undefined') throw new Error('此浏览器不支持解压（需 iOS 16.4+ / Chrome 80+），请在发送端取消压缩');
      data = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
    }
    if (data.length !== meta.len) throw new Error(`长度不一致 ${data.length} != ${meta.len}`);
    post({ type: 'done', meta, data: data.buffer, secs, plen: S.len, received: S.dec.received, K: S.K, solveMs: performance.now() - t }, [data.buffer]);
    await idbDeleteSession(S.sid);
  } catch (e) { post({ type: 'fail', msg: '解析失败：' + e.message }); }
}

self.onmessage = async e => {
  const m = e.data;
  if (m.texts) onTexts(m.texts);
  if (m.frames) onFrames(m.frames);
  else if (m.cmd === 'reset') {
    chain = chain.then(async () => { S = null; lastText = ''; pend = []; doneSids.clear(); await idbClearAll(); post({ type: 'reset' }); });
  }
};
idbCleanup();
