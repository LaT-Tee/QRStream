/* 混帧时序模型（仅测试用）：屏幕每 T 毫秒换一帧（对齐 60Hz 刷新），手机 30fps 卷帘快门逐行曝光。
 * 一行像素的曝光窗口跨过换帧时刻（加上液晶响应时间）就是「混帧」。
 *   整码（QR）：照片里码所在的行只要有一行混帧，整码作废
 *   分块（彩格码）：块所在的行都干净就能解；同一帧的同一块被拍到一次就够
 *   方块分块与手机横竖无关：无论码转多少度，每块都只占码在画面里约 1/tilesY 的行
 * 输出：每秒收到多少「不同的有效块」（以整帧的块数为 1 个单位，即每秒等效收齐几帧）
 *
 *   node test/sim/timing.js
 */
'use strict';
const { rng } = require('./camera.js');

function simulate({ T, fps = 30, readout = 26, expo = 10, lcd = 6, codeRows = [0.08, 0.92], tilesY = 4, proc = 1, secs = 60, seed = 1 }) {
  const r = rng(seed), frameMs = 1000 / fps, refresh = 1000 / 60;
  T = Math.max(refresh, Math.round(T / refresh) * refresh);           // 换帧对齐到刷新
  const phase = r() * T;
  const seenWhole = new Set(), seenTile = new Set();
  let shots = 0;
  for (let k = 0; k * frameMs < secs * 1000; k++) {
    if (k % proc) continue;                                             // 识别跟不上时隔帧处理
    shots++;
    const t0 = k * frameMs + r() * 0.5;
    const [a, b] = codeRows, tiles = [];
    for (let i = 0; i < tilesY; i++) tiles.push([a + (b - a) * i / tilesY, a + (b - a) * (i + 1) / tilesY]);
    const frameOf = y => {                                              // 该行的曝光窗口落在哪一帧；跨帧返回 -1
      const s = t0 + y * readout, e = s + expo;
      const f0 = Math.floor((s - phase) / T), f1 = Math.floor((e + lcd - phase) / T);
      return f0 === f1 ? f0 : -1;
    };
    const rowsOk = (y0, y1) => { const f = frameOf(y0); if (f < 0) return -1; for (let y = y0; y <= y1; y += 0.01) if (frameOf(y) !== f) return -1; return f; };
    const fw = rowsOk(a, b); if (fw >= 0) seenWhole.add(fw);
    tiles.forEach(([y0, y1], i) => { const f = rowsOk(y0, y1); if (f >= 0) seenTile.add(f + ':' + i); });
  }
  return { T: +T.toFixed(1), whole: seenWhole.size / secs, tiles: seenTile.size / tilesY / secs, shots: shots / secs };
}

if (require.main === module) {
  const rows = [];
  for (const expo of [4, 10, 16]) for (const T of [33.3, 50, 66.7, 83.3, 100, 133.3]) {
    const avg = (o) => { let w = 0, t = 0; for (let s = 1; s <= 8; s++) { const a = simulate({ ...o, seed: s }); w += a.whole; t += a.tiles; } return [w / 8, t / 8]; };
    const [w, t] = avg({ T, expo });
    const [w2, t2] = avg({ T, expo, proc: 2 });
    rows.push({ 曝光ms: expo, 换帧ms: T, '整码 帧/秒': w.toFixed(1), '分块 帧/秒': t.toFixed(1), '整码@15fps识别': w2.toFixed(1), '分块@15fps识别': t2.toFixed(1), '理论上限': (1000 / T).toFixed(1) });
  }
  const keys = Object.keys(rows[0]);
  console.log(keys.join(' | '));
  for (const r of rows) console.log(keys.map(k => r[k]).join(' | '));
}
module.exports = { simulate };
