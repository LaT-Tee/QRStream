const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');
const WEB = path.join(ROOT, 'dist/web');
const USERSCRIPT = path.join(ROOT, 'dist/qrstream-sender.user.js');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'qrstream-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!fs.existsSync(path.join(WEB, 'index.html'))) { console.error('请先 npm run build'); process.exit(1); }

function randText(n) {
  const A = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789中文测试🙂\n'];
  let s = ''; for (let i = 0; i < n; i++) s += A[(Math.random() * A.length) | 0]; return s;
}

/** 在 PWA 发送页（默认设置）生成帧并逐帧截图 → {K, per, frames: [{label, png(dataURL)}]}。kind='grid' | 'qr' */
async function captureSender(url, text, { kind = 'grid', extra = 30, compress = true } = {}) {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1000, height: 1100 } });
  await p.goto(url + '?tab=send');
  await p.fill('#sText', text);
  await p.check(kind === 'qr' ? '#kQr' : '#kGrid', { force: true });
  if (compress) await p.check('#sZ', { force: true }); else await p.uncheck('#sZ', { force: true });
  await p.click('#sGen');
  await p.waitForFunction(() => document.querySelector('#sInfo').dataset.k);
  await p.keyboard.press('Space');   // 暂停自动播放，改成逐帧截图（键盘：空格暂停、Home 从头、→ 下一张）
  await p.keyboard.press('Home');
  const ds = await p.evaluate(() => ({ ...document.querySelector('#sInfo').dataset }));
  const K = +ds.k, per = +ds.per, n = Math.ceil((K + extra) / per), frames = [];
  for (let i = 0; i < n; i++) {
    frames.push({ label: await p.textContent('#sIdx'), png: await p.evaluate(() => document.querySelector('#sCv').toDataURL('image/png')) });
    await p.keyboard.press('ArrowRight');
  }
  await b.close();
  return { K, ver: ds.ver, per, frames };
}

/** 不经界面、直接在 Node 里按指定参数生成帧（测非默认组合：黑白二维码、其它色阶/码率等）→ {K, per, frames} */
async function nodeFrames(text, { kind = 'grid', rgb = true, chunk = 500, preset = '242:5', long = 85, extra = 30, compress = true } = {}) {
  global.QX = global.QX || require('../../src/codec.js');
  const QXS = require('../../src/sender-core.js'), QXG = require('../../src/grid-code.js'), { PNG } = require('pngjs');
  const { meta, data } = await QXS.prepareInput({ text, compress });
  let s, per, draw;
  if (kind === 'grid') {
    const [lv, rate] = preset.split(':');
    const L = QXG.makeLayout(QXG.profile({ long, levels: [...lv].map(Number), rate: +rate, tile: 24 }));
    s = new QXS.SenderSession(meta, data, { chunk: L.C, qr: false });
    const g = new QXG.GridFramer(s, L); per = L.T;
    draw = p => g.paint(Array.from({ length: per }, (_, j) => p * per + j));
  } else {
    s = new QXS.SenderSession(meta, data, { chunk, ecc: 'L' }); per = rgb ? 3 : 1;
    draw = p => { const { N, data: d } = QXS.paint(Array.from({ length: per }, (_, j) => s.build(p * per + j))); return { w: N, h: N, data: d }; };
  }
  const n = Math.ceil((s.K + extra) / per), frames = [];
  for (let p = 0; p < n; p++) {
    const img = draw(p), f = Math.max(1, Math.floor(600 / Math.max(img.w, img.h))), png = new PNG({ width: img.w * f, height: img.h * f });
    for (let y = 0; y < img.h * f; y++) for (let x = 0; x < img.w * f; x++) {
      const si = ((y / f | 0) * img.w + (x / f | 0)) * 4, di = (y * img.w * f + x) * 4;
      png.data[di] = img.data[si]; png.data[di + 1] = img.data[si + 1]; png.data[di + 2] = img.data[si + 2]; png.data[di + 3] = 255;
    }
    frames.push({ label: `第 ${p + 1} 张`, png: 'data:image/png;base64,' + PNG.sync.write(png).toString('base64') });
  }
  return { K: s.K, ver: kind === 'grid' ? 'grid' : s.type, per, frames };
}

/** 帧序列 → 模拟摄像头的 y4m：按发送端节奏（默认 66ms = 15 张/秒）播放，被 30fps 摄像头采样；加缩放、灰背景、模糊、噪声、yuv420 色度抽样 */
function makeVideo(frames, name, { blur = 0.8, noise = 8, codesPerSec = 15 } = {}) {
  const dir = path.join(TMP, name); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
  frames.forEach((f, i) => fs.writeFileSync(path.join(dir, `f${String(i).padStart(4, '0')}.png`), Buffer.from(f.png.split(',')[1], 'base64')));
  const out = path.join(TMP, name + '.y4m');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(codesPerSec), '-i', path.join(dir, 'f%04d.png'), '-vf',
    `scale=560:560:flags=area,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x8c8c8c,gblur=sigma=${blur},noise=alls=${noise}:allf=t,fps=30,format=yuv420p`, out]);
  return out;
}

/** 用假摄像头打开接收页，等待完成 */
async function receive(url, video, { userDataDir, waitDone = true, timeout = 90000, contextOptions = {}, route } = {}) {
  const args = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`];
  let browser = null, ctx;
  if (userDataDir) ctx = await chromium.launchPersistentContext(userDataDir, { args, viewport: { width: 420, height: 900 }, ...contextOptions });
  else { browser = await chromium.launch({ args }); ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, ...contextOptions }); }
  const p = ctx.pages()[0] || await ctx.newPage();
  const logs = []; p.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  if (route) await p.route('**/*', route);
  await p.goto(url + '?tab=recv');
  await p.click('#start');
  let ok = false;
  if (waitDone) {
    try { await p.waitForFunction(() => /✅|❌/.test(document.querySelector('#status').textContent), null, { timeout }); ok = true; } catch {}
  } else await sleep(timeout);
  return {
    ctx, browser, page: p, ok, logs,
    close: async () => { await ctx.close(); if (browser) await browser.close(); },
    engine: await p.evaluate(() => document.body.dataset.engine || ''),
    status: await p.textContent('#status'), log: await p.textContent('#log'), perf: await p.textContent('#perf'),
    text: await p.$eval('#result textarea', t => t.value).catch(() => null),
  };
}

let failures = 0;
function check(cond, msg) { console.log((cond ? '  ✔ ' : '  ✘ ') + msg); if (!cond) failures++; }
function finish() {
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(failures ? `\n❌ ${failures} 项失败` : '\n✅ 全部通过');
  process.exit(failures ? 1 : 0);
}

module.exports = { chromium, ROOT, WEB, USERSCRIPT, TMP, sleep, randText, captureSender, nodeFrames, makeVideo, receive, check, finish };
