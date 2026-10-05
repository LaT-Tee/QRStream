/* QX5 彩格码（收发两端共用）：自定义的屏幕→摄像头码型，一张图分成很多独立小块，混帧/局部模糊只丢坏掉的块。
 *
 * 版面（单位：格；cols、rows 为奇数）：
 *   四角 7×7 定位块（同心方块，任意方向过中心都是 1:1:3:1:1）+ 1 格白色隔离带
 *   四条时钟线：第 3 行 / 倒数第 4 行 / 第 3 列 / 倒数第 4 列，从定位块中心连到中心，黑白相间，用来数格数和校正几何
 *   导频：约 1/16 的格子颜色已知，逐块拟合「摄像头颜色 → 发送色阶」（校串色、白平衡、暗角、伽马）
 *         A 类导频只用各通道的最暗/最亮级（与色阶配置无关，读元信息时用），B 类覆盖全部色阶
 *   元信息：顶部、底部各一份，固定 8 色 + 强纠错（会话、K、长度、CRC、版面参数）
 *   数据块：其余格子按 tile×tile 分块，每块独立承载一个喷泉码符号
 *           [SEQ 32 位][载荷 C 字节][CRC32(SID‖SEQ‖载荷)] → K=7 码率 1/3 卷积码 → 速率匹配 → 交织 → 每格 RGB 各通道 2 或 4 级（格雷码）
 * 接收端：自适应二值化 → 找定位块 → 时钟线数格数 → 最小二乘单应 → 读元信息（试 4 个方向，CRC 判定）→ 逐块校色、软判决、Viterbi、CRC
 */
