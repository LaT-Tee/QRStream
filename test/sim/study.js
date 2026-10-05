/* 码型参数仿真：同一套摄像头模型下比较 QR RGB（现状）与彩格码各配置，每张照片能收到多少有效字节。
 *   node test/sim/study.js levels   色阶 × 码率（长边 97 格）
 *   node test/sim/study.js density  格子密度（长边格数）
 *   node test/sim/study.js tile     分块大小 × 混帧
 *   node test/sim/study.js all
 * 多进程并行；结果打印成表格，同时写到 test/sim/out/<名>.json
 */
'use strict';
const path = require('path'), fs = require('fs'), { fork } = require('child_process'), os = require('os');

const CONDS = ['good', 'typical', 'bad', 'awful'];

async function runJob(j) {
  const { shoot, PRESETS } = require('./camera.js');
  if (!PRESETS.awful) PRESETS.awful = { blur: 1.8, motion: 3.0, noise: 2.5, moire: 0.10, k1: 0.045, tilt: 0.09, glare: 0.10, sharpen: 0.8, xtalk: 0.28, wb: 0.12, vignette: 0.35, over: 1.30 };
  const { fakeSession } = require('./util.js');
  const W = j.W || 720, H = j.H || 720;
  const cam = { W, H, fill: j.fill, rot: j.rot, cond: j.cond, seed: j.seed, mix: j.mix };
  if (j.kind === 'qr') {
    const QX = global.QX;
    const { SenderSession, paint } = require('../../src/sender-core.js');
    const { makeScanner } = require('../../src/scan-core.js');
    const scan = await qrScanner(makeScanner);
    const data = new Uint8Array(200000).map((_, i) => (i * 7919) & 255);
    const s = new SenderSession({ t: 'file', name: 'x', mime: 'a/b', z: false, len: data.length }, data, { chunk: j.chunk, ecc: 'L' });
    const pic = f => { const { N, data: d } = paint(f); return { w: N, h: N, data: d }; };
    const frames = j.rgb ? [s.build(j.seed * 3), s.build(j.seed * 3 + 1), s.build(j.seed * 3 + 2)] : [s.build(j.seed)];
    const screens = [pic(frames)];
    if (j.mix) screens.push(pic(j.rgb ? [s.build(j.seed * 3 + 3), s.build(j.seed * 3 + 4), s.build(j.seed * 3 + 5)] : [s.build(j.seed + 1)]));
    const px = shoot(screens, cam);
    const r = await scan(px, W, H, j.rgb ? 'auto' : 'gray');
    const ok = r.texts.filter(t => QX.parseFrame(t)).length;
    return { ok, of: frames.length, bytes: ok * s.C, pxPerCell: j.fill * Math.min(W, H) / (s.type * 4 + 17 + 8) };
  }
  const G = require('../../src/grid-code.js');
  const L = G.makeLayout(G.profile({ long: j.long, aspect: j.aspect || 1, levels: j.levels, rate: j.rate, tile: j.tile }));
  const sess = fakeSession(L.C), f = new G.GridFramer(sess, L);
  const seqs = k => Array.from({ length: L.T }, (_, i) => k * L.T + i);
  const screens = [f.paint(seqs(0))];
  if (j.mix) screens.push(f.paint(seqs(1)));
  const px = shoot(screens, cam);
  const t0 = Date.now(), r = G.readFrame(px, W, H), ms = Date.now() - t0;
  const good = r.frames.filter(fr => { const p = sess.payload(fr.seq); return p.every((v, i) => v === fr.payload[i]); }).length;
  return { ok: good, of: L.T, bytes: good * L.C, bad: r.frames.length - good, detect: r.ok, reason: r.reason || '', ms, C: L.C,
    pxPerCell: j.fill * Math.min(W, H) / (Math.max(L.cols, L.rows) + 4) };
}
let qrScan = null;
async function qrScanner(makeScanner) {
  if (qrScan) return qrScan;
  if (!global.ImageData) global.ImageData = class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; this.colorSpace = 'srgb'; } };
  const Z = require('zxing-wasm/reader');
  let zd = path.dirname(require.resolve('zxing-wasm/reader'));
  while (!fs.existsSync(path.join(zd, 'dist/reader/zxing_reader.wasm'))) zd = path.dirname(zd);
  const wasm = fs.readFileSync(path.join(zd, 'dist/reader/zxing_reader.wasm'));
  await Z.prepareZXingModule({ overrides: { wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.length) }, fireImmediately: true });
  const OPT = { formats: ['QRCode'], tryHarder: false, tryRotate: false, tryInvert: false, tryDownscale: false, tryDenoise: false, maxNumberOfSymbols: 1, textMode: 'Plain' };
  qrScan = makeScanner(async (px, w, h) => { const r = await Z.readBarcodes(new ImageData(px, w, h), OPT); return r.length && r[0].isValid ? r[0].text : null; });
  return qrScan;
}

if (process.argv[2] === '--worker') {
  global.QX = require('../../src/codec.js');
  process.on('message', async j => { try { process.send({ id: j.id, res: await runJob(j) }); } catch (e) { process.send({ id: j.id, err: e.stack }); } });
  return;
}

