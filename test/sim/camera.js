/* 屏幕 → 手机摄像头 仿真（仅测试用）。
 * 流程：屏幕图（1 像素 = 1 格）→ 线性光（显示伽马、黑电平、反光）→ 透视 + 镜头桶形畸变投影（2×2 超采样）
 *      → 光学模糊 + 手抖运动模糊 → 卷帘快门混帧（两帧按行渐变）→ 摩尔纹（低频彩色干涉）→ 暗角
 *      → 传感器串色 + 白平衡误差 + 自动曝光（白色可能过曝）→ 散粒/读出噪声 → 色调曲线
 *      → 拜耳 RGGB 采样 + 双线性去马赛克 → YUV 4:2:0 色度抽样 → ISP 锐化 → 8 位 RGBA
 */
'use strict';

function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = r => { let u = 0, v = 0; while (!u) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

// 预设信道条件
const PRESETS = {
  good:    { blur: 0.7, motion: 0,   noise: 0.6, moire: 0.02, k1: 0.01, tilt: 0.02, glare: 0.01, sharpen: 0.3, xtalk: 0.10, wb: 0.04, vignette: 0.10, over: 1.00 },
  typical: { blur: 1.0, motion: 1.0, noise: 1.0, moire: 0.04, k1: 0.02, tilt: 0.04, glare: 0.03, sharpen: 0.5, xtalk: 0.15, wb: 0.07, vignette: 0.20, over: 1.08 },
  bad:     { blur: 1.4, motion: 2.2, noise: 1.6, moire: 0.07, k1: 0.035, tilt: 0.07, glare: 0.07, sharpen: 0.7, xtalk: 0.22, wb: 0.10, vignette: 0.30, over: 1.18 },
};

/** 由 4 组点求单应（精确解，8×8）：src→dst */
function homography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [u, v] = src[i], [x, y] = dst[i];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y);
  }
  const n = 8, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const h = M.map((r, i) => r[n] / r[i]);
  return (u, v) => { const w = h[6] * u + h[7] * v + 1; return [(h[0] * u + h[1] * v + h[2]) / w, (h[3] * u + h[4] * v + h[5]) / w]; };
}

function blur1d(img, W, H, sigma, horiz) {
  if (sigma < 0.3) return img;
  const r = Math.ceil(sigma * 3), k = new Float32Array(2 * r + 1); let s = 0;
  for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-i * i / (2 * sigma * sigma)); s += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= s;
  const out = new Float32Array(img.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let c = 0; c < 3; c++) {
    let a = 0;
    for (let i = -r; i <= r; i++) {
      const xx = horiz ? Math.min(W - 1, Math.max(0, x + i)) : x, yy = horiz ? y : Math.min(H - 1, Math.max(0, y + i));
      a += img[(yy * W + xx) * 3 + c] * k[i + r];
    }
    out[(y * W + x) * 3 + c] = a;
  }
  return out;
}

/**
 * screens: [{w,h,data}]（1 或 2 张；两张时模拟卷帘混帧）
 * o: { W, H, fill, rot(弧度), cond: PRESETS 键或对象, seed, mix: {y0, band}（相对画面高度 0..1） , margin: 白边格数 }
 */
