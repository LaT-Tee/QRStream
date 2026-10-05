/* 识别 Worker：彩格码（QXG，grid-code.js）+ 二维码（zxing-wasm 内联 WASM 优先，失败回退 jsQR，经 QXScan）。
 * 主线程先发 {init:{zxingJs, wasm, jsqrJs}}，之后每帧发整幅画面 {buf,w,h,mode,out}：
 *   彩格码用整幅画面；二维码只看中间正方形（= 取景框），缩到 out 像素再识别
 * 回 {texts: 二维码文本[], frames: 彩格码块[], via, grid?: {ok, of}, ms} */
'use strict';
let engine = null, scan = null;
const OPT = { formats: ['QRCode'], tryHarder: false, tryRotate: false, tryInvert: false, tryDownscale: false,
              tryDenoise: false, maxNumberOfSymbols: 1, textMode: 'Plain' };
const blobURL = s => URL.createObjectURL(new Blob([s], { type: 'text/javascript' }));

async function init(a) {
  try {
    if (!a.zxingJs || !a.wasm) throw new Error('no zxing');
    importScripts(blobURL(a.zxingJs));
    await ZXingWASM.prepareZXingModule({ overrides: { wasmBinary: a.wasm }, fireImmediately: true });
    // 自检一下，确认 WASM 真的能跑
    await ZXingWASM.readBarcodes(new ImageData(new Uint8ClampedArray(16 * 16 * 4).fill(255), 16, 16), OPT);
    engine = 'zxing-wasm';
    scan = QXScan.makeScanner(async (px, w, h) => {
      const r = await ZXingWASM.readBarcodes(new ImageData(px, w, h), OPT);
      return r.length && r[0].isValid ? r[0].text : null;
    });
  } catch (e) {
    importScripts(blobURL(a.jsqrJs));
    engine = 'jsQR（备用）';
    scan = QXScan.makeScanner(async (px, w, h) => { const c = jsQR(px, w, h, { inversionAttempts: 'dontInvert' }); return c ? c.data : null; });
  }
  postMessage({ ready: engine });
}

/** 取中间正方形并按覆盖面积加权缩到 out×out（可分离：先横后竖；效果同 drawImage 平滑缩放，二维码路径用） */
let sq = null, tmp = null, tab = null;
function weights(side, n) {
  const k = side / n, idx = [], wt = [];
  for (let x = 0; x < n; x++) {
    const a = x * k, b = (x + 1) * k, ii = [], ww = [];
    for (let i = Math.floor(a); i < Math.min(side, Math.ceil(b)); i++) { const w = Math.min(b, i + 1) - Math.max(a, i); if (w > 1e-6) { ii.push(i); ww.push(w / k); } }
    idx.push(ii); wt.push(ww);
  }
  return { side, n, idx, wt };
}
function centerSquare(px, w, h, out) {
  const side = Math.min(w, h), x0 = (w - side) >> 1, y0 = (h - side) >> 1, n = Math.min(side, out);
  if (!sq || sq.length !== n * n * 4) sq = new Uint8ClampedArray(n * n * 4);
  if (n === side) {             // 不缩放：直接拷贝
    for (let y = 0; y < n; y++) sq.set(px.subarray(((y0 + y) * w + x0) * 4, ((y0 + y) * w + x0 + n) * 4), y * n * 4);
    return { px: sq, n };
  }
  if (!tab || tab.side !== side || tab.n !== n) tab = weights(side, n);
  if (!tmp || tmp.length !== side * n * 3) tmp = new Float32Array(side * n * 3);
  for (let y = 0; y < side; y++) {                       // 横向
    const row = ((y0 + y) * w + x0) * 4;
    for (let x = 0; x < n; x++) {
      const ii = tab.idx[x], ww = tab.wt[x]; let r = 0, g = 0, b = 0;
      for (let j = 0; j < ii.length; j++) { const i = row + ii[j] * 4, q = ww[j]; r += px[i] * q; g += px[i + 1] * q; b += px[i + 2] * q; }
      const o = (y * n + x) * 3; tmp[o] = r; tmp[o + 1] = g; tmp[o + 2] = b;
    }
  }
  for (let y = 0; y < n; y++) {                          // 纵向
    const ii = tab.idx[y], ww = tab.wt[y];
    for (let x = 0; x < n; x++) {
      let r = 0, g = 0, b = 0;
      for (let j = 0; j < ii.length; j++) { const i = (ii[j] * n + x) * 3, q = ww[j]; r += tmp[i] * q; g += tmp[i + 1] * q; b += tmp[i + 2] * q; }
      const o = (y * n + x) * 4; sq[o] = r; sq[o + 1] = g; sq[o + 2] = b; sq[o + 3] = 255;
    }
  }
  return { px: sq, n };
}

let readyP = null, last = '', miss = 0, hint = null;   // last：上次成功的码型，先试它（连续失败多次才试另一种）；hint：彩格码会话元信息
onmessage = async e => {
  const m = e.data;
  if (m.init) { readyP = init(m.init); return; }
  if (m.reset) { hint = null; last = ''; miss = 0; return; }
  await readyP;
  const t0 = performance.now(), px = new Uint8ClampedArray(m.buf);
  let r = null;
  const tryGrid = () => {
    if (m.mode !== 'auto' || typeof QXG === 'undefined') return null;
    const g = QXG.readFrame(px, m.w, m.h, hint);
    if (!g.ok) return null;
    if (g.meta && !g.metaFromHint) hint = g.meta;
    last = 'grid';
    return { texts: [], frames: g.frames, via: 'grid', grid: { ok: g.okTiles, of: g.tiles, lv: g.meta.levels.join('') + ':' + g.meta.rate } };
  };
  const tryQR = async () => {
    const { px: s, n } = centerSquare(px, m.w, m.h, m.out || 640);
    const q = await scan(s, n, n, m.mode);
    if (q.texts.length) last = 'qr';
    return q.texts.length ? { texts: q.texts, frames: [], via: q.via } : null;
  };
  try {
    const order = last === 'qr' ? [tryQR, tryGrid] : [tryGrid, tryQR];
    r = await order[0]();
    if (!r && (!last || miss >= 8)) r = await order[1]();
  } catch (err) {}
  miss = r ? 0 : miss + 1;
  r = r || { texts: [], frames: [], via: '' };
  r.ms = performance.now() - t0;
  postMessage(r);
};
