/* 识别 Worker：zxing-wasm（内联 WASM）优先，失败回退 jsQR。依赖 QXScan（scan-core.js，构建时拼在前面）
 * 主线程先发 {init:{zxingJs, wasm, jsqrJs}}，之后每帧发 {buf,w,h,mode} */
'use strict';
let engine = null, scan = null;
const OPT = { formats: ['QRCode'], tryHarder: false, tryRotate: false, tryInvert: false, tryDownscale: false,
              tryDenoise: false, maxNumberOfSymbols: 1, textMode: 'Plain' };
const blobURL = s => URL.createObjectURL(new Blob([s], { type: 'text/javascript' }));

async function init(a) {
  try {
    if (!a.zxingJs || !a.wasm) throw new Error('no zxing');
    importScripts(blobURL(a.zxingJs));
    await ZXingWASM.prepareZXingModule({ overrides: { wasmBinary: a.wasm }, fireImmediately: true });
    // 自检一下，确认 WASM 真的能跑
    await ZXingWASM.readBarcodes(new ImageData(new Uint8ClampedArray(16 * 16 * 4).fill(255), 16, 16), OPT);
    engine = 'zxing-wasm';
    scan = QXScan.makeScanner(async (px, w, h) => {
      const r = await ZXingWASM.readBarcodes(new ImageData(px, w, h), OPT);
      return r.length && r[0].isValid ? r[0].text : null;
    });
  } catch (e) {
    importScripts(blobURL(a.jsqrJs));
    engine = 'jsQR（备用）';
    scan = QXScan.makeScanner(async (px, w, h) => { const c = jsQR(px, w, h, { inversionAttempts: 'dontInvert' }); return c ? c.data : null; });
  }
  postMessage({ ready: engine });
}

let readyP = null;
onmessage = async e => {
  const m = e.data;
  if (m.init) { readyP = init(m.init); return; }
  await readyP;
  const t0 = performance.now();
  let r = { texts: [], via: '' };
  try { r = await scan(new Uint8ClampedArray(m.buf), m.w, m.h, m.mode); } catch (err) {}
  postMessage({ texts: r.texts, via: r.via, ms: performance.now() - t0 });
};
