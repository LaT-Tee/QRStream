/* LDPC 原型 vs 卷积码：BPSK + AWGN 下的块错误率（仅测试用）
 *   node test/sim/ldpc-proto.js
 */
'use strict';
global.QX = require('../../src/codec.js');
const G = require('../../src/grid-code.js');

function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = r => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };

/** IRA LDPC：信息位度数 dv（可传分布），校验位双对角 */
function build(n, k, dvList = [3]) {
  const m = n - k, r = rng(Math.imul(n, 7919) ^ k);
  const dvOf = i => dvList[i % dvList.length];
  let tot = 0; for (let i = 0; i < k; i++) tot += Math.min(dvOf(i), m);
  const deck = new Int32Array(tot); for (let t = 0; t < tot; t++) deck[t] = t % m;
  for (let t = tot - 1; t > 0; t--) { const j = (r() * (t + 1)) | 0, x = deck[t]; deck[t] = deck[j]; deck[j] = x; }
  const pairs = new Set(), key = (a, b) => a < b ? a * m + b : b * m + a;
  for (let j = 0; j + 1 < m; j++) pairs.add(key(j, j + 1));
  const varChecks = []; let p = 0;
  for (let i = 0; i < k; i++) {
    const dv = Math.min(dvOf(i), m), ch = [];
    for (let s = 0; s < dv; s++) {
      let pick = -1;
      for (let q = p; q < tot && q < p + 400; q++) {
        const c = deck[q]; if (ch.includes(c)) continue;
        if (ch.some(c2 => pairs.has(key(c, c2)))) continue;
        pick = q; break;
      }
      if (pick < 0) for (let q = p; q < tot; q++) if (!ch.includes(deck[q])) { pick = q; break; }
      if (pick < 0) { pick = p; }
      const c = deck[pick]; deck[pick] = deck[p]; deck[p] = c; p++;
      ch.push(c);
    }
    for (let a = 0; a < ch.length; a++) for (let b = a + 1; b < ch.length; b++) pairs.add(key(ch[a], ch[b]));
    varChecks.push(ch);
  }
  // CSR：校验 → 变量
  const rows = Array.from({ length: m }, () => []);
  varChecks.forEach((ch, i) => { for (const c of ch) rows[c].push(i); });
  for (let j = 0; j < m; j++) { rows[j].push(k + j); if (j + 1 < m) rows[j + 1].push(k + j); }
  const start = new Int32Array(m + 1); for (let c = 0; c < m; c++) start[c + 1] = start[c] + rows[c].length;
  const ev = new Int32Array(start[m]); for (let c = 0; c < m; c++) ev.set(rows[c], start[c]);
  const infoRows = rows.map(rw => rw.filter(v => v < k));
  return { n, k, m, start, ev, infoRows };
}
function encode(code, info) {
  const { n, k, m, infoRows } = code, cw = new Uint8Array(n); cw.set(info);
  let prev = 0;
  for (let j = 0; j < m; j++) { let s = prev; for (const v of infoRows[j]) s ^= info[v]; cw[k + j] = s; prev = s; }
  return cw;
}
function decode(code, llr, maxIt = 40, alpha = 0.75) {
  const { n, k, m, start, ev } = code, L = Float32Array.from(llr), R = new Float32Array(ev.length), Q = new Float32Array(256);
  let it = 0;
  for (; it < maxIt; it++) {
    for (let c = 0; c < m; c++) {
      const s = start[c], e1 = start[c + 1];
      let m1 = 1e30, m2 = 1e30, idx = -1, sg = 0;
      for (let e = s; e < e1; e++) {
        const q = L[ev[e]] - R[e]; Q[e - s] = q;
        const a = q < 0 ? -q : q;
        if (a < m1) { m2 = m1; m1 = a; idx = e; } else if (a < m2) m2 = a;
        if (q < 0) sg ^= 1;
      }
      for (let e = s; e < e1; e++) {
        const q = Q[e - s], mag = (e === idx ? m2 : m1) * alpha, neg = sg ^ (q < 0 ? 1 : 0);
        const rr = neg ? -mag : mag; R[e] = rr; L[ev[e]] = q + rr;
      }
    }
    let ok = true;
    for (let c = 0; c < m && ok; c++) { let x = 0; for (let e = start[c]; e < start[c + 1]; e++) x ^= L[ev[e]] < 0 ? 1 : 0; if (x) ok = false; }
    if (ok) { it++; break; }
  }
  const out = new Uint8Array(k); for (let i = 0; i < k; i++) out[i] = L[i] < 0 ? 1 : 0;
  return { bits: out, it };
}

module.exports = { build, encode, decode };

if (require.main === module) {
  const k = 64 + 8 * 144, trials = +(process.argv[2] || 200);
  for (const R of [1 / 2, 2 / 3, 3 / 4]) {
    const n = Math.round(k / R);
    const codes = { 'LDPC dv3': build(n, k, [3]), 'LDPC dv3/3/3/3/8': build(n, k, [3, 3, 3, 3, 8]), 'LDPC dv4': build(n, k, [4]) };
    console.log(`\n码率 ${R.toFixed(2)}  k=${k} n=${n}`);
    const row = { 卷积: [] }; for (const name in codes) row[name] = [];
    const ebs = R === 0.5 ? [1, 1.5, 2, 2.5, 3] : R < 0.7 ? [2, 2.5, 3, 3.5, 4] : [2.5, 3, 3.5, 4, 4.5];
    let iters = 0, itN = 0, t0 = Date.now(), tl = 0;
    for (const eb of ebs) {
      const sigma = Math.sqrt(1 / (2 * R * Math.pow(10, eb / 10))), r = rng(eb * 1000 + 7);
      const fer = { 卷积: 0 }; for (const name in codes) fer[name] = 0;
      for (let t = 0; t < trials; t++) {
        const info = Uint8Array.from({ length: k }, () => r() < 0.5 ? 1 : 0);
        // 卷积：同一噪声样本量级（各自码长）
        { const tx = G._.codeBits(info, n, 3), llr = Float32Array.from(tx, b => { const y = (b ? -1 : 1) + sigma * gauss(r); return 2 * y / (sigma * sigma); });
          const out = G._.decodeBits(llr, k, 3); if (out.some((v, i) => v !== info[i])) fer.卷积++; }
        for (const name in codes) {
          const code = codes[name], cw = encode(code, info);
          const llr = Float32Array.from(cw, b => { const y = (b ? -1 : 1) + sigma * gauss(r); return Math.max(-20, Math.min(20, 2 * y / (sigma * sigma))); });
          const t1 = Date.now(); const d = decode(code, llr); tl += Date.now() - t1; iters += d.it; itN++;
          if (d.bits.some((v, i) => v !== info[i])) fer[name]++;
        }
      }
      for (const name in fer) row[name].push(`${eb}dB:${(fer[name] / trials * 100).toFixed(1)}%`);
    }
    for (const name in row) console.log(name.padEnd(18), row[name].join('  '));
    console.log(`LDPC 平均迭代 ${(iters / itN).toFixed(1)}，平均译码 ${(tl / itN).toFixed(2)} ms/块`);
  }
}
