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

/** 在 PWA 发送页生成帧并逐帧截图 → [{label, png(dataURL)}] */
async function captureSender(url, text, { rgb = false, chunk = 400, extra = 30 } = {}) {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 900, height: 1000 } });
  await p.goto(url + '?tab=send');
  await p.fill('#sText', text);
  await p.fill('#sChunk', String(chunk));
  if (rgb) await p.check('#sRgb'); else await p.uncheck('#sRgb');
  await p.evaluate(() => { document.querySelector('details').open = true; });
  await p.fill('#sPx', '600');
  await p.click('#sGen');
  await p.waitForFunction(() => /会话/.test(document.querySelector('#sInfo').textContent));
  await p.click('#sPlay');       // 暂停自动播放，改成逐帧截图
  await p.click('#sRestart');
  const info = await p.textContent('#sInfo');
  const K = +info.match(/K=(\d+)/)[1], ver = info.match(/QR v(\d+)/)[1];
  const n = Math.ceil((K + extra) / (rgb ? 3 : 1)), frames = [];
  for (let i = 0; i < n; i++) {
    frames.push({ label: await p.textContent('#sIdx'), png: await p.evaluate(() => document.querySelector('#sCv').toDataURL('image/png')) });
    await p.click('#sNext');
  }
  await b.close();
  return { K, ver, frames };
}

/** 帧序列 → 模拟摄像头的 y4m：按发送端节奏（默认 50ms = 20 码/秒）播放，被 30fps 摄像头采样；加缩放、灰背景、模糊、噪声、yuv420 色度抽样 */
function makeVideo(frames, name, { blur = 0.8, noise = 8, codesPerSec = 20 } = {}) {
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

module.exports = { chromium, ROOT, WEB, USERSCRIPT, TMP, sleep, randText, captureSender, makeVideo, receive, check, finish };
