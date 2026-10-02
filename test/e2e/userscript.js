// 油猴发送端：注入任意页面 → Alt+Q → 生成 → 截图并用 jsQR 解出 QX4 帧（黑白 + RGB 三通道）
const fs = require('fs');
const jsQR = require('jsqr'); const { PNG } = require('pngjs');
const QX = require('../../src/codec.js');
const { chromium, USERSCRIPT, check, finish } = require('../helpers/common');

(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.setContent('<html><head></head><body><h1>any page</h1></body></html>');
  await p.addScriptTag({ content: fs.readFileSync(USERSCRIPT, 'utf8') });
  await p.keyboard.press('Alt+q');
  await p.fill('#qrx-text', 'hello 二维码 '.repeat(300));
  for (const rgb of [false, true]) {
    if (rgb) await p.check('#qrx-rgb'); else await p.uncheck('#qrx-rgb');
    await p.click('#qrx-gen');
    await p.waitForFunction(() => /会话/.test(document.querySelector('#qrx-info').textContent));
    await p.click('#qrx-pause');
    const png = PNG.sync.read(Buffer.from((await p.evaluate(() => document.querySelector('#qrx-cv').toDataURL())).split(',')[1], 'base64'));
    const got = [];
    for (const ch of rgb ? [0, 1, 2] : [-1]) {
      const d = new Uint8ClampedArray(png.data);
      if (ch >= 0) for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = png.data[i + ch];
      const c = jsQR(d, png.width, png.height), f = c && QX.parseFrame(c.data);
      got.push(f ? f.seq : null);
    }
    check(got.every(x => x !== null) && new Set(got).size === got.length, `${rgb ? 'RGB' : '黑白'}：解出 QX4 帧 seq=${got.join(',')}`);
  }
  check(!errs.length, '无页面错误 ' + errs.join(' | '));
  await b.close();
  finish();
})();
