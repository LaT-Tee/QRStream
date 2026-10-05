// 端到端：彩格码。发送页生成 → ffmpeg 合成摄像头视频 → Chromium 假摄像头 → 接收页还原；
// 另测「每张照片都是上下两帧拼成的混帧」（卷帘快门）：二维码这种情况一张都读不出，彩格码靠分块照样还原
const path = require('path'), fs = require('fs');
const { PNG } = require('pngjs');
const { serve } = require('../helpers/serve');
const { randText, WEB, captureSender, makeVideo, receive, check, finish } = require('../helpers/common');

/** 两张 PNG（dataURL）上下拼接：分界在 cut（0..1）处，过渡带 band 内逐行线性混合 */
function mixed(a, b, cut, band = 0.08) {
  const A = PNG.sync.read(Buffer.from(a.split(',')[1], 'base64')), B = PNG.sync.read(Buffer.from(b.split(',')[1], 'base64'));
  const out = new PNG({ width: A.width, height: A.height });
  for (let y = 0; y < A.height; y++) {
    const t = Math.min(1, Math.max(0, (y / A.height - cut) / band + 0.5));
    for (let x = 0; x < A.width; x++) for (let c = 0; c < 4; c++) { const i = (y * A.width + x) * 4 + c; out.data[i] = A.data[i] * (1 - t) + B.data[i] * t; }
  }
  return 'data:image/png;base64,' + PNG.sync.write(out).toString('base64');
}

(async () => {
  const srv = await serve(WEB, 8767);
  const URL = 'http://localhost:8767/';
  try {
    for (const preset of ['222:4', '242:4', '444:2', '444:4']) {
      const text = randText(preset.startsWith('444') ? 30000 : 15000);
      const cap = await captureSender(URL, text, { kind: 'grid', preset, extra: 3 });
      console.log(`\n[彩格码 ${preset}] K=${cap.K} 每张 ${cap.per} 块 张数=${cap.frames.length}  ${cap.frames[0].label}`);
      const r = await receive(URL, makeVideo(cap.frames, 'grid-' + preset.replace(':', '-')));
      console.log('  ' + r.status + '\n  ' + r.perf);
      check(r.ok && r.text === text, `彩格码 ${preset}：还原文本与原文一致`);
      check(!r.logs.length, `彩格码 ${preset}：无页面错误 ${r.logs.join(' | ')}`);
      await r.close();
    }

    console.log('\n[混帧] 每张都是相邻两帧上下拼接（分界位置随机）');
    const text = randText(15000);
    const cap = await captureSender(URL, text, { kind: 'grid', preset: '242:4', extra: 6 });
    const mix = [];
    for (let i = 0; i + 1 < cap.frames.length; i++) for (const cut of [0.3, 0.7]) mix.push({ png: mixed(cap.frames[i].png, cap.frames[i + 1].png, cut + (i % 3) * 0.05) });
    const r = await receive(URL, makeVideo(mix, 'grid-mix', { codesPerSec: 15 }));
    console.log('  ' + r.status + '\n  ' + r.perf);
    check(r.ok && r.text === text, '混帧：只靠半张半张的块也能还原');
    await r.close();
  } finally { srv.close(); }
  finish();
})();