(function (root) {
  'use strict';
  const QX = root.QX || (typeof require === 'function' ? require('./codec.js') : null);
  const { crc32n } = QX;

  /* ================= 卷积码：约束长度 7，码率 1/3，生成多项式 133/171/165（八进制） ================= */
  const GEN = [0o133, 0o171, 0o165];
  const OUT = new Uint8Array(128);            // OUT[状态*2+输入] = 3 位输出
  for (let s = 0; s < 64; s++) for (let u = 0; u < 2; u++) {
    const reg = (u << 6) | s; let o = 0;
    for (let k = 0; k < 3; k++) { let x = reg & GEN[k], p = 0; while (x) { p ^= 1; x &= x - 1; } o |= p << k; }
    OUT[s * 2 + u] = o;
  }
  const OUT0 = new Uint8Array(64), OUT1 = new Uint8Array(64);
  for (let s = 0; s < 64; s++) { OUT0[s] = OUT[s * 2]; OUT1[s] = OUT[s * 2 + 1]; }
  function convEncode(bits) {
    const S = bits.length + 6, out = new Uint8Array(S * 3);
    let s = 0;
    for (let t = 0; t < S; t++) {
      const u = t < bits.length ? bits[t] : 0, o = OUT[s * 2 + u];
      out[t * 3] = o & 1; out[t * 3 + 1] = (o >> 1) & 1; out[t * 3 + 2] = o >> 2;
      s = (u << 5) | (s >> 1);
    }
    return out;
  }
  let vDec = new Uint8Array(0);
  const PM0 = new Float64Array(64), PM1 = new Float64Array(64), BM = new Float64Array(8);
  /** 软判决 Viterbi。L：母码对数似然比（正 = 0），长度 3*(nInfo+6) */
  function viterbi(L, nInfo) {
    const S = nInfo + 6;
    if (vDec.length < S * 64) vDec = new Uint8Array(S * 64);
    let pm = PM0, nx = PM1;
    pm.fill(-1e18); pm[0] = 0;
    for (let t = 0; t < S; t++) {
      const a = L[t * 3], b = L[t * 3 + 1], c = L[t * 3 + 2];
      for (let o = 0; o < 8; o++) BM[o] = (o & 1 ? -a : a) + (o & 2 ? -b : b) + (o & 4 ? -c : c);
      const base = t * 64, tail = t >= nInfo;              // 尾比特输入恒为 0
      // 蝶形：前驱 2j、2j+1 → 后继 j（输入 0）和 j+32（输入 1）
      for (let j = 0; j < 32; j++) {
        const s0 = j << 1, p0 = pm[s0], p1 = pm[s0 | 1];
        let m0 = p0 + BM[OUT0[s0]], m1 = p1 + BM[OUT0[s0 | 1]];
        if (m1 > m0) { nx[j] = m1; vDec[base + j] = 1; } else { nx[j] = m0; vDec[base + j] = 0; }
        if (tail) { nx[j | 32] = -1e18; continue; }
        m0 = p0 + BM[OUT1[s0]]; m1 = p1 + BM[OUT1[s0 | 1]];
        if (m1 > m0) { nx[j | 32] = m1; vDec[base + (j | 32)] = 1; } else { nx[j | 32] = m0; vDec[base + (j | 32)] = 0; }
      }
      const tmp = pm; pm = nx; nx = tmp;
    }
    const out = new Uint8Array(nInfo);
    let st = 0;
    for (let t = S - 1; t >= 0; t--) {
      if (t < nInfo) out[t] = st >> 5;
      st = ((st << 1) & 63) | vDec[t * 64 + st];
    }
    return out;
  }

  /* 速率匹配（循环缓冲）：先发第 0 路全部，再按黄金分割顺序发第 1、2 路；不够长就从头重复。任意码率下删余都均匀分布 */
  const PHI = 0.6180339887498949, cbCache = new Map(), ilCache = new Map();
  function circBuf(S) {
    let r = cbCache.get(S); if (r) return r;
    const ord = Array.from({ length: S }, (_, t) => t).sort((a, b) => ((a * PHI) % 1) - ((b * PHI) % 1));
    r = new Int32Array(3 * S); let k = 0;
    for (let t = 0; t < S; t++) r[k++] = t * 3;
    for (const t of ord) r[k++] = t * 3 + 1;
    for (const t of ord) r[k++] = t * 3 + 2;
    cbCache.set(S, r); return r;
  }
  /** 固定伪随机交织（只依赖长度） */
  function interleaver(n) {
    let p = ilCache.get(n); if (p) return p;
    p = new Int32Array(n); for (let i = 0; i < n; i++) p[i] = i;
    let x = (Math.imul(n, 2654435761) >>> 0) || 1;
    for (let i = n - 1; i > 0; i--) {
      x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
      const j = x % (i + 1), t = p[i]; p[i] = p[j]; p[j] = t;
    }
    ilCache.set(n, p); return p;
  }
  /** 加扰序列：发送位与之异或，避免全 0 / 全 1 数据（补零块、空白文件段）画成大片同色，影响测光和定位 */
  const scCache = new Map();
  function scrambler(n, seed) {
    const key = n + ':' + seed; let p = scCache.get(key); if (p) return p;
    p = new Uint8Array(n); let x = (Math.imul(seed + 1, 0x9E3779B9) ^ Math.imul(n, 0x85EBCA6B)) >>> 0 || 1;
    for (let i = 0; i < n; i++) { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; p[i] = x >>> 31; }
    scCache.set(key, p); return p;
  }
  /** 信息位 → n 个发送位（已交织、加扰；seed 区分各块） */
  function codeBits(info, n, seed = 0) {
    const m = convEncode(info), cb = circBuf(info.length + 6), M = cb.length, il = interleaver(n), sc = scrambler(n, seed), out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[il[i]] = m[cb[i % M]];
    for (let i = 0; i < n; i++) out[i] ^= sc[i];
    return out;
  }
  /** n 个发送位的 LLR → 信息位 */
  let dL = new Float32Array(0);
  function decodeBits(llr, nInfo, seed = 0) {
    const n = llr.length, S = nInfo + 6, cb = circBuf(S), M = cb.length, il = interleaver(n), sc = scrambler(n, seed);
    if (dL.length !== 3 * S) dL = new Float32Array(3 * S); else dL.fill(0);
    for (let i = 0; i < n; i++) { const j = il[i]; dL[cb[i % M]] += sc[j] ? -llr[j] : llr[j]; }
    return viterbi(dL, nInfo);
  }
  /* ================= LDPC：IRA 结构（信息位按码率选度分布 + 校验位双对角），分层归一化最小和译码 =================
   * 由 (n, k) 确定性构造（收发两端各自生成同一张图），尽量避开 4 环。同样码率下比 K=7 卷积码约好 1.6~1.8 dB（test/sim/ldpc-proto.js） */
  const ldpcCache = new Map();
  function ldpcCode(n, k) {
    const key = n + ':' + k; let code = ldpcCache.get(key); if (code) return code;
    const m = n - k, R = k / n, dvList = R < 0.58 ? [4, 4, 4, 4, 10] : R < 0.7 ? [3, 3, 6] : [3, 3, 3, 3, 8];
    let a = (Math.imul(n, 7919) ^ k) >>> 0 || 1;
    const rnd = () => { a ^= a << 13; a >>>= 0; a ^= a >>> 17; a ^= a << 5; a >>>= 0; return a / 4294967296; };
    let tot = 0; for (let i = 0; i < k; i++) tot += Math.min(dvList[i % dvList.length], m);
    const deck = new Int32Array(tot); for (let t = 0; t < tot; t++) deck[t] = t % m;
    for (let t = tot - 1; t > 0; t--) { const j = (rnd() * (t + 1)) | 0, x = deck[t]; deck[t] = deck[j]; deck[j] = x; }
    const pairs = new Set(), pk = (x, y) => x < y ? x * m + y : y * m + x;
    for (let j = 0; j + 1 < m; j++) pairs.add(pk(j, j + 1));
    const rows = Array.from({ length: m }, () => []);
    let p = 0;
    for (let i = 0; i < k; i++) {
      const dv = Math.min(dvList[i % dvList.length], m), ch = [];
      for (let t = 0; t < dv; t++) {
        let pick = -1;
        for (let q = p; q < tot && q < p + 400; q++) { const c = deck[q]; if (!ch.includes(c) && !ch.some(c2 => pairs.has(pk(c, c2)))) { pick = q; break; } }
        if (pick < 0) for (let q = p; q < tot; q++) if (!ch.includes(deck[q])) { pick = q; break; }
        if (pick < 0) pick = p;
        const c = deck[pick]; deck[pick] = deck[p]; deck[p] = c; p++; ch.push(c);
      }
      for (let x = 0; x < ch.length; x++) for (let y = x + 1; y < ch.length; y++) pairs.add(pk(ch[x], ch[y]));
      for (const c of ch) rows[c].push(i);
    }
    const infoRows = rows.map(r => Int32Array.from(r));
    for (let j = 0; j < m; j++) { rows[j].push(k + j); if (j + 1 < m) rows[j + 1].push(k + j); }
    const start = new Int32Array(m + 1); for (let c = 0; c < m; c++) start[c + 1] = start[c] + rows[c].length;
    const ev = new Int32Array(start[m]); for (let c = 0; c < m; c++) ev.set(rows[c], start[c]);
    let dmax = 0; for (let c = 0; c < m; c++) dmax = Math.max(dmax, rows[c].length);
    code = { n, k, m, start, ev, infoRows, L: new Float32Array(n), R: new Float32Array(ev.length), Q: new Float32Array(dmax) };
    ldpcCache.set(key, code); return code;
  }
  function ldpcEncode(code, info) {
    const { n, k, m, infoRows } = code, cw = new Uint8Array(n); cw.set(info);
    let prev = 0;
    for (let j = 0; j < m; j++) { let x = prev; const r = infoRows[j]; for (let t = 0; t < r.length; t++) x ^= info[r[t]]; cw[k + j] = x; prev = x; }
    return cw;
  }
  /** 分层归一化最小和。llr 按码字顺序（正 = 0）。8 轮后仍有 >15% 校验不满足就放弃（多半是混帧过渡带里的块） */
  function ldpcDecode(code, llr, maxIt = 40) {
    const { k, m, start, ev, L, R, Q } = code, alpha = 0.75;
    L.set(llr); R.fill(0);
    for (let it = 0; it < maxIt; it++) {
      for (let c = 0; c < m; c++) {
        const s0 = start[c], s1 = start[c + 1];
        let m1 = 1e30, m2 = 1e30, idx = -1, sg = 0;
        for (let e = s0; e < s1; e++) {
          const q = L[ev[e]] - R[e]; Q[e - s0] = q;
          const a = q < 0 ? -q : q;
          if (a < m1) { m2 = m1; m1 = a; idx = e; } else if (a < m2) m2 = a;
          if (q < 0) sg ^= 1;
        }
        for (let e = s0; e < s1; e++) {
          const q = Q[e - s0], mag = (e === idx ? m2 : m1) * alpha, r = (sg ^ (q < 0 ? 1 : 0)) ? -mag : mag;
          R[e] = r; L[ev[e]] = q + r;
        }
      }
      let bad = 0;
      for (let c = 0; c < m; c++) { let x = 0; for (let e = start[c]; e < start[c + 1]; e++) if (L[ev[e]] < 0) x ^= 1; bad += x; }
      if (!bad) break;
      if (it >= 7 && bad > m * 0.15) return null;
    }
    const out = new Uint8Array(k); for (let i = 0; i < k; i++) out[i] = L[i] < 0 ? 1 : 0;
    return out;
  }
  /** LDPC 版：信息位 → n 个发送位（交织、加扰同卷积码版） */
  function codeBitsLdpc(info, n, seed) {
    const cw = ldpcEncode(ldpcCode(n, info.length), info), il = interleaver(n), sc = scrambler(n, seed), out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[il[i]] = cw[i];
    for (let i = 0; i < n; i++) out[i] ^= sc[i];
    return out;
  }
  let lL = new Float32Array(0);
  function decodeBitsLdpc(llr, nInfo, seed) {
    const n = llr.length, il = interleaver(n), sc = scrambler(n, seed);
    if (lL.length !== n) lL = new Float32Array(n);
    for (let i = 0; i < n; i++) { const j = il[i]; lL[i] = sc[j] ? -llr[j] : llr[j]; }
    return ldpcDecode(ldpcCode(n, nInfo), lL);
  }

  const toBits = (u8, out, at) => { for (let i = 0; i < u8.length; i++) for (let b = 0; b < 8; b++) out[at + i * 8 + b] = (u8[i] >> (7 - b)) & 1; };
  const fromBits = (bits, at, nBytes) => { const u8 = new Uint8Array(nBytes);
    for (let i = 0; i < nBytes; i++) { let v = 0; for (let b = 0; b < 8; b++) v = (v << 1) | bits[at + i * 8 + b]; u8[i] = v; } return u8; };

  /* ================= 版面 ================= */
  const LEVELS = { 2: [0, 255], 4: [0, 85, 170, 255] };
  const RATES = [1 / 3, 2 / 5, 1 / 2, 3 / 5, 2 / 3, 3 / 4, 4 / 5];
  const ROLE_DATA = 0, ROLE_FIXED = 1, ROLE_PILOT = 2, ROLE_META = 3, ROLE_PAD = 4;
  const META_CELLS = 120, META_BYTES = 22, META_INFO = (META_BYTES + 4) * 8;
  const QUIET = 2;
  function hash3(r, c, k) {
    let h = Math.imul(r + 1, 73856093) ^ Math.imul(c + 1, 19349663) ^ Math.imul(k + 1, 83492791);
    h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B); h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35); return (h ^ (h >>> 16)) >>> 0;
  }
  const finderDark = (r, c) => { const d = Math.max(Math.abs(r - 3), Math.abs(c - 3)); return d === 3 || d <= 1; };
  const isPilotPos = (r, c) => (r & 3) === 1 && ((c + (((r >> 2) & 1) << 1)) & 3) === 1;

  const layoutCache = new Map();
  /** p = {cols, rows, levels:[lr,lg,lb], rate: RATES 下标, tile} */
  function makeLayout(p) {
    const cols = p.cols | 0, rows = p.rows | 0, levels = p.levels.map(Number), rateIdx = p.rate | 0, tile = p.tile | 0, fec = p.fec === 'conv' ? 'conv' : 'ldpc';
    const key = [cols, rows, levels.join(''), rateIdx, tile, fec].join(',');
    let L = layoutCache.get(key); if (L) return L;
    if (!(cols & 1) || !(rows & 1) || cols < 31 || rows < 31 || cols > 255 || rows > 255) throw new Error('版面尺寸必须是 31..255 的奇数');
    if (!levels.every(l => l === 2 || l === 4) || !RATES[rateIdx] || tile < 8 || tile > 63) throw new Error('版面参数不合法');
    const N = cols * rows, role = new Uint8Array(N), dark = new Uint8Array(N);
    const chBits = levels.map(l => Math.log2(l)), bpc = chBits[0] + chBits[1] + chBits[2];
    // 定位块 + 隔离带
    for (const [top, left] of [[1, 1], [1, 0], [0, 1], [0, 0]]) for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      const r = top ? i : rows - 1 - i, c = left ? j : cols - 1 - j, k = r * cols + c;
      role[k] = ROLE_FIXED; dark[k] = i < 7 && j < 7 && finderDark(i, j) ? 1 : 0;
    }
    // 时钟线
    for (let c = 8; c <= cols - 9; c++) for (const r of [3, rows - 4]) { role[r * cols + c] = ROLE_FIXED; dark[r * cols + c] = (c & 1) ? 0 : 1; }
    for (let r = 8; r <= rows - 9; r++) for (const c of [3, cols - 4]) { role[r * cols + c] = ROLE_FIXED; dark[r * cols + c] = (r & 1) ? 0 : 1; }
    // 导频：pil[k*3+ch] = 色阶下标；pilA 标记 A 类
    const pil = new Uint8Array(N * 3), pilA = new Uint8Array(N);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const k = r * cols + c;
      if (role[k] !== ROLE_DATA || !isPilotPos(r, c)) continue;
      role[k] = ROLE_PILOT;
      const a = (((r >> 2) + (c >> 2)) & 1) === 0; pilA[k] = a ? 1 : 0;
      for (let ch = 0; ch < 3; ch++) { const h = hash3(r, c, ch), Lc = levels[ch]; pil[k * 3 + ch] = a ? ((h & 1) ? Lc - 1 : 0) : h % Lc; }
    }
    // 元信息：数据格按行扫描的最前 / 最后 META_CELLS 个
    const free = []; for (let k = 0; k < N; k++) if (role[k] === ROLE_DATA) free.push(k);
    const meta = [Int32Array.from(free.slice(0, META_CELLS)), Int32Array.from(free.slice(-META_CELLS))];
    for (const m of meta) for (const k of m) role[k] = ROLE_META;
    // 分块：数据格按希尔伯特曲线排序后等分成 T 组——每组格数相同（不浪费），且空间上紧凑（混帧/局部模糊只坏少数几组）
    let n2 = 1; while (n2 < Math.max(cols, rows)) n2 <<= 1;
    const order = [];
    for (let d = 0; d < n2 * n2; d++) {
      let t = d, x = 0, y = 0;
      for (let sq = 1; sq < n2; sq <<= 1) {
        const rx = 1 & (t >> 1), ry = 1 & (t ^ rx);
        if (!ry) { if (rx) { x = sq - 1 - x; y = sq - 1 - y; } const tmp = x; x = y; y = tmp; }
        x += sq * rx; y += sq * ry; t >>= 2;
      }
      if (x < cols && y < rows && role[y * cols + x] === ROLE_DATA) order.push(y * cols + x);
    }
    const T = Math.max(1, Math.round(order.length / Math.max(64, tile * tile * 0.8))), per = Math.floor(order.length / T);
    const rate = RATES[rateIdx];
    const C = ((Math.floor(per * bpc * rate) - (fec === 'conv' ? 6 : 0) - 64) >> 3) & ~3;
    if (C < 16) throw new Error('数据块太小');
    const nInfo = 64 + C * 8;
    const tiles = [];
    for (let i = 0; i < T; i++) {
      const cells = Int32Array.from(order.slice(i * per, (i + 1) * per));
      let r0 = rows, r1 = 0, c0 = cols, c1 = 0;
      for (const k of cells) { const r = (k / cols) | 0, c = k % cols; r0 = Math.min(r0, r); r1 = Math.max(r1, r + 1); c0 = Math.min(c0, c); c1 = Math.max(c1, c + 1); }
      tiles.push({ cells, r0, r1, c0, c1 });
    }
    for (let i = T * per; i < order.length; i++) role[order[i]] = ROLE_PAD;
    // 每块的校色邻域：块外扩半个块
    const pilotsNear = (r0, r1, c0, c1, onlyA) => {
      const out = [];
      for (let r = Math.max(0, r0); r < Math.min(rows, r1); r++) for (let c = Math.max(0, c0); c < Math.min(cols, c1); c++) {
        const k = r * cols + c; if (role[k] === ROLE_PILOT && (!onlyA || pilA[k])) out.push(k);
      }
      return Int32Array.from(out);
    };
    const ext = Math.ceil(tile / 3);
    for (const t of tiles) t.pilots = pilotsNear(t.r0 - ext, t.r1 + ext, t.c0 - ext, t.c1 + ext, false);
    const metaPilots = meta.map(m => {
      let r0 = rows, r1 = 0; for (const k of m) { const r = (k / cols) | 0; r0 = Math.min(r0, r); r1 = Math.max(r1, r + 1); }
      return pilotsNear(r0 - 4, r1 + 4, 0, cols, true);
    });
    L = { cols, rows, N, levels, rateIdx, rate, tile, fec, chBits, bpc, role, dark, pil, pilA, meta, metaPilots, tiles, T: tiles.length, C, nInfo, key };
    layoutCache.set(key, L);
    return L;
  }

  /* ================= 发送端：画帧 ================= */
  const SID_RE = /^[0-9A-Z]{4}$/;
  function packMeta(L, s) {
    const b = new Uint8Array(META_BYTES), dv = new DataView(b.buffer);
    b[0] = 0x55;
    for (let i = 0; i < 4; i++) b[1 + i] = s.sid.charCodeAt(i);
    b[5] = s.K >>> 16; b[6] = (s.K >>> 8) & 255; b[7] = s.K & 255;
    dv.setUint32(8, s.len); dv.setUint32(12, parseInt(s.crc, 16)); dv.setUint16(16, s.C);
    b[18] = L.cols; b[19] = L.rows;
    b[20] = (L.levels[0] === 4 ? 1 : 0) | (L.levels[1] === 4 ? 2 : 0) | (L.levels[2] === 4 ? 4 : 0) | (L.rateIdx << 3) | (L.fec === 'ldpc' ? 64 : 0);
    b[21] = L.tile;
    const all = new Uint8Array(META_BYTES + 4); all.set(b); new DataView(all.buffer).setUint32(META_BYTES, crc32n(b));
    return all;
  }
  function unpackMeta(u8) {
    const b = u8.subarray(0, META_BYTES), dv = new DataView(u8.buffer, u8.byteOffset, u8.length);
    if (b[0] !== 0x55 || dv.getUint32(META_BYTES) !== crc32n(b)) return null;
    const sid = String.fromCharCode(b[1], b[2], b[3], b[4]);
    if (!SID_RE.test(sid)) return null;
    return { sid, K: (b[5] << 16) | (b[6] << 8) | b[7], len: dv.getUint32(8), crc: dv.getUint32(12).toString(16).toUpperCase().padStart(8, '0'),
      C: dv.getUint16(16), cols: b[18], rows: b[19], levels: [b[20] & 1 ? 4 : 2, b[20] & 2 ? 4 : 2, b[20] & 4 ? 4 : 2], rate: (b[20] >> 3) & 7, fec: b[20] & 64 ? 'ldpc' : 'conv', tile: b[21] };
  }
  const sidBytes = sid => Uint8Array.from(sid, ch => ch.charCodeAt(0));
  function tileInfoBits(L, sid, seq, payload) {
    const bytes = new Uint8Array(8 + L.C); const dv = new DataView(bytes.buffer);
    dv.setUint32(0, seq >>> 0); bytes.set(payload, 4);
    const ck = new Uint8Array(8 + L.C); ck.set(sidBytes(sid)); ck.set(bytes.subarray(0, 4 + L.C), 4);
    dv.setUint32(4 + L.C, crc32n(ck));
    const bits = new Uint8Array(L.nInfo); toBits(bytes, bits, 0); return bits;
  }
  /** 把 bpc*cells 个位按格写成色阶：rgb[k*3+ch] = 0..255 */
  function putCells(L, cells, bits, rgb) {
    let p = 0;
    for (let i = 0; i < cells.length; i++) {
      const k = cells[i];
      for (let ch = 0; ch < 3; ch++) {
        const lv = L.levels[ch];
        let g = bits[p++]; if (lv === 4) g = (g << 1) | bits[p++];
        const l = lv === 4 ? g ^ (g >> 1) : g;
        rgb[k * 3 + ch] = LEVELS[lv][l];
      }
    }
  }
  function putMeta(L, cells, bits, rgb) {
    let p = 0;
    for (let i = 0; i < cells.length; i++) for (let ch = 0; ch < 3; ch++) rgb[cells[i] * 3 + ch] = bits[p++] ? 255 : 0;
  }

  /** 发送端：按会话 + 版面生成每一帧。session 需要 {sid,K,len,crc,C,payload(seq)} */
  class GridFramer {
    constructor(session, layout) {
      const L = layout;
      if (session.C !== L.C) throw new Error('会话分块大小与版面不符');
      this.s = session; this.L = L;
      const base = new Uint8Array(L.N * 3);
      for (let k = 0; k < L.N; k++) {
        const r = (k / L.cols) | 0, c = k % L.cols;
        if (L.role[k] === ROLE_FIXED) base.fill(L.dark[k] ? 0 : 255, k * 3, k * 3 + 3);
        else if (L.role[k] === ROLE_PILOT) for (let ch = 0; ch < 3; ch++) base[k * 3 + ch] = LEVELS[L.levels[ch]][L.pil[k * 3 + ch]];
        else if (L.role[k] === ROLE_PAD) for (let ch = 0; ch < 3; ch++) base[k * 3 + ch] = (hash3(r, c, ch + 7) & 1) ? 255 : 0;
      }
      const mbits = codeBits((() => { const b = new Uint8Array(META_INFO); toBits(packMeta(L, session), b, 0); return b; })(), META_CELLS * 3, 1000);
      for (const m of L.meta) putMeta(L, m, mbits, base);
      this.base = base;
    }
    get per() { return this.L.T; }
    /** seqs（长度 = 块数）→ 每格 RGB */
    cells(seqs) {
      const L = this.L, rgb = this.base.slice();
      L.tiles.forEach((t, j) => {
        const info = tileInfoBits(L, this.s.sid, seqs[j], this.s.payload(seqs[j]));
        const n = t.cells.length * L.bpc;
        putCells(L, t.cells, L.fec === 'ldpc' ? codeBitsLdpc(info, n, j + 1) : codeBits(info, n, j + 1), rgb);
      });
      return rgb;
    }
    /** → {w, h, data: RGBA}，1 像素 = 1 格，四周 QUIET 格白边 */
    paint(seqs, out) {
      const L = this.L, rgb = this.cells(seqs), W = L.cols + QUIET * 2, H = L.rows + QUIET * 2;
      const d = out && out.length === W * H * 4 ? out : new Uint8ClampedArray(W * H * 4);
      d.fill(255);
      for (let r = 0; r < L.rows; r++) for (let c = 0; c < L.cols; c++) {
        const k = r * L.cols + c, o = ((r + QUIET) * W + c + QUIET) * 4;
        d[o] = rgb[k * 3]; d[o + 1] = rgb[k * 3 + 1]; d[o + 2] = rgb[k * 3 + 2];
      }
      return { w: W, h: H, data: d };
    }
  }

  /* ================= 接收端 ================= */
  function luma(px, w, h, Y) {
    const n = w * h; if (!Y || Y.length !== n) Y = new Uint8Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) Y[i] = (px[j] + 2 * px[j + 1] + px[j + 2]) >> 2;
    return Y;
  }
  /** 自适应二值化：局部均值 0.9 倍以下为深（1） */
  function binarize(Y, w, h, buf) {
    const W1 = w + 1, I = buf && buf.I && buf.I.length === W1 * (h + 1) ? buf.I : new Uint32Array(W1 * (h + 1));
    for (let y = 0; y < h; y++) { let s = 0; for (let x = 0; x < w; x++) { s += Y[y * w + x]; I[(y + 1) * W1 + x + 1] = I[y * W1 + x + 1] + s; } }
    const B = buf && buf.B && buf.B.length === w * h ? buf.B : new Uint8Array(w * h), R = Math.max(8, Math.round(Math.min(w, h) / 10));
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - R), y1 = Math.min(h, y + R + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - R), x1 = Math.min(w, x + R + 1);
        const sum = I[y1 * W1 + x1] - I[y0 * W1 + x1] - I[y1 * W1 + x0] + I[y0 * W1 + x0];
        B[y * w + x] = Y[y * w + x] * (x1 - x0) * (y1 - y0) * 10 < sum * 9 ? 1 : 0;
      }
    }
    return { I, B };
  }
  /** 沿 (dx,dy) 方向过 (x0,y0) 检查 1:1:3:1:1（两侧还要有浅色隔离）；返回 {c: 该方向上的中心坐标, m: 模块像素} 或 null */
  function crossCheck(B, w, h, x0, y0, m, dx, dy) {
    const x = Math.round(x0), y = Math.round(y0);
    const at = (i, j) => (i < 0 || j < 0 || i >= w || j >= h) ? -1 : B[j * w + i];
    if (at(x, y) !== 1) return null;
    const lim = Math.ceil(m * 5) + 2;
    const walk = sgn => {               // 从中心往一侧数：深（中心）、浅环、深环、浅（隔离带）
      let i = x, j = y; const seg = [0, 0, 0, 0];
      for (let s = 0; s < 4; s++) {
        const want = (s & 1) ? 0 : 1;
        while (seg[s] < lim && at(i, j) === want) { seg[s]++; i += sgn * dx; j += sgn * dy; }
        if (!seg[s] || (s < 3 && seg[s] >= lim)) return null;
      }
      return seg;
    };
    const a = walk(-1), b = a && walk(1); if (!b) return null;
    const center = a[0] + b[0] - 1, tot = a[1] + a[2] + center + b[1] + b[2], mm = tot / 7, v = mm * 0.75;
    if (Math.abs(a[1] - mm) > v || Math.abs(a[2] - mm) > v || Math.abs(b[1] - mm) > v || Math.abs(b[2] - mm) > v || Math.abs(center - 3 * mm) > 3 * v) return null;
    if (a[3] < mm * 0.4 || b[3] < mm * 0.4) return null;
    const off = (b[0] - a[0]) / 2;
    return { c: dx ? x + off * dx : y + off * dy, m: mm };
  }
  function findFinders(B, w, h) {
    const cands = [], rl = new Int32Array(w + 2), rs = new Int32Array(w + 2);
    for (let y = 0; y < h; y++) {
      const row = y * w; let n = 0, cur = B[row], st = 0;
      for (let x = 1; x <= w; x++) { const v = x < w ? B[row + x] : 2; if (v !== cur) { rs[n] = st; rl[n] = x - st; n++; st = x; cur = v; } }
      const first = B[row];
      for (let i = (first ? 1 : 0); i + 6 < n; i += 2) {
        const a = rl[i + 1], b = rl[i + 2], c = rl[i + 3], d = rl[i + 4], e = rl[i + 5], tot = a + b + c + d + e;
        if (tot < 14) continue;
        const m = tot / 7, v = m * 0.7;
        if (Math.abs(a - m) > v || Math.abs(b - m) > v || Math.abs(d - m) > v || Math.abs(e - m) > v || Math.abs(c - 3 * m) > 3 * v) continue;
        if (rl[i] < 0.4 * m || rl[i + 6] < 0.4 * m) continue;
        const cx = rs[i + 3] + c / 2 - 0.5;
        const vv = crossCheck(B, w, h, cx, y, m, 0, 1); if (!vv) continue;
        const hh = crossCheck(B, w, h, cx, vv.c, m, 1, 0); if (!hh) continue;
        const dd = crossCheck(B, w, h, hh.c, vv.c, m, 1, 1); if (!dd) continue;
        const mm = (m + vv.m + hh.m) / 3;
        let hit = null;
        for (const q of cands) if (Math.abs(q.x - hh.c) < q.m * 1.5 && Math.abs(q.y - vv.c) < q.m * 1.5) { hit = q; break; }
        if (hit) { const n1 = hit.n + 1; hit.x = (hit.x * hit.n + hh.c) / n1; hit.y = (hit.y * hit.n + vv.c) / n1; hit.m = (hit.m * hit.n + mm) / n1; hit.n = n1; }
        else cands.push({ x: hh.c, y: vv.c, m: mm, n: 1 });
      }
    }
    return cands;
  }
  /** 从候选里挑四个组成凸四边形（模块大小一致、面积最大），按图像中顺时针排序 */
  function pickQuads(cands, maxQuads = 3) {
    const top = cands.filter(c => c.n >= 2).sort((a, b) => b.n - a.n).slice(0, 9), quads = [];
    const n = top.length;
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) for (let d = c + 1; d < n; d++) {
      const q = [top[a], top[b], top[c], top[d]];
      const ms = q.map(p => p.m); if (Math.max(...ms) > 2.2 * Math.min(...ms)) continue;
      const cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4, cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4;
      q.sort((p1, p2) => Math.atan2(p1.y - cy, p1.x - cx) - Math.atan2(p2.y - cy, p2.x - cx));
      let area = 0, convex = true, minSide = Infinity;
      for (let i = 0; i < 4; i++) {
        const p0 = q[i], p1 = q[(i + 1) & 3], p2 = q[(i + 2) & 3];
        area += p0.x * p1.y - p1.x * p0.y;
        if ((p1.x - p0.x) * (p2.y - p1.y) - (p1.y - p0.y) * (p2.x - p1.x) <= 0) convex = false;
        minSide = Math.min(minSide, Math.hypot(p1.x - p0.x, p1.y - p0.y));
      }
      const mAvg = (ms[0] + ms[1] + ms[2] + ms[3]) / 4;
      if (!convex || minSide < 14 * mAvg) continue;
      quads.push({ q, area: area / 2, m: mAvg });
    }
    return quads.sort((x, y) => y.area - x.area).slice(0, maxQuads);
  }
  function sampleY(Y, w, h, x, y) {
    if (x < 0) x = 0; if (y < 0) y = 0; if (x > w - 1.001) x = w - 1.001; if (y > h - 1.001) y = h - 1.001;
    const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * w + x0;
    return (Y[i] * (1 - fx) + Y[i + 1] * fx) * (1 - fy) + (Y[i + w] * (1 - fx) + Y[i + w + 1] * fx) * fy;
  }
  /** 定位块中心 a → b 的时钟线：返回 {count: 格数, pts: [[格坐标, x, y]]} 或 null */
  function readEdge(Y, w, h, a, b, m) {
    const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy), step = Math.max(0.4, m / 5), n = Math.ceil(dist / step) + 1;
    const p = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / (n - 1); p[i] = sampleY(Y, w, h, a.x + dx * t, a.y + dy * t); }
    const win = Math.max(2, Math.round(1.6 * m / step)), thr = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let mn = 255, mx = 0;
      for (let j = Math.max(0, i - win); j <= Math.min(n - 1, i + win); j++) { if (p[j] < mn) mn = p[j]; if (p[j] > mx) mx = p[j]; }
      thr[i] = mx - mn < 14 ? -1 : (mn + mx) / 2;
    }
    // 分段（边界做线性插值），太短的段并入邻居
    const bnd = [0], col = [p[0] < thr[0] ? 1 : 0];
    for (let i = 1; i < n; i++) {
      const d = thr[i] < 0 ? col[col.length - 1] : (p[i] < thr[i] ? 1 : 0);
      if (d !== col[col.length - 1]) {
        const t0 = thr[i], f = (p[i - 1] - p[i]) !== 0 ? (p[i - 1] - t0) / (p[i - 1] - p[i]) : 0.5;
        bnd.push(i - 1 + Math.min(1, Math.max(0, f))); col.push(d);
      }
    }
    bnd.push(n - 1);
    const minLen = (m / step) * 0.35;
    for (;;) {
      let k = -1, best = minLen;
      for (let i = 0; i < col.length; i++) { const len = bnd[i + 1] - bnd[i]; if (len < best) { best = len; k = i; } }
      if (k < 0 || col.length < 3) break;
      if (k === 0) { bnd.splice(1, 1); col.splice(0, 1); }
      else if (k === col.length - 1) { bnd.splice(k, 1); col.splice(k, 1); }
      else { bnd.splice(k, 2); col.splice(k, 2); }
    }
    const R = col.length;
    if (R < 23 || !(R & 1) || !col[0] || !col[R - 1]) return null;
    const lens = []; for (let i = 1; i < R - 1; i++) lens.push(bnd[i + 1] - bnd[i]);
    const med = lens.slice().sort((x, y) => x - y)[lens.length >> 1];
    for (const l of lens) if (l < med * 0.45 || l > med * 1.8) return null;
    const pts = [];
    for (let i = 1; i < R - 1; i++) { const t = (bnd[i] + bnd[i + 1]) / 2 / (n - 1); pts.push([4 + i + 0.5, a.x + dx * t, a.y + dy * t]); }
    return { count: R + 8, pts };
  }
  /** 最小二乘单应：src[i]=[u,v] → dst[i]=[x,y]（先各自归一化） */
  function fitHomography(src, dst) {
    const n = src.length, norm = P => {
      let mx = 0, my = 0; for (const [x, y] of P) { mx += x; my += y; } mx /= n; my /= n;
      let d = 0; for (const [x, y] of P) d += Math.hypot(x - mx, y - my); const s = Math.SQRT2 / (d / n || 1);
      return { mx, my, s };
    };
    const ns = norm(src), nd = norm(dst), A = new Float64Array(64), bv = new Float64Array(8), row = new Float64Array(8);
    const acc = (r, val) => { for (let i = 0; i < 8; i++) { bv[i] += r[i] * val; for (let j = 0; j < 8; j++) A[i * 8 + j] += r[i] * r[j]; } };
    for (let i = 0; i < n; i++) {
      const u = (src[i][0] - ns.mx) * ns.s, v = (src[i][1] - ns.my) * ns.s, x = (dst[i][0] - nd.mx) * nd.s, y = (dst[i][1] - nd.my) * nd.s;
      row.set([u, v, 1, 0, 0, 0, -u * x, -v * x]); acc(row, x);
      row.set([0, 0, 0, u, v, 1, -u * y, -v * y]); acc(row, y);
    }
    const hv = solve(A, bv, 8); if (!hv) return null;
    const [h0, h1, h2, h3, h4, h5, h6, h7] = hv;
    return (u, v) => {
      const uu = (u - ns.mx) * ns.s, vv = (v - ns.my) * ns.s, ww = h6 * uu + h7 * vv + 1;
      return [((h0 * uu + h1 * vv + h2) / ww) / nd.s + nd.mx, ((h3 * uu + h4 * vv + h5) / ww) / nd.s + nd.my];
    };
  }
  function solve(A, b, n) {
    const M = Array.from({ length: n }, (_, i) => [...A.slice(i * n, i * n + n), b[i]]);
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-12) return null;
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
    }
    return M.map((r, i) => r[n] / r[i]);
  }
  /** 采样每个需要的格子：5 点平均（中心 + 四个 ±0.2 格），返回 Float32Array(N*3)，未采样的为 NaN */
  function sampleCells(px, w, h, H, cols, list, out) {
    const o = 0.2;
    for (const k of list) {
      const r = (k / cols) | 0, c = k % cols;
      let R = 0, G = 0, Bv = 0;
      for (const [du, dv] of [[0, 0], [-o, -o], [o, -o], [-o, o], [o, o]]) {
        let [x, y] = H(c + 0.5 + du, r + 0.5 + dv);
        if (x < 0) x = 0; if (y < 0) y = 0; if (x > w - 1.001) x = w - 1.001; if (y > h - 1.001) y = h - 1.001;
        const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = (y0 * w + x0) * 4, j = i + w * 4;
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
        R += px[i] * w00 + px[i + 4] * w10 + px[j] * w01 + px[j + 4] * w11;
        G += px[i + 1] * w00 + px[i + 5] * w10 + px[j + 1] * w01 + px[j + 5] * w11;
        Bv += px[i + 2] * w00 + px[i + 6] * w10 + px[j + 2] * w01 + px[j + 6] * w11;
      }
      out[k * 3] = R / 5; out[k * 3 + 1] = G / 5; out[k * 3 + 2] = Bv / 5;
    }
  }
  /** 用导频拟合每个通道：t = a·R + b·G + c·B + d（t = 色阶/(级数-1)），再算各级中心与噪声方差 */
  function calibrate(L, obs, pilots) {
    if (pilots.length < 10) return null;
    const res = [];
    for (let ch = 0; ch < 3; ch++) {
      const Lc = L.levels[ch], top = Lc - 1, A = new Float64Array(16), b = new Float64Array(4);
      for (const k of pilots) {
        const x0 = obs[k * 3] / 255, x1 = obs[k * 3 + 1] / 255, x2 = obs[k * 3 + 2] / 255, t = L.pil[k * 3 + ch] / top, x = [x0, x1, x2, 1];
        for (let i = 0; i < 4; i++) { b[i] += x[i] * t; for (let j = 0; j < 4; j++) A[i * 4 + j] += x[i] * x[j]; }
      }
      for (let i = 0; i < 3; i++) A[i * 5] += 1e-3;   // 轻微正则：某通道导频全一样时也能解
      const co = solve(A, b, 4); if (!co) return null;
      const map = k => co[0] * obs[k * 3] / 255 + co[1] * obs[k * 3 + 1] / 255 + co[2] * obs[k * 3 + 2] / 255 + co[3];
      const sum = new Float64Array(Lc), cnt = new Float64Array(Lc);
      for (const k of pilots) { const l = L.pil[k * 3 + ch]; sum[l] += map(k); cnt[l]++; }
      const mu = new Float64Array(Lc);
      for (let l = 0; l < Lc; l++) mu[l] = cnt[l] >= 2 ? sum[l] / cnt[l] : l / top;
      let se = 0;
      for (const k of pilots) { const d = map(k) - mu[L.pil[k * 3 + ch]]; se += d * d; }
      const sp = Math.abs(mu[top] - mu[0]) / top;
      res.push({ co, mu, s2: Math.max(se / pilots.length, (sp * 0.06) ** 2) });
    }
    return res;
  }
  /** 一组格子 → 按 putCells 顺序的 LLR（正 = 0） */
  function cellLLR(cal, obs, cells, levels, out) {
    let p = 0;
    for (let i = 0; i < cells.length; i++) {
      const k = cells[i], R = obs[k * 3] / 255, G = obs[k * 3 + 1] / 255, Bv = obs[k * 3 + 2] / 255;
      for (let ch = 0; ch < 3; ch++) {
        const c = cal[ch], x = c.co[0] * R + c.co[1] * G + c.co[2] * Bv + c.co[3], mu = c.mu, k2 = 1 / (2 * c.s2);
        if (levels[ch] === 2) {
          const d0 = (x - mu[0]) ** 2, d1 = (x - mu[1]) ** 2;
          out[p++] = Math.max(-12, Math.min(12, (d1 - d0) * k2));
        } else {
          // 格雷码：级 0..3 → 00,01,11,10；位 0 = 高位，位 1 = 低位
          const d = [0, 1, 2, 3].map(l => (x - mu[l]) ** 2 * k2);
          const b0 = Math.min(d[2], d[3]) - Math.min(d[0], d[1]), b1 = Math.min(d[1], d[2]) - Math.min(d[0], d[3]);
          out[p++] = Math.max(-12, Math.min(12, b0)); out[p++] = Math.max(-12, Math.min(12, b1));
        }
      }
    }
    return out;
  }

  /** 读一张摄像头画面。返回 {ok, meta?, frames: [{sid,K,len,crc,C,seq,payload}], tiles, okTiles, reason} */
  const scratch = {};
  /** 按单应预测时钟格位置，在附近找明暗极值，返回 [[u,v,x,y]]（几何精修用，不依赖数格数） */
  function refineEdge(Y, w, h, H, fixedV, from, to, horiz) {
    const pts = [];
    for (let c = from; c <= to; c++) {
      const u = c + 0.5, dark = (c & 1) === 0;
      const [x0, y0] = horiz ? H(u, fixedV) : H(fixedV, u), [x1, y1] = horiz ? H(u + 1, fixedV) : H(fixedV, u + 1);
      const dx = x1 - x0, dy = y1 - y0;
      let best = 0, bv = dark ? 1e9 : -1e9;
      const vals = [];
      for (let i = -4; i <= 4; i++) {          // ±0.4 格内找极值
        const t = i / 10, v = sampleY(Y, w, h, x0 + dx * t, y0 + dy * t); vals.push(v);
        if (dark ? v < bv : v > bv) { bv = v; best = i; }
      }
      const k = best + 4;
      if (k === 0 || k === 8) continue;           // 极值在边上：不可靠
      const a = vals[k - 1], b = vals[k], cc = vals[k + 1], den = a - 2 * b + cc;
      const off = (Math.abs(den) > 1e-6 ? 0.5 * (a - cc) / den : 0) + best;   // 抛物线插值
      const t = off / 10;
      pts.push(horiz ? [u, fixedV, x0 + dx * t, y0 + dy * t] : [fixedV, u, x0 + dx * t, y0 + dy * t]);
    }
    return pts;
  }
  /** 用 A 类导频判断方向是否对：返回校色残差（越小越像） */
  function pilotScore(px, w, h, H, cols, rows) {
    let L0; try { L0 = makeLayout({ cols, rows, levels: [2, 2, 2], rate: 2, tile: 24 }); } catch (e) { return 1e9; }
    const list = []; for (let k = 0; k < L0.N; k++) if (L0.role[k] === ROLE_PILOT && L0.pilA[k]) list.push(k);
    const obs = new Float32Array(L0.N * 3); sampleCells(px, w, h, H, cols, list, obs);
    const cal = calibrate(L0, obs, list); if (!cal) return 1e9;
    let sc = 0; for (const c of cal) sc += c.s2 / Math.max(1e-4, (c.mu[1] - c.mu[0]) ** 2);
    return sc / 3;
  }
  /** 读一张摄像头画面。hint = 之前读到的元信息（同一会话固定不变；单张读不出元信息时用它） */
  function readFrame(px, w, h, hint) {
    const Y = scratch.Y = luma(px, w, h, scratch.Y);
    // 上一帧定位块单格 ≥ 8 像素时，在半分辨率上找定位块（像素少 3/4）；格子小时用全分辨率，免得找不到。时钟线和采样总用全分辨率
    let cands;
    if (scratch.lastM >= 8) {
      const w2 = w >> 1, h2 = h >> 1, Yh = scratch.Yh && scratch.Yh.length === w2 * h2 ? scratch.Yh : (scratch.Yh = new Uint8Array(w2 * h2));
      for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) { const i = 2 * y * w + 2 * x; Yh[y * w2 + x] = (Y[i] + Y[i + 1] + Y[i + w] + Y[i + w + 1] + 2) >> 2; }
      const bz = binarize(Yh, w2, h2, scratch.bz); scratch.bz = bz;
      cands = findFinders(bz.B, w2, h2).map(c => ({ x: c.x * 2 + 0.5, y: c.y * 2 + 0.5, m: c.m * 2, n: c.n }));
    } else {
      const bz = binarize(Y, w, h, scratch.bz); scratch.bz = bz;
      cands = findFinders(bz.B, w, h);
    }
    const quads = pickQuads(cands);
    if (!quads.length) { scratch.lastM = 0; return { ok: false, reason: `定位块 ${cands.filter(c => c.n >= 2).length}/4`, frames: [] }; }
    let stage = '时钟线';
    for (const { q, m } of quads) {
      const opts = [];
      for (let rot = 0; rot < 4; rot++) {
        const TL = q[rot], TR = q[(rot + 1) & 3], BR = q[(rot + 2) & 3], BL = q[(rot + 3) & 3];
        const top = readEdge(Y, w, h, TL, TR, m), bot = readEdge(Y, w, h, BL, BR, m), left = readEdge(Y, w, h, TL, BL, m), right = readEdge(Y, w, h, TR, BR, m);
        const pick = (a, b, hv) => a && b ? (a.count === b.count ? a.count : 0) : a ? a.count : b ? b.count : hv || 0;
        const cols = pick(top, bot, hint && hint.cols), rows = pick(left, right, hint && hint.rows);
        if (!cols || !rows) continue;
        const src = [[3.5, 3.5], [cols - 3.5, 3.5], [cols - 3.5, rows - 3.5], [3.5, rows - 3.5]], dst = [[TL.x, TL.y], [TR.x, TR.y], [BR.x, BR.y], [BL.x, BL.y]];
        if (top && top.count === cols) for (const [u, x, y] of top.pts) { src.push([u, 3.5]); dst.push([x, y]); }
        if (bot && bot.count === cols) for (const [u, x, y] of bot.pts) { src.push([u, rows - 3.5]); dst.push([x, y]); }
        if (left && left.count === rows) for (const [v, x, y] of left.pts) { src.push([3.5, v]); dst.push([x, y]); }
        if (right && right.count === rows) for (const [v, x, y] of right.pts) { src.push([cols - 3.5, v]); dst.push([x, y]); }
        let H = fitHomography(src, dst); if (!H) continue;
        // 精修：在预测位置附近找每个时钟格的明暗中心（读不出格数的边也能用上）
        const s2 = [[3.5, 3.5], [cols - 3.5, 3.5], [cols - 3.5, rows - 3.5], [3.5, rows - 3.5]], d2 = dst.slice(0, 4);
        for (const p of [...refineEdge(Y, w, h, H, 3.5, 8, cols - 9, true), ...refineEdge(Y, w, h, H, rows - 3.5, 8, cols - 9, true),
          ...refineEdge(Y, w, h, H, 3.5, 8, rows - 9, false), ...refineEdge(Y, w, h, H, cols - 3.5, 8, rows - 9, false)]) { s2.push([p[0], p[1]]); d2.push([p[2], p[3]]); }
        H = fitHomography(s2, d2) || H;
        opts.push({ cols, rows, H, score: pilotScore(px, w, h, H, cols, rows) });
      }
      opts.sort((a, b) => a.score - b.score);
      for (const o of opts.slice(0, 2)) {
        stage = '元信息';
        const meta = readMeta(px, w, h, o.H, o.cols, o.rows);
        if (meta) { scratch.lastM = m; return readData(px, w, h, o.H, meta); }
        if (hint && hint.cols === o.cols && hint.rows === o.rows && o === opts[0] && (opts.length < 2 || opts[1].score > o.score * 2.5)) {
          scratch.lastM = m; const r = readData(px, w, h, o.H, hint); r.metaFromHint = true; return r;
        }
      }
    }
    return { ok: false, reason: stage, frames: [] };
  }
  function readMeta(px, w, h, H, cols, rows) {
    // 只用 A 类导频（色阶无关），先按 2/2/2 版面取导频位置——导频位置与色阶无关
    let L0;
    try { L0 = makeLayout({ cols, rows, levels: [2, 2, 2], rate: 2, tile: 24 }); } catch (e) { return null; }
    const obs = new Float32Array(L0.N * 3);
    for (let i = 0; i < 2; i++) {
      sampleCells(px, w, h, H, cols, L0.meta[i], obs); sampleCells(px, w, h, H, cols, L0.metaPilots[i], obs);
      const cal = calibrate(L0, obs, L0.metaPilots[i]); if (!cal) continue;
      const llr = cellLLR(cal, obs, L0.meta[i], [2, 2, 2], new Float32Array(META_CELLS * 3));
      const m = unpackMeta(fromBits(decodeBits(llr, META_INFO, 1000), 0, META_BYTES + 4));
      if (m && m.cols === cols && m.rows === rows) return m;
    }
    return null;
  }
  function readData(px, w, h, H, meta) {
    let L;
    try { L = makeLayout(meta); } catch (e) { return { ok: false, reason: '版面参数不支持', frames: [] }; }
    if (L.C !== meta.C) return { ok: false, reason: '版面不一致', frames: [] };
    const obs = scratch.obs && scratch.obs.length === L.N * 3 ? scratch.obs : (scratch.obs = new Float32Array(L.N * 3));
    const all = []; for (let k = 0; k < L.N; k++) if (L.role[k] === ROLE_DATA || L.role[k] === ROLE_PILOT) all.push(k);
    sampleCells(px, w, h, H, L.cols, all, obs);
    const frames = [], sb = sidBytes(meta.sid);
    let okTiles = 0;
    for (let j = 0; j < L.T; j++) {
      const t = L.tiles[j], cal = calibrate(L, obs, t.pilots); if (!cal) continue;
      const llr = cellLLR(cal, obs, t.cells, L.levels, new Float32Array(t.cells.length * L.bpc));
      const bits = L.fec === 'ldpc' ? decodeBitsLdpc(llr, L.nInfo, j + 1) : decodeBits(llr, L.nInfo, j + 1);
      if (!bits) continue;
      const bytes = fromBits(bits, 0, 8 + L.C), dv = new DataView(bytes.buffer);
      const ck = new Uint8Array(8 + L.C); ck.set(sb); ck.set(bytes.subarray(0, 4 + L.C), 4);
      if (crc32n(ck) !== dv.getUint32(4 + L.C)) continue;
      okTiles++;
      frames.push({ v: 5, sid: meta.sid, K: meta.K, len: meta.len, crc: meta.crc, C: L.C, seq: dv.getUint32(0), payload: bytes.slice(4, 4 + L.C) });
    }
    return { ok: true, meta, frames, tiles: L.T, okTiles };
  }

  /** 由「长边格数 + 宽高比 + 色阶 + 码率 + 块大小」得出版面参数（奇数格） */
  function profile({ long = 97, aspect = 1, levels = [2, 2, 2], rate = 2, tile = 24, fec = 'ldpc' }) {
    const odd = x => Math.max(31, Math.min(255, (Math.round(x) | 1)));
    const a = Math.max(1, aspect), cols = odd(long), rows = odd(long / a);
    return { cols, rows, levels, rate, tile, fec };
  }

  const api = { makeLayout, profile, GridFramer, readFrame, LEVELS, RATES, QUIET,
    _: { convEncode, viterbi, codeBits, decodeBits, ldpcCode, ldpcEncode, ldpcDecode, codeBitsLdpc, decodeBitsLdpc, luma, binarize, findFinders, pickQuads, readEdge, fitHomography, unpackMeta, packMeta } };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QXG = api;
})(typeof self !== 'undefined' ? self : this);
