// 彩格码：卷积码、版面、理想往返、仿真摄像头（含旋转 90°、混帧）、整段传输（喷泉码）
'use strict';
global.QX = require('../../src/codec.js');
const G = require('../../src/grid-code.js');
const { shoot } = require('../sim/camera.js');
const { fakeSession } = require('../sim/util.js');
const { FountainDecoder } = global.QX;
let fail = 0;
const check = (c, m) => { console.log((c ? '  ✔ ' : '  ✘ ') + m); if (!c) fail++; };

// 1) 卷积码：码率 1/3~3/4，加噪声后能纠正
{
  let errs = 0;
  for (const n of [1520, 1000, 680]) {
    const info = Uint8Array.from({ length: 500 }, (_, i) => (i * 7 + (i >> 3)) & 1);
    const llr = Float32Array.from(G._.codeBits(info, n), (b, i) => (b ? -2 : 2) + Math.sin(i * 12.9898) * 1.4);
    const out = G._.decodeBits(llr, 500); for (let i = 0; i < 500; i++) errs += out[i] !== info[i];
  }
  check(errs === 0, `卷积码软判决纠错（误位 ${errs}）`);
}
// 2) 版面：块等分、无重叠
for (const [long, lv, rate] of [[73, [2, 2, 2], 4], [85, [2, 4, 2], 4], [97, [4, 4, 4], 2]]) {
  const L = G.makeLayout(G.profile({ long, levels: lv, rate, tile: 24 }));
  const seen = new Set(); let dup = 0;
  for (const t of L.tiles) for (const k of t.cells) { if (seen.has(k)) dup++; seen.add(k); }
  check(!dup && L.tiles.every(t => t.cells.length === L.tiles[0].cells.length) && L.C % 4 === 0,
    `版面 ${L.cols}×${L.rows} ${lv.join('')}：${L.T} 块 × ${L.C} 字节，块大小一致、无重叠`);
}
// 3) 仿真摄像头：正常 / 旋转 90° / 混帧
const L = G.makeLayout(G.profile({ long: 85, levels: [2, 4, 2], rate: 4, tile: 24 }));
const sess = fakeSession(L.C, 300), fr = new G.GridFramer(sess, L);
const img = k => fr.paint(Array.from({ length: L.T }, (_, j) => k * L.T + j));
const valid = r => r.frames.every(f => sess.payload(f.seq).every((v, i) => v === f.payload[i]));
for (const [name, o, need] of [
  ['典型条件', { cond: 'typical', seed: 3 }, 1],
  ['较差条件', { cond: 'bad', seed: 5 }, 0.8],
  ['手机转 90°', { cond: 'typical', seed: 7, rot: Math.PI / 2 + 0.05 }, 1],
]) {
  const r = G.readFrame(shoot([img(0)], { W: 720, H: 720, fill: 0.85, ...o }), 720, 720);
  check(r.ok && r.okTiles >= need * r.tiles && valid(r), `${name}：解出 ${r.okTiles || 0}/${r.tiles || L.T} 块${r.reason ? '（' + r.reason + '）' : ''}`);
}
{
  const r = G.readFrame(shoot([img(0), img(1)], { W: 720, H: 720, fill: 0.85, cond: 'typical', seed: 9, mix: { y0: 0.45, band: 0.1 } }), 720, 720);
  const a = r.frames.filter(f => f.seq < L.T).length, b = r.frames.filter(f => f.seq >= L.T).length;
  check(r.ok && a > 0 && b > 0 && valid(r), `混帧：一张照片里同时解出上一帧 ${a} 块、下一帧 ${b} 块`);
}
// 4) 整段传输：仿真摄像头逐张拍 → 喷泉码还原
{
  const data = Uint8Array.from({ length: 6000 }, (_, i) => (i * 131) & 255);
  const C = L.C, K = Math.ceil(data.length / C), pad = new Uint8Array(K * C); pad.set(data);
  const s2 = { sid: 'UT01', K, len: data.length, crc: '00000000', C, payload: q => {
    if (q < K) return pad.subarray(q * C, q * C + C);
    const bits = QX.rowBits('UT01', q, K), out = new Uint8Array(C);
    for (let i = 0; i < K; i++) if ((bits[i >>> 5] >>> (i & 31)) & 1) for (let j = 0; j < C; j++) out[j] ^= pad[i * C + j];
    return out;
  } };
  const f2 = new G.GridFramer(s2, L), dec = new FountainDecoder('UT01', K, C);
  let shots = 0, hint = null;
  for (let k = 0; !dec.done && k < 20; k++) {
    shots++;
    const r = G.readFrame(shoot([f2.paint(Array.from({ length: L.T }, (_, j) => k * L.T + j))], { W: 720, H: 720, fill: 0.82, cond: 'typical', seed: 20 + k }), 720, 720, hint);
    if (r.meta) hint = r.meta;
    for (const f of r.frames) dec.add(f.seq, f.payload);
  }
  let ok = dec.done;
  if (ok) { dec.solve(); ok = dec.packet(data.length).every((v, i) => v === data[i]); }
  check(ok, `整段传输：${shots} 张照片还原 ${data.length} 字节（K=${K}）`);
}
if (fail) { console.error(`\n❌ ${fail} 项失败`); process.exit(1); }
