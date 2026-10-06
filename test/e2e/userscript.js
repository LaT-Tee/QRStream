// 油猴发送端：注入任意页面 → Alt+Q → 生成 → 截下面板（Shadow DOM 内）的画布，在 Node 里解码：彩格码（默认）+ 二维码 RGB
const fs = require('fs');
const jsQR = require('jsqr'); const { PNG } = require('pngjs');
global.QX = require('../../src/codec.js');
const QXG = require('../../src/grid-code.js');
const { chromium, USERSCRIPT, check, finish } = require('../helpers/common');

(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  // 宿主页面故意带一些会污染样式的全局 CSS
  await p.setContent('<html><head><style>*{font-size:40px!important;color:red} button{display:none}</style></head><body><h1>any page</h1></body></html>');
  await p.addScriptTag({ content: fs.readFileSync(USERSCRIPT, 'utf8') });
  await p.keyboard.press('Alt+q');
  await p.fill('#qrx-text', Array.from({ length: 1500 }, (_, i) => `${i},2026-10-${i % 28 + 1},彩格码${i % 97},${i * 37 % 1000 / 10}`).join('\n'));
  check(await p.locator('#qrx-gen').isVisible(), '宿主页面的全局 CSS 不影响面板（Shadow DOM 隔离）');
  for (const kind of ['grid', 'qr']) {
    if (kind === 'qr') await p.click('#qrx-edit');   // 播放时输入区收起，先点「换内容」
    await p.check(kind === 'grid' ? '#qrx-grid' : '#qrx-qr', { force: true });
    await p.click('#qrx-gen');
    await p.waitForFunction(k => { const h = document.querySelector('qrstream-sender'); const i = h && h.shadowRoot.getElementById('qrx-info');
      return i && i.dataset.ver && (k === 'grid') === (i.dataset.ver === 'grid'); }, kind);
    await p.click('#qrx-pause');
    if (kind === 'grid') { const info = await p.evaluate(() => document.querySelector('qrstream-sender').shadowRoot.getElementById('qrx-info').textContent);
      check(/LZMA/.test(info) && !/秒\/|KB\/s/.test(info), '油猴：表格文本自动选 LZMA，发送端不显示速度'); }
    const png = PNG.sync.read(Buffer.from((await p.locator('#qrx-cv').evaluate(c => c.toDataURL())).split(',')[1], 'base64'));
    if (kind === 'grid') {
      // 四周补白边，按 2 倍放大，模拟一张理想照片
      const S = 2, M = 40, W = png.width * S + M * 2, H = png.height * S + M * 2, px = new Uint8ClampedArray(W * H * 4).fill(255);
      for (let y = 0; y < png.height * S; y++) for (let x = 0; x < png.width * S; x++) {
        const si = ((y / S | 0) * png.width + (x / S | 0)) * 4, di = ((y + M) * W + x + M) * 4;
        px[di] = png.data[si]; px[di + 1] = png.data[si + 1]; px[di + 2] = png.data[si + 2];
      }
      const r = QXG.readFrame(px, W, H);
      check(r.ok && r.okTiles === r.tiles && r.meta.fec === 'ldpc', `彩格码：解出 ${r.okTiles || 0}/${r.tiles || '?'} 块（LDPC）`);
    } else {
      const got = [];
      for (const ch of [0, 1, 2]) {
        const d = new Uint8ClampedArray(png.data);
        for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = png.data[i + ch];
        const c = jsQR(d, png.width, png.height), f = c && QX.parseFrame(c.data);
        got.push(f ? f.seq : null);
      }
      check(got.every(x => x !== null) && new Set(got).size === 3, `二维码 RGB：解出 QX4 帧 seq=${got.join(',')}`);
    }
  }
  check(!errs.length, '无页面错误 ' + errs.join(' | '));
  await b.close();
  finish();
})();
