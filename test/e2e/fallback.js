// 备用引擎：去掉内联 WASM，确认自动回退到 jsQR 也能完成黑白 / RGB 接收
const fs = require('fs'), path = require('path');
const { serve } = require('../helpers/serve');
const { WEB, randText, captureSender, nodeFrames, makeVideo, receive, check, finish } = require('../helpers/common');

(async () => {
  const srv = await serve(WEB, 8766);
  const URL = 'http://localhost:8766/';
  const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8').replace(/(id="res-wasm">)[^<]*/, '$1');
  try {
    for (const rgb of [false, true]) {
      const text = randText(3000);
      const cap = rgb ? await captureSender(URL, text, { kind: 'qr' }) : await nodeFrames(text, { kind: 'qr', rgb: false, chunk: 400 });
      const r = await receive(URL, makeVideo(cap.frames, 'fb-' + rgb), {
        contextOptions: { serviceWorkers: 'block' },
        route: rt => rt.request().resourceType() === 'document' ? rt.fulfill({ body: html, contentType: 'text/html' }) : rt.continue(),
      });
      console.log(`  [${r.engine}] ${r.status}`);
      check(r.ok && r.text === text && /jsQR/.test(r.engine), `jsQR 备用引擎（${rgb ? 'RGB' : '黑白'}）还原成功`);
      await r.close();
    }
  } finally { srv.close(); }
  finish();
})();
