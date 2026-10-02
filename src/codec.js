/* QX4 协议编解码（收发两端共用）。浏览器里挂到 self.QX，Node 测试里 require。
 * 帧：QX4:<SID>:<K>:<LEN>:<CRC32>:<SEQ>:<FCK32>:<BASE45载荷>*
 *   SEQ < K  ：系统帧（第 SEQ 个源块）
 *   SEQ >= K ：冗余帧 = rowBits(SID,SEQ,K) 选中的源块逐字节 XOR（GF(2) 随机线性喷泉码，每位 1/2）
 *   FCK32 = 载荷 CRC32（8 位 hex）
 * 数据包：[4字节 meta长度 BE][meta JSON][数据]，补 0 到 K*C
 */
(function (root) {
  'use strict';

  const B45 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
  const B45V = new Int16Array(128).fill(-1);
  for (let i = 0; i < 45; i++) B45V[B45.charCodeAt(i)] = i;

  function b45enc(u8) {
    const out = new Array(Math.ceil(u8.length / 2));
    let o = 0;
    for (let i = 0; i + 1 < u8.length; i += 2) {
      const n = u8[i] * 256 + u8[i + 1];
      out[o++] = B45[n % 45] + B45[((n / 45) | 0) % 45] + B45[(n / 2025) | 0];
    }
    if (u8.length & 1) { const n = u8[u8.length - 1]; out[o++] = B45[n % 45] + B45[(n / 45) | 0]; }
    return out.join('');
  }

  // 只解偶数字节长度（3 字符 → 2 字节）；非法返回 null
  function b45dec(s) {
    if (s.length % 3) return null;
    const out = new Uint8Array(s.length / 3 * 2);
    for (let i = 0, o = 0; i < s.length; i += 3) {
      const a = B45V[s.charCodeAt(i)], b = B45V[s.charCodeAt(i + 1)], c = B45V[s.charCodeAt(i + 2)];
      if (a < 0 || b < 0 || c < 0) return null;
      const n = a + b * 45 + c * 2025;
      if (n > 65535) return null;
      out[o++] = n >> 8; out[o++] = n & 255;
    }
    return out;
  }

  const CRC_TABLE = (() => { const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t; })();
  function crc32n(u8) { let c = 0xFFFFFFFF;
    for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0; }
  const hex = (n, w) => n.toString(16).toUpperCase().padStart(w, '0');

  // 必须与发送端逐位一致
  function rowBits(sid, seq, K) {
    let h = 2166136261;
    const s = sid + ':' + seq;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    let a = h | 0;
    const W = (K + 31) >>> 5, bits = new Uint32Array(W);
    for (let w = 0; w < W; w++) {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      bits[w] = (t ^ (t >>> 14)) >>> 0;
    }
    if (K & 31) bits[W - 1] &= (1 << (K & 31)) - 1;
    let any = 0; for (let w = 0; w < W; w++) any |= bits[w];
    if (!any) { const c = seq % K; bits[c >>> 5] |= 1 << (c & 31); }
    return bits;
  }

  /** 解析一帧文本；失败返回 null。payload 为 Uint8Array（长度 = C） */
  function parseFrame(txt) {
    if (typeof txt !== 'string' || txt.charCodeAt(txt.length - 1) !== 42 /* * */) return null;
    const v = txt.startsWith('QX4:') ? 4 : txt.startsWith('QX3:') ? 3 : 0;   // 兼容旧版 v3 发送端（16 位 FCK）
    if (!v) return null;
    let p = 4; const f = [];
    for (let i = 0; i < 6; i++) { const q = txt.indexOf(':', p); if (q < 0) return null; f.push(txt.slice(p, q)); p = q + 1; }
    const [sid, K, LEN, CRC, SEQ, FCK] = f;
    if (!/^[0-9A-Z]{4}$/.test(sid) || !/^\d+$/.test(K) || !/^\d+$/.test(LEN) || !/^[0-9A-F]{8}$/.test(CRC)
      || !/^\d+$/.test(SEQ) || !(v === 4 ? /^[0-9A-F]{8}$/ : /^[0-9A-F]{4}$/).test(FCK)) return null;
    const payload = b45dec(txt.slice(p, -1));
    if (!payload || !payload.length || payload.length & 3) return null;
    const fc = crc32n(payload);
    if (v === 4 ? hex(fc, 8) !== FCK : hex(fc & 0xFFFF, 4) !== FCK) return null;   // v4 = 32 位帧校验
    const k = +K, len = +LEN, seq = +SEQ;
    if (k < 1 || len < 4 || Math.ceil(len / payload.length) !== k) return null;
    return { v, sid, K: k, len, crc: CRC, seq, payload, C: payload.length };
  }

  
  /**
   * GF(2) 增量高斯消元（行阶梯形，逐帧约简）+ 收齐后在 Worker 里回代。
   *  - piv[c] = 以第 c 列为最低位的主元行 {bits|null, data}；bits=null 表示单位行（该源块已知）
   *  - 新帧先用 knownMask 一次性剥离所有已知块（只 XOR 载荷），再按列从低到高约简
   *  - 实测比"常驻 RREF"总计算量少 2~3 倍；回代放在 Worker 里分段上报进度，界面不卡
   */
  class FountainDecoder {
    constructor(sid, K, C) {
      this.sid = sid; this.K = K; this.C = C;
      this.W = (K + 31) >>> 5; this.CW = C >>> 2;
      this.piv = new Array(K);
      this.knownMask = new Uint32Array(this.W);
      this.rank = 0; this.known = 0; this.solved = false;
      this.seen = new Set(); this.received = 0;
      this.newly = [];          // 本次 add 新确定的单位行 [列, 's'=源帧 | 'r'=冗余帧消元得到]
    }
    get done() { return this.rank === this.K; }
    isKnown(c) { return (this.knownMask[c >>> 5] >>> (c & 31)) & 1; }

    /** @returns 'dup' | 'useless' | 'useful' */
    add(seq, payload /* Uint8Array，长度 C */) {
      this.newly.length = 0;
      if (this.seen.has(seq)) return 'dup';
      this.seen.add(seq); this.received++;
      const { W, K, piv, knownMask } = this;
      if (this.done || (seq < K && this.isKnown(seq))) return 'useless';
      let bits;
      if (seq < K) { bits = new Uint32Array(W); bits[seq >>> 5] = 1 << (seq & 31); }
      else bits = rowBits(this.sid, seq, K);
      const data = new Uint32Array(payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.length));
      const CW = data.length;
      // 1) 剥离已知块
      for (let w = 0; w < W; w++) {
        let x = bits[w] & knownMask[w];
        if (!x) continue;
        bits[w] ^= x;
        while (x) {
          const b = 31 - Math.clz32(x & -x); x &= x - 1;
          const pd = piv[(w << 5) + b].data;
          for (let j = 0; j < CW; j++) data[j] ^= pd[j];
        }
      }
      // 2) 行阶梯约简
      for (let w = 0; w < W; w++) {
        let x;
        while ((x = bits[w]) !== 0) {
          const b = 31 - Math.clz32(x & -x), col = (w << 5) + b, p = piv[col];
          if (!p) {
            let unit = (x & (x - 1)) === 0;
            for (let j = w + 1; unit && j < W; j++) if (bits[j]) unit = false;
            piv[col] = { bits: unit ? null : bits, data };
            this.rank++;
            if (unit) { this.known++; knownMask[w] |= 1 << b; this.newly.push([col, seq === col ? 's' : 'r']); }
            return 'useful';
          }
          if (p.bits) for (let j = w; j < W; j++) bits[j] ^= p.bits[j];
          else bits[w] = x & (x - 1);
          const pd = p.data;
          for (let j = 0; j < CW; j++) data[j] ^= pd[j];
        }
      }
      return 'useless';
    }

    /** rank===K 后回代：从高列到低列。onProgress(已完成比例) 约每 2% 调一次 */
    solve(onProgress) {
      const { K, W, piv } = this;
      if (this.solved) return;
      let step = Math.max(1, (K / 50) | 0);
      for (let col = K - 1; col >= 0; col--) {
        const p = piv[col];
        if (p.bits) {
          const bits = p.bits, data = p.data, CW = data.length;
          bits[col >>> 5] &= ~(1 << (col & 31));
          for (let w = col >>> 5; w < W; w++) {
            let x = bits[w];
            while (x) {
              const b = 31 - Math.clz32(x & -x); x &= x - 1;
              const pd = piv[(w << 5) + b].data;
              for (let j = 0; j < CW; j++) data[j] ^= pd[j];
            }
          }
          p.bits = null;
        }
        if (onProgress && col % step === 0) onProgress(1 - col / K);
      }
      this.known = K; this.solved = true; this.knownMask.fill(0xFFFFFFFF);
    }

    /** 尚未确定的源块编号，压成 "3,7,10-12" */
    missingRanges(limit = 400) {
      const parts = []; let a = -1, n = 0;
      for (let j = 0; j <= this.K; j++) {
        const miss = j < this.K && !this.isKnown(j);
        if (miss && a < 0) a = j;
        if (!miss && a >= 0) { parts.push(a === j - 1 ? '' + a : a + '-' + (j - 1)); a = -1; if (++n >= limit) break; }
      }
      return parts.join(',');
    }

    /** 回代后拼出数据包 */
    packet(len) {
      const out = new Uint8Array(this.K * this.C);
      for (let i = 0; i < this.K; i++) out.set(new Uint8Array(this.piv[i].data.buffer), i * this.C);
      return out.subarray(0, len);
    }
  }

  const api = { B45, b45enc, b45dec, crc32n, hex, rowBits, parseFrame, FountainDecoder };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QX = api;
})(typeof self !== 'undefined' ? self : this);
