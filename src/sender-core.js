/* 发送端核心（油猴脚本和 PWA 共用）。依赖：全局 qrcode（qrcode-generator）、QX（codec.js）。 */
(function (root) {
  'use strict';
  const QX = root.QX || (typeof require === 'function' ? require('./codec.js') : null);
  const qrcodeLib = root.qrcode || (typeof require === 'function' ? require('qrcode-generator') : null);
  const { b45enc, crc32n, hex, rowBits } = QX;

  /* ---------- 输入预处理 ---------- */
  async function deflate(u8) {
    if (typeof CompressionStream === 'undefined') return null;
    const buf = await new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer();
    return new Uint8Array(buf);
  }
  /** opts: {file|null, text, compress} → {meta, data}。文件按原样发送（不改格式、不缩放）；compress=true 时尝试 deflate，省 ≥5% 才采用 */
  async function prepareInput(opts) {
    let meta, data;
    if (opts.file) {
      const f = opts.file;
      const mime = f.type || 'application/octet-stream', name = f.name || 'file.bin';
      data = new Uint8Array(await f.arrayBuffer());
      meta = { t: 'file', name, mime, z: false, len: data.length };
      if (opts.compress) {
        const zd = await deflate(data); if (zd && zd.length < data.length * 0.95) { data = zd; meta.z = true; }
      }
    } else {
      if (!opts.text) throw new Error('没有输入内容');
      data = new TextEncoder().encode(opts.text);
      meta = { t: 'text', name: 'text.txt', mime: 'text/plain;charset=utf-8', z: false, len: data.length };
      if (opts.compress) { const zd = await deflate(data); if (zd && zd.length < data.length) { data = zd; meta.z = true; } }
    }
    return { meta, data };
  }

  /* ---------- 会话：分块、喷泉码、QR 生成 ---------- */
  const MAX_SEQ_DIGITS = 7;   // 用 9999999 估算 QR 版本：整场播放 QR 尺寸固定，RGB 三层也必定对齐
  class SenderSession {
    constructor(meta, data, { chunk = 500, ecc = 'L' } = {}) {
      const mb = new TextEncoder().encode(JSON.stringify(meta));
      const len = 4 + mb.length + data.length;
      const C = Math.max(52, (chunk | 0) & ~3);                  // 4 的倍数，冗余帧按 32 位字 XOR
      const K = Math.ceil(len / C);
      if (K > 20000) throw new Error(`数据太大：K=${K} 超过 20000，请压缩或调大每帧字节`);
      const padded = new Uint8Array(K * C);
      new DataView(padded.buffer).setUint32(0, mb.length); padded.set(mb, 4); padded.set(data, 4 + mb.length);
      Object.assign(this, { meta, len, C, K, ecc, padded,
        crc: hex(crc32n(padded.subarray(0, len)), 8),
        sid: Array.from(crypto.getRandomValues(new Uint8Array(4)), b => '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'[b % 36]).join(''),
        blocks32: Array.from({ length: K }, (_, i) => new Uint32Array(padded.buffer, i * C, C >>> 2)) });
      // 固定 QR 版本
      const probe = qrcodeLib(0, ecc);
      probe.addData(this.frameText(0, '9'.repeat(MAX_SEQ_DIGITS)), 'Alphanumeric');
      try { probe.make(); } catch (e) { throw new Error(`每帧 ${C} 字节在纠错 ${ecc} 下装不进一个二维码，请调小每帧字节或降低纠错`); }
      this.type = (probe.getModuleCount() - 17) / 4;
    }
    payload(seq) {
      const { C, K } = this;
      if (seq < K) return this.padded.subarray(seq * C, (seq + 1) * C);
      const bits = rowBits(this.sid, seq, K), out = new Uint32Array(C >>> 2), W = bits.length;
      for (let w = 0; w < W; w++) {
        let x = bits[w];
        while (x) {
          const b = 31 - Math.clz32(x & -x); x &= x - 1;
          const src = this.blocks32[(w << 5) + b];
          for (let j = 0; j < out.length; j++) out[j] ^= src[j];
        }
      }
      return new Uint8Array(out.buffer);
    }
    frameText(seq, seqStr) {
      const p = this.payload(seq);
      return `QX4:${this.sid}:${this.K}:${this.len}:${this.crc}:${seqStr || seq}:${hex(crc32n(p), 8)}:${b45enc(p)}*`;
    }
    /** → {n, bits: Uint8Array(n*n)}，1 = 深色模块 */
    build(seq) {
      let qr;
      try { qr = qrcodeLib(this.type, this.ecc); qr.addData(this.frameText(seq), 'Alphanumeric'); qr.make(); }
      catch (e) { qr = qrcodeLib(0, this.ecc); qr.addData(this.frameText(seq), 'Alphanumeric'); qr.make(); }
      const n = qr.getModuleCount(), bits = new Uint8Array(n * n);
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) bits[r * n + c] = qr.isDark(r, c) ? 1 : 0;
      return { n, bits };
    }
  }

  /** 把 1 帧（黑白）或 3 帧（RGB）画进 RGBA 缓冲。返回边长 N（含 4 模块静区） */
  function paint(frames, rgba /* 可选，复用 */) {
    const n = frames[0].n, q = 4, N = n + q * 2;
    const d = rgba && rgba.length === N * N * 4 ? rgba : new Uint8ClampedArray(N * N * 4);
    d.fill(255);
    if (frames.length === 1) {
      const b = frames[0].bits;
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (b[r * n + c]) {
        const p = ((r + q) * N + c + q) * 4; d[p] = d[p + 1] = d[p + 2] = 0;
      }
    } else {
      // 每个通道各承载一个 QR：该通道"深"=0，"浅"=255
      for (let ch = 0; ch < 3; ch++) {
        const f = frames[ch]; if (!f || f.n !== n) continue;
        const b = f.bits;
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (b[r * n + c]) d[((r + q) * N + c + q) * 4 + ch] = 0;
      }
    }
    return { N, data: d };
  }

  /* ---------- 播放器 ---------- */
  class Player {
    /** canvas：显示用；opts.onShow(label)；opts.size() → 目标像素；opts.interval() → ms */
    constructor(canvas, opts) {
      this.cv = canvas; this.opts = opts;
      this.small = document.createElement('canvas'); this.sctx = this.small.getContext('2d');
      this.s = null; this.rgb = false; this.only = null; this.pos = 0;
      this.cache = new Map(); this.playing = false; this.raf = 0; this.last = 0; this.img = null;
      this._loop = this._loop.bind(this);
    }
    load(session, rgb) { this.stop(); this.s = session; this.rgb = !!rgb; this.only = null; this.pos = 0; this.cache.clear(); this.render(); }
    setRGB(rgb) { this.rgb = !!rgb; this.cache.clear(); this.render(); }
    setOnly(list) { this.only = list && list.length ? list : null; this.pos = 0; this.cache.clear(); this.render(); }
    get per() { return this.rgb ? 3 : 1; }
    seqAt(i) { const o = this.only; return o ? o[((i % o.length) + o.length) % o.length] : i; }
    seqsAt(p) { const a = []; for (let k = 0; k < this.per; k++) a.push(this.seqAt(p * this.per + k)); return a; }
    frame(seq) { let f = this.cache.get(seq); if (!f) { f = this.s.build(seq); this.cache.set(seq, f); } return f; }
    prefetch() {
      const want = new Set([...this.seqsAt(this.pos), ...this.seqsAt(this.pos + 1)]);
      for (const k of this.cache.keys()) if (!want.has(k)) this.cache.delete(k);
      const nx = this.seqsAt(this.pos + 1), p0 = this.pos;
      setTimeout(() => { if (this.s && this.pos === p0) for (const q of nx) if (!this.cache.has(q)) this.cache.set(q, this.s.build(q)); }, 0);
    }
    render() {
      if (!this.s) return;
      const seqs = this.seqsAt(this.pos);
      const { N, data } = paint(seqs.map(q => this.frame(q)), this.img && this.img.data);
      if (this.small.width !== N) { this.small.width = this.small.height = N; this.img = null; }
      if (!this.img || this.img.data !== data) this.img = new ImageData(data, N, N);
      this.sctx.putImageData(this.img, 0, 0);
      const want = this.opts.size ? this.opts.size() : 520;
      const cell = Math.max(1, Math.floor(want / N)), size = cell * N;     // 整数倍放大，边缘锐利
      if (this.cv.width !== size) { this.cv.width = size; this.cv.height = size; }
      const ctx = this.cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.small, 0, 0, size, size);
      const K = this.s.K, lab = q => q < K ? `源${q + 1}` : `冗${q - K + 1}`;
      let label;
      if (this.only) label = `补发 ${seqs.join(',')}（${(this.pos * this.per) % this.only.length + 1}/${this.only.length}）`;
      else if (this.per === 1) label = seqs[0] < K ? `源帧 ${seqs[0] + 1} / ${K}` : `冗余帧 #${seqs[0] - K + 1}`;
      else label = `RGB：${seqs.map(lab).join(' · ')}　（源 ${K} 块）`;
      if (this.opts.onShow) this.opts.onShow(label, seqs);
      this.prefetch();
    }
    step(d) {
      if (!this.s) return;
      this.pos = this.only ? this.pos + d : Math.max(0, this.pos + d);
      this.render();
    }
    restart() { this.pos = 0; this.render(); }
    _loop(now) {
      if (!this.playing) return;
      const ms = this.opts.interval ? this.opts.interval() : 100;
      if (now - this.last >= ms - 4) { this.last = now - this.last < ms * 2 ? this.last + ms : now; this.step(1); }
      this.raf = requestAnimationFrame(this._loop);
    }
    play() { if (!this.s) return; this.stop(); this.playing = true; this.last = performance.now(); this.raf = requestAnimationFrame(this._loop); }
    stop() { this.playing = false; cancelAnimationFrame(this.raf); }
  }

  /** "3,7,10-12" → [3,7,10,11,12]（只保留 < K 的） */
  function parseRanges(s, K) {
    const set = new Set();
    String(s || '').trim().split(/[,\s，、]+/).forEach(p => {
      const m = p.match(/^(\d+)(?:-(\d+))?$/); if (!m) return;
      const a = +m[1], b = m[2] ? +m[2] : a;
      for (let i = Math.min(a, b); i <= Math.max(a, b) && i < K; i++) set.add(i);
    });
    return [...set].sort((x, y) => x - y);
  }

  const api = { prepareInput, SenderSession, Player, paint, parseRanges };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QXS = api;
})(typeof self !== 'undefined' ? self : this);