/* ---------- 主进程：生成任务、并行执行、汇总 ---------- */
function pose(seed) {
  let a = seed * 2654435761 >>> 0; const r = () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
  return { fill: 0.75 + r() * 0.15, rot: (r() - 0.5) * 0.25 + (r() < 0.25 ? Math.PI / 2 : 0) };
}
async function runAll(jobs) {
  const n = Math.max(1, os.cpus().length), res = new Array(jobs.length);
  let next = 0, done = 0;
  await new Promise(resolve => {
    const spawn = () => {
      const cp = fork(__filename, ['--worker']);
      let cur = -1, timer = 0;
      const finish = (id, r) => {
        clearTimeout(timer); if (res[id]) return; res[id] = r;
        if (++done === jobs.length) resolve();
        if (done % 20 === 0) process.stderr.write(`  ${done}/${jobs.length}\r`);
      };
      const feed = () => {
        if (next >= jobs.length) { cp.kill(); return; }
        cur = next++; cp.send({ ...jobs[cur], id: cur });
        timer = setTimeout(() => { console.error('超时：', JSON.stringify(jobs[cur])); finish(cur, { ok: 0, of: 1, bytes: 0, err: 'timeout' }); cp.kill(); }, 60000);
      };
      cp.on('message', m => { if (m.err) console.error(m.err); finish(m.id, m.err ? { ok: 0, of: 1, bytes: 0, err: true } : m.res); cur = -1; feed(); });
      cp.on('exit', code => { if (cur >= 0 && !res[cur]) { console.error('进程退出', code, JSON.stringify(jobs[cur])); finish(cur, { ok: 0, of: 1, bytes: 0, err: 'exit' }); } if (next < jobs.length) spawn(); });
      feed();
    };
    for (let w = 0; w < n; w++) spawn();
  });
  return res;
}
function table(title, rows) {
  console.log('\n## ' + title);
  const keys = Object.keys(rows[0]);
  const wd = keys.map(k => Math.max(k.length, ...rows.map(r => String(r[k]).length)));
  console.log(keys.map((k, i) => k.padEnd(wd[i])).join(' | '));
  for (const r of rows) console.log(keys.map((k, i) => String(r[k]).padEnd(wd[i])).join(' | '));
}
const avg = a => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
async function study(name, configs, { trials = 6, conds = CONDS, mixFrac = 0 } = {}) {
  const jobs = [];
  for (const c of configs) for (const cond of conds) for (let t = 0; t < trials; t++) {
    const seed = 1000 + t * 7 + 1, p = pose(seed);
    const mix = mixFrac && t % 2 === 1 ? { y0: 0.2 + (t % 5) * 0.12, band: mixFrac } : null;
    jobs.push({ ...c, cond, seed, ...p, mix });
  }
  const t0 = Date.now(), res = await runAll(jobs);
  const rows = [];
  for (const c of configs) {
    const row = { 配置: c.label };
    for (const cond of conds) {
      const rs = res.filter((_, i) => jobs[i].label === c.label && jobs[i].cond === cond);
      const okRate = avg(rs.map(r => r.ok / r.of)), bytes = avg(rs.map(r => r.bytes));
      row[cond] = `${(okRate * 100).toFixed(0).padStart(3)}% ${bytes.toFixed(0).padStart(5)}B` + (rs.some(r => r.bad) ? ' !误码' : '');
    }
    const any = res.find((r, i) => jobs[i].label === c.label && r.pxPerCell);
    row['像素/格'] = any ? any.pxPerCell.toFixed(1) : '?';
    rows.push(row);
  }
  table(`${name}（每格表示：块成功率 + 每张照片平均有效字节；${trials} 次/格，${((Date.now() - t0) / 1000).toFixed(0)} 秒）`, rows);
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', name + '.json'), JSON.stringify({ configs, jobs, res }, null, 1));
  return rows;
}

const QR = { kind: 'qr', chunk: 500, rgb: true, label: 'QR RGB×3（现状 500B）' };
const QRM = { kind: 'qr', chunk: 500, rgb: false, label: 'QR 黑白（500B）' };
const grid = (long, levels, rate, tile = 24) => ({ kind: 'grid', long, levels, rate, tile,
  label: `彩格 ${long}格 ${levels.join('')}色阶 R=${['1/3', '2/5', '1/2', '3/5', '2/3', '3/4', '4/5'][rate]} 块${tile}` });

(async () => {
  const which = process.argv[2] || 'all';
  if (which === 'levels' || which === 'all') await study('levels', [QR, QRM,
    ...[85, 97].flatMap(n => [grid(n, [2, 2, 2], 2), grid(n, [2, 2, 2], 4), grid(n, [2, 2, 2], 5),
      grid(n, [2, 4, 2], 2), grid(n, [2, 4, 2], 4), grid(n, [4, 4, 2], 2), grid(n, [4, 4, 2], 4),
      grid(n, [4, 4, 4], 1), grid(n, [4, 4, 4], 2), grid(n, [4, 4, 4], 4)])], { trials: 8 });
  if (which === 'density' || which === 'all') await study('density', [QR,
    ...[73, 85, 97, 113].flatMap(n => [grid(n, [2, 2, 2], 4), grid(n, [2, 4, 2], 2), grid(n, [4, 4, 4], 2)])], { trials: 8 });
  if (which === 'tile' || which === 'all') await study('tile', [QR,
    ...[16, 24, 32].flatMap(t => [grid(85, [2, 2, 2], 4, t), grid(85, [2, 4, 2], 2, t)])], { conds: ['typical', 'bad'], mixFrac: 0.3, trials: 10 });
})();
