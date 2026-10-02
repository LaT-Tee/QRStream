/* 单帧识别：黑白 / RGB 三通道。decodeGray(rgba,w,h) → Promise<string|null> 由引擎（zxing-wasm / jsQR）提供 */
(function (root) {
  'use strict';

  // 粗略估计画面"彩色度"：采样像素中饱和度高的比例
  function colorfulness(px, w, h) {
    let n = 0, sat = 0;
    const step = Math.max(1, ((w * h) / 4000) | 0) * 4;
    for (let i = 0; i < px.length; i += step) {
      const r = px[i], g = px[i + 1], b = px[i + 2];
      const mx = r > g ? (r > b ? r : b) : (g > b ? g : b), mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
      if (mx - mn > 70) sat++; n++;
    }
    return sat / n;
  }

  // 把第 ch 个通道抽成灰度 RGBA；strong=true 时减去另两个通道的串色（摄像头 RGB 滤镜有串扰）
  function channelImage(px, ch, strong, out) {
    const d = out && out.length === px.length ? out : new Uint8ClampedArray(px.length);
    const o1 = (ch + 1) % 3, o2 = (ch + 2) % 3;
    for (let i = 0; i < px.length; i += 4) {
      let v = px[i + ch];
      if (strong) v = 1.6 * v - 0.3 * (px[i + o1] + px[i + o2]);
      d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;   // Uint8ClampedArray 自动钳位
    }
    return d;
  }

  function makeScanner(decodeGray) {
    let tmp = null;
    async function rgbPass(px, w, h) {
      const out = [];
      for (let ch = 0; ch < 3; ch++) {
        tmp = channelImage(px, ch, false, tmp);
        let t = await decodeGray(tmp, w, h);
        if (!t) { tmp = channelImage(px, ch, true, tmp); t = await decodeGray(tmp, w, h); }
        if (t) out.push(t);
      }
      return out;
    }
    /** mode: 'auto' | 'gray' | 'rgb' → {texts, via} */
    return async function scan(px, w, h, mode = 'auto') {
      if (mode === 'gray') { const t = await decodeGray(px, w, h); return { texts: t ? [t] : [], via: 'gray' }; }
      if (mode === 'rgb') return { texts: await rgbPass(px, w, h), via: 'rgb' };
      const cf = colorfulness(px, w, h);
      if (cf > 0.12) {
        const t = await rgbPass(px, w, h);
        if (t.length) return { texts: t, via: 'rgb' };
        const g = await decodeGray(px, w, h);
        return { texts: g ? [g] : [], via: 'gray' };
      }
      const g = await decodeGray(px, w, h);
      if (g) return { texts: [g], via: 'gray' };
      if (cf > 0.04) { const t = await rgbPass(px, w, h); if (t.length) return { texts: t, via: 'rgb' }; }
      return { texts: [], via: '' };
    };
  }

  const api = { colorfulness, channelImage, makeScanner };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QXScan = api;
})(typeof self !== 'undefined' ? self : this);