function shoot(screens, o) {
  const r = rng(o.seed || 1), cond = typeof o.cond === 'string' ? PRESETS[o.cond] : o.cond;
  const W = o.W, H = o.H, ss = 2, scr = screens[0], margin = o.margin == null ? 6 : o.margin;
  // 屏幕坐标（格）：码图左上为 (0,0)，四周再加 margin 格白色舞台，舞台外是深色桌面/边框
  const sw = scr.w, sh = scr.h, side = Math.max(sw, sh);
  const size = (o.fill || 0.85) * Math.min(W, H);              // 码图长边在画面里占多少像素
  const scale = size / side, rot = o.rot || 0, cx = W / 2 + (r() - 0.5) * 0.06 * W, cy = H / 2 + (r() - 0.5) * 0.06 * H;
  const corners = [[0, 0], [sw, 0], [sw, sh], [0, sh]].map(([u, v]) => {
    const x = (u - sw / 2) * scale, y = (v - sh / 2) * scale;
    const jx = (r() - 0.5) * 2 * cond.tilt * size, jy = (r() - 0.5) * 2 * cond.tilt * size;
    return [cx + x * Math.cos(rot) - y * Math.sin(rot) + jx, cy + x * Math.sin(rot) + y * Math.cos(rot) + jy];
  });
  const Hinv = homography(corners, [[0, 0], [sw, 0], [sw, sh], [0, sh]]);
  const k1 = (r() - 0.5) * 2 * cond.k1, rn = Math.hypot(W, H) / 2;
  const lin = v => Math.pow(v / 255, 2.2);
  const black = 0.015 + cond.glare * 0.3, glare = cond.glare;
  const gdir = r() * Math.PI * 2;
  // 渲染每张屏幕到线性光
  const render = scrImg => {
    const img = new Float32Array(W * H * 3);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let R = 0, G = 0, B = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        // 畸变：观测点 (xd,yd) → 理想点 (xu,yu)，迭代求逆
        const xd = x + (sx + 0.5) / ss - W / 2, yd = y + (sy + 0.5) / ss - H / 2;
        let xu = xd, yu = yd;
        for (let it = 0; it < 3; it++) { const rr = (xu * xu + yu * yu) / (rn * rn), f = 1 + k1 * rr; xu = xd / f; yu = yd / f; }
        const [u, v] = Hinv(xu + W / 2, yu + H / 2);
        let cr, cg, cb;
        if (u >= 0 && v >= 0 && u < sw && v < sh) {
          const i = ((v | 0) * sw + (u | 0)) * 4; cr = lin(scrImg.data[i]); cg = lin(scrImg.data[i + 1]); cb = lin(scrImg.data[i + 2]);
        } else if (u >= -margin && v >= -margin && u < sw + margin && v < sh + margin) { cr = cg = cb = 1; }
        else { cr = 0.05; cg = 0.05; cb = 0.06; }
        R += cr; G += cg; B += cb;
      }
      const q = ss * ss, o3 = (y * W + x) * 3;
      // 反光：整屏一个缓慢渐变的灰白叠加
      const gl = glare * (0.5 + 0.5 * Math.cos(gdir + (x / W) * 2.2 + (y / H) * 1.7));
      img[o3] = R / q * (1 - black) + black + gl; img[o3 + 1] = G / q * (1 - black) + black + gl; img[o3 + 2] = B / q * (1 - black) + black + gl;
    }
    return img;
  };
  let img = render(scr);
  if (screens[1] && o.mix) {
    const img2 = render(screens[1]), y0 = o.mix.y0 * H, band = Math.max(1, o.mix.band * H);
    for (let y = 0; y < H; y++) {
      const a = Math.min(1, Math.max(0, (y - y0) / band));
      if (!a) continue;
      for (let x = 0; x < W; x++) for (let c = 0; c < 3; c++) { const i = (y * W + x) * 3 + c; img[i] = img[i] * (1 - a) + img2[i] * a; }
    }
  }
  // 光学模糊
  img = blur1d(blur1d(img, W, H, cond.blur, true), W, H, cond.blur, false);
  // 手抖：沿随机方向的线段平均
  if (cond.motion > 0.2) {
    const len = cond.motion * (0.5 + r()), ang = r() * Math.PI, n = Math.ceil(len * 2) + 1, out = new Float32Array(img.length);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let c = 0; c < 3; c++) {
      let a = 0;
      for (let i = 0; i < n; i++) {
        const t = (i / (n - 1) - 0.5) * len, xx = Math.min(W - 1, Math.max(0, Math.round(x + t * Math.cos(ang)))), yy = Math.min(H - 1, Math.max(0, Math.round(y + t * Math.sin(ang))));
        a += img[(yy * W + xx) * 3 + c];
      }
      out[(y * W + x) * 3 + c] = a / n;
    }
    img = out;
  }
  // 摩尔纹（各通道相位不同的低频干涉）+ 暗角
  const mp = Array.from({ length: 3 }, () => [r() * 6.28, 0.02 + r() * 0.05, r() * 3.14]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const rr = ((x - W / 2) ** 2 + (y - H / 2) ** 2) / (rn * rn), vg = 1 - cond.vignette * rr;
    for (let c = 0; c < 3; c++) {
      const [ph, fr, an] = mp[c], t = (x * Math.cos(an) + y * Math.sin(an)) * fr;
      img[(y * W + x) * 3 + c] *= vg * (1 + cond.moire * Math.sin(t + ph));
    }
  }
  // 串色 + 白平衡 + 曝光
  const X = cond.xtalk, M = [[1 - X, X * 0.8, X * 0.2], [X * 0.5, 1 - X, X * 0.5], [X * 0.2, X * 0.8, 1 - X]];
  const wb = [1 + (r() - 0.5) * 2 * cond.wb, 1, 1 + (r() - 0.5) * 2 * cond.wb], gain = cond.over;
  const nA = 0.0012 * cond.noise, nB = 0.00002 * cond.noise;
  for (let i = 0; i < W * H; i++) {
    const R = img[i * 3], G = img[i * 3 + 1], B = img[i * 3 + 2];
    for (let c = 0; c < 3; c++) {
      let s = (M[c][0] * R + M[c][1] * G + M[c][2] * B) * wb[c] * gain;
      s += gauss(r) * Math.sqrt(Math.max(0, nA * s + nB));
      s = Math.min(1, Math.max(0, s));
      img[i * 3 + c] = Math.pow(s, 1 / 2.2);
    }
  }
  // 拜耳 RGGB + 双线性去马赛克
  const ch = (x, y) => (y & 1) ? ((x & 1) ? 2 : 1) : ((x & 1) ? 1 : 0);
  const raw = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) raw[y * W + x] = img[(y * W + x) * 3 + ch(x, y)];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s = [0, 0, 0], n = [0, 0, 0];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const c = ch(xx, yy), w = (dx === 0 && dy === 0) ? 4 : (dx === 0 || dy === 0) ? 2 : 1;
      s[c] += raw[yy * W + xx] * w; n[c] += w;
    }
    for (let c = 0; c < 3; c++) img[(y * W + x) * 3 + c] = n[c] ? s[c] / n[c] : 0;
  }
  // YUV 4:2:0 + 亮度锐化
  const Yl = new Float32Array(W * H), U = new Float32Array(W * H), V = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const R = img[i * 3], G = img[i * 3 + 1], B = img[i * 3 + 2];
    Yl[i] = 0.299 * R + 0.587 * G + 0.114 * B; U[i] = B - Yl[i]; V[i] = R - Yl[i];
  }
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
    let su = 0, sv = 0, n = 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) if (x + dx < W && y + dy < H) { const i = (y + dy) * W + x + dx; su += U[i]; sv += V[i]; n++; }
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) if (x + dx < W && y + dy < H) { const i = (y + dy) * W + x + dx; U[i] = su / n; V[i] = sv / n; }
  }
  if (cond.sharpen > 0) {
    const t = new Float32Array(W * H * 3); for (let i = 0; i < W * H; i++) t[i * 3] = t[i * 3 + 1] = t[i * 3 + 2] = Yl[i];
    const bl = blur1d(blur1d(t, W, H, 1.0, true), W, H, 1.0, false);
    for (let i = 0; i < W * H; i++) Yl[i] += cond.sharpen * (Yl[i] - bl[i * 3]);
  }
  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const y = Yl[i], R = y + V[i], B = y + U[i], G = (y - 0.299 * R - 0.114 * B) / 0.587;
    out[i * 4] = R * 255 + 0.5; out[i * 4 + 1] = G * 255 + 0.5; out[i * 4 + 2] = B * 255 + 0.5; out[i * 4 + 3] = 255;
  }
  return out;
}

module.exports = { shoot, PRESETS, rng };
