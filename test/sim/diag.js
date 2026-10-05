/* 诊断：某配置在某条件下各张照片卡在哪一步  node test/sim/diag.js awful 97 222 2 */
'use strict';
const { fakeSession, savePNG } = require('./util.js');
const G = require('../../src/grid-code.js');
const { shoot, PRESETS } = require('./camera.js');
PRESETS.awful = PRESETS.awful || { blur: 1.8, motion: 3.0, noise: 2.5, moire: 0.10, k1: 0.045, tilt: 0.09, glare: 0.10, sharpen: 0.8, xtalk: 0.28, wb: 0.12, vignette: 0.35, over: 1.30 };
const [cond = 'awful', long = 97, lv = '222', rate = 2, n = 12] = process.argv.slice(2);
const L = G.makeLayout(G.profile({ long: +long, levels: [...lv].map(Number), rate: +rate, tile: 24 }));
const s = fakeSession(L.C), f = new G.GridFramer(s, L), img = f.paint(Array.from({ length: L.T }, (_, j) => j));
const stats = {};
for (let t = 0; t < +n; t++) {
  const seed = 1000 + t * 7 + 1;
  let a = seed * 2654435761 >>> 0; const r = () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
  const px = shoot([img], { W: 720, H: 720, fill: 0.75 + r() * 0.15, rot: (r() - 0.5) * 0.25 + (r() < 0.25 ? Math.PI / 2 : 0), cond, seed });
  const res = G.readFrame(px, 720, 720);
  const key = res.ok ? `ok ${res.okTiles}/${res.tiles}` : res.reason;
  stats[key] = (stats[key] || 0) + 1;
  if (process.env.SAVE && !res.ok) savePNG(`${process.env.SAVE}/fail-${t}.png`, px, 720, 720);
}
console.log(cond, long, lv, rate, stats);
