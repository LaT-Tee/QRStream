// 模拟"屏幕→摄像头"：放大、串色、模糊、噪声、缩放，然后用 zxing-wasm / jsQR 走 scan-core 识别
global.QX = require('../../src/codec.js');
const fs = require('fs');
const { SenderSession, paint } = require('../../src/sender-core.js');
const { makeScanner } = require('../../src/scan-core.js');
const jsQR = require('jsqr');
const Z = require('zxing-wasm/reader');
if (!global.ImageData) global.ImageData = class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; this.colorSpace = 'srgb'; } };

function camera(N, rgba, { cell = 4, out = 640, mix = 0.25, blur = 1, noise = 10, margin = 60 }) {
  const S = N * cell + margin * 2;
  let img = new Float32Array(S * S * 3).fill(0.55 * 255);         // 灰色背景
  for (let y = 0; y < N * cell; y++) for (let x = 0; x < N * cell; x++) {
    const s = ((y / cell | 0) * N + (x / cell | 0)) * 4, d = ((y + margin) * S + x + margin) * 3;
    const r = rgba[s], g = rgba[s + 1], b = rgba[s + 2];
    // 串色矩阵：每个传感器通道混入相邻通道的光
    img[d] = 0.9 * r + mix * g + mix * 0.3 * b;
    img[d + 1] = mix * r + 0.9 * g + mix * b;
    img[d + 2] = mix * 0.3 * r + mix * g + 0.9 * b;
  }
  for (let k = 0; k < blur; k++) {           // 3x3 box blur
    const o = new Float32Array(img.length);
    for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) for (let c = 0; c < 3; c++) {
      let a = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) a += img[((y + dy) * S + x + dx) * 3 + c];
      o[(y * S + x) * 3 + c] = a / 9;
    }
    img = o;
  }
  const px = new Uint8ClampedArray(out * out * 4), sc = S / out;
  for (let y = 0; y < out; y++) for (let x = 0; x < out; x++) {
    const s = ((y * sc | 0) * S + (x * sc | 0)) * 3, d = (y * out + x) * 4;
    for (let c = 0; c < 3; c++) px[d + c] = img[s + c] * 0.85 + 20 + (Math.random() - 0.5) * 2 * noise;
    px[d + 3] = 255;
  }
  return px;
}

let failed = false;
(async () => {
  const path = require('path');
  let zd = path.dirname(require.resolve('zxing-wasm/reader'));
  while (!fs.existsSync(path.join(zd, 'dist/reader/zxing_reader.wasm'))) zd = path.dirname(zd);
  const wasm = fs.readFileSync(path.join(zd, 'dist/reader/zxing_reader.wasm'));
  await Z.prepareZXingModule({ overrides: { wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.length) }, fireImmediately: true });
  const OPT = { formats: ['QRCode'], tryHarder: false, tryRotate: false, tryInvert: false, tryDownscale: false, tryDenoise: false, maxNumberOfSymbols: 1, textMode: 'Plain' };
  const engines = {
    zxing: async (px, w, h) => { const r = await Z.readBarcodes(new ImageData(px, w, h), OPT); return r.length && r[0].isValid ? r[0].text : null; },
    jsqr: async (px, w, h) => { const c = jsQR(px, w, h, { inversionAttempts: 'dontInvert' }); return c ? c.data : null; },
  };
  const data = new Uint8Array(30000).map((_, i) => i * 7);
  for (const chunk of [300, 500]) {
    const s = new SenderSession({ t: 'file', name: 'x', mime: 'a/b', z: false, len: data.length }, data, { chunk, ecc: 'L' });
    for (const [label, cam] of [['理想', { mix: 0, blur: 0, noise: 0 }], ['轻串色', { mix: 0.15 }], ['中串色', { mix: 0.25 }], ['重串色', { mix: 0.35, blur: 2 }]]) {
      const row = [];
      for (const [en, fn] of Object.entries(engines)) {
        const scan = makeScanner(fn);
        let ok = 0, tries = 6, mono = 0;
        for (let t = 0; t < tries; t++) {
          const f = [s.build(t * 3), s.build(t * 3 + 1), s.build(t * 3 + 2)];
          const { N, data: rgba } = paint(f);
          const cell = Math.max(2, Math.floor(600 / N));
          const r = await scan(camera(N, rgba, { cell, ...cam }), 640, 640, 'auto');
          ok += r.texts.filter(x => QX.parseFrame(x)).length;
          const m = paint([f[0]]);
          const r2 = await scan(camera(m.N, m.data, { cell, ...cam }), 640, 640, 'auto');
          mono += r2.texts.filter(x => QX.parseFrame(x)).length;
        }
        row.push(`${en}: RGB ${ok}/${tries * 3} 黑白 ${mono}/${tries}`);
        if (en === 'zxing' && label !== '重串色' && (ok < tries * 3 || mono < tries)) failed = true;
      }
      console.log(`chunk=${chunk} QRv${s.type} ${label.padEnd(4)} | ${row.join(' | ')}`);
    }
  }
  if (failed) { console.error('zxing 在理想/轻中度串色下应 100% 识别'); process.exit(1); }
})();
