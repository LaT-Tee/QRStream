/* 发送端核心（油猴脚本和 PWA 共用）。依赖：全局 qrcode（qrcode-generator）、QX（codec.js）、LZMA（LZMA-JS，可选）。 */
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
  /* LZMA（7z / xz 用的算法，LZMA-JS 实现）：比 deflate 再小 12%–37%（文本、表格、BMP 等），速度约为 deflate 的几分之一。
   * 输出 .lzma（LZMA-alone）格式。等级 3 = 512 KB 字典：大文件比等级 1 小 15%，速度相同；更高等级几乎不再变小却慢好几倍 */
  /* LZMA 等级按「压缩耗时 + 传输耗时」最短选（实测见 docs/SIMULATION.md 第 7 节）：
     字典能盖住整个文件就够了，再高的等级不变小反而更慢、更占内存（第 9 级压 3 MB 文本要 41 秒、1.8 GB 内存）。
     ≤ 512 KB 用第 3 级（字典 512 KB）；更大用第 4 级（字典 1 MB）。 */
  const lzmaLevel = n => n > (512 << 10) ? 4 : 3, LZMA_MAX = 32 << 20;
  const lzmaLib = () => root.LZMA || (typeof require === 'function' ? (() => { try { return require('lzma/src/lzma_worker.js').LZMA; } catch (e) { return null; } })() : null);
  async function lzmaCompress(u8, onProgress) {
    const L = lzmaLib(); if (!L || u8.length > LZMA_MAX) return null;
    const out = await new Promise((res, rej) => L.compress(u8, lzmaLevel(u8.length), (r, err) => err ? rej(err) : res(r), p => onProgress && onProgress(p)));
    const c = Uint8Array.from(out, x => x & 255);
    // 自检：解回来必须逐字节一致（LZMA-JS 解压时会把合法 UTF-8 还成字符串，这里连同这一步一起验证），否则不用 LZMA
    const back = await new Promise(res => L.decompress(c, r => res(r)));
    const b = typeof back === 'string' ? new TextEncoder().encode(back) : back ? Uint8Array.from(back, x => x & 255) : null;
    if (!b || b.length !== u8.length) return null;
    for (let i = 0; i < b.length; i++) if (b[i] !== u8[i]) return null;
    return c;
  }
  /** opts: {file|null, text, compress, onProgress(0..1)} → {meta, data}。文件按原样发送（不改格式、不缩放）。
   *  compress=true 时试 deflate 和 LZMA，取更小的；文件要省 ≥5% 才压缩。meta.z：false | true（deflate）| 'lzma' */
  async function prepareInput(opts) {
    let meta, data;
    if (opts.file) {
      const f = opts.file;
      data = new Uint8Array(await f.arrayBuffer());
      meta = { t: 'file', name: f.name || 'file.bin', mime: f.type || 'application/octet-stream', z: false, len: data.length };
    } else {
      if (!opts.text) throw new Error('先输入文字或选一个文件');
      data = new TextEncoder().encode(opts.text);
      meta = { t: 'text', name: 'text.txt', mime: 'text/plain;charset=utf-8', z: false, len: data.length };
    }
    if (opts.compress) {
      const limit = data.length * (opts.file ? 0.95 : 1);
      let best = null;
      const zd = await deflate(data);
      if (zd && zd.length < limit) { best = zd; meta.z = true; }
      // deflate 都省不到 5% 的（JPEG、ZIP、视频等已经压缩过的），LZMA 也省不了多少，直接跳过
      if (best || (zd && zd.length < data.length * 0.95) || !zd) {
        const lz = await lzmaCompress(data, opts.onProgress).catch(() => null);
        if (lz && lz.length < (best ? best.length : limit)) { best = lz; meta.z = 'lzma'; }
      }
      if (best) data = best;
    }
    return { meta, data };
  }

  /* ---------- 会话：分块、喷泉码、QR 生成 ---------- */
  const MAX_SEQ_DIGITS = 7;   // 用 9999999 估算 QR 版本：整场播放 QR 尺寸固定，RGB 三层也必定对齐
  class SenderSession {
    /** qr=false：只给彩格码用，不生成 QR（每帧字节由彩格码版面决定） */
    constructor(meta, data, { chunk = 500, ecc = 'L', qr = true } = {}) {
      const mb = new TextEncoder().encode(JSON.stringify(meta));
      const len = 4 + mb.length + data.length;
      const C = Math.max(qr ? 52 : 16, (chunk | 0) & ~3);       // 4 的倍数，冗余帧按 32 位字 XOR
      const K = Math.ceil(len / C);
      if (K > 20000) throw new Error(`内容太大：最多约 ${(20000 * C / 1048576).toFixed(1)} MB`);
      const padded = new Uint8Array(K * C);
      new DataView(padded.buffer).setUint32(0, mb.length); padded.set(mb, 4); padded.set(data, 4 + mb.length);
      Object.assign(this, { meta, len, C, K, ecc, padded,
        crc: hex(crc32n(padded.subarray(0, len)), 8),
        sid: Array.from(crypto.getRandomValues(new Uint8Array(4)), b => '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'[b % 36]).join(''),
        blocks32: Array.from({ length: K }, (_, i) => new Uint32Array(padded.buffer, i * C, C >>> 2)) });
      if (!qr) { this.type = 0; return; }
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
    /** canvas：显示用；opts.onShow(label)；opts.box() → {w,h} 可用 CSS 像素（或 opts.size() → 正方形边长）；opts.interval() → ms；
     *  opts.dpr() → 设备像素比（给了就按物理像素整数倍画，125%/150% 缩放的屏幕上每格也一样大） */
    constructor(canvas, opts) {
      this.cv = canvas; this.opts = opts;
      this.small = document.createElement('canvas'); this.sctx = this.small.getContext('2d');
      this.s = null; this.rgb = false; this.grid = null; this.only = null; this.pos = 0;
      this.imgs = new Map(); this.playing = false; this.raf = 0; this.ticks = 0; this.prevT = 0; this.period = 0;
      this._loop = this._loop.bind(this);
    }
    /** grid：彩格码 GridFramer（不传则播 QR） */
    load(session, rgb, grid) { this.stop(); this.s = session; this.rgb = !!rgb; this.grid = grid || null; this.only = null; this.pos = 0; this.imgs.clear(); this.render(); }
    setRGB(rgb) { this.rgb = !!rgb; this.imgs.clear(); this.render(); }
    setOnly(list) { this.only = list && list.length ? list : null; this.pos = 0; this.imgs.clear(); this.render(); }
    get per() { return this.grid ? this.grid.per : this.rgb ? 3 : 1; }
    seqAt(i) { const o = this.only; return o ? o[((i % o.length) + o.length) % o.length] : i; }
    seqsAt(p) { const a = []; for (let k = 0; k < this.per; k++) a.push(this.seqAt(p * this.per + k)); return a; }
    /** 第 p 张图 → {w, h, data: RGBA}（1 像素 = 1 模块/格） */
    image(p) {
      const seqs = this.seqsAt(p);
      if (this.grid) return this.grid.paint(seqs);
      const { N, data } = paint(seqs.map(q => this.s.build(q)));
      return { w: N, h: N, data };
    }
    render() {
      if (!this.s) return;
      const p0 = this.pos, img = this.imgs.get(p0) || this.image(p0);
      this.imgs.clear(); this.imgs.set(p0, img);
      if (this.small.width !== img.w || this.small.height !== img.h) { this.small.width = img.w; this.small.height = img.h; }
      this.sctx.putImageData(new ImageData(img.data, img.w, img.h), 0, 0);
      const box = this.opts.box ? this.opts.box() : (n => ({ w: n, h: n }))(this.opts.size ? this.opts.size() : 520);
      const dpr = (this.opts.dpr && this.opts.dpr()) || 1;
      const cell = Math.max(1, Math.floor(Math.min(box.w * dpr / img.w, box.h * dpr / img.h)));      // 物理像素整数倍放大，边缘锐利
      const W = cell * img.w, H = cell * img.h;
      if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; }
      if (this.opts.dpr) this.cv.style.width = W / dpr + 'px';
      const ctx = this.cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.small, 0, 0, W, H);
      const seqs = this.seqsAt(p0), label = this.only ? `补发 ${(p0 * this.per) % this.only.length + 1} / ${this.only.length}` : `第 ${p0 + 1} 张`;
      if (this.opts.onShow) this.opts.onShow(label, seqs);
      // 下一张提前生成，播放时不卡
      setTimeout(() => { if (this.s && this.pos === p0 && !this.imgs.has(p0 + 1)) this.imgs.set(p0 + 1, this.image(p0 + 1)); }, 0);
    }
    step(d) {
      if (!this.s) return;
      this.pos = this.only ? this.pos + d : Math.max(0, this.pos + d);
      this.render();
    }
    restart() { this.pos = 0; this.render(); }
    /* 换帧按屏幕刷新次数计：每张显示 round(间隔 / 刷新周期) 次刷新，不随毫秒累计漂移（漂移会让个别帧变短，引起混帧） */
    _loop(now) {
      if (!this.playing) return;
      if (this.prevT) {
        const d = now - this.prevT;
        if (d > 3 && d < (this.period ? this.period * 1.5 : 40)) this.period = this.period ? this.period * 0.9 + d * 0.1 : d;
      }
      this.prevT = now;
      const ms = this.opts.interval ? this.opts.interval() : 100, n = Math.max(1, Math.round(ms / (this.period || 16.67)));
      if (++this.ticks >= n) { this.ticks = 0; this.step(1); }
      this.raf = requestAnimationFrame(this._loop);
    }
    play() { if (!this.s) return; this.stop(); this.playing = true; this.ticks = 0; this.prevT = 0; this.raf = requestAnimationFrame(this._loop); }
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
