// 离线：在"模拟 Cloudflare Pages"（.html 会 308 重定向）上在线打开一次 → 关掉浏览器 → 断网冷启动
const path = require('path');
const { serve } = require('../helpers/serve');
const { chromium, WEB, TMP, check, finish } = require('../helpers/common');

(async () => {
  const srv = await serve(WEB, 8770, { cfRedirect: true });
  const URL = 'http://localhost:8770/', ud = path.join(TMP, 'offline-profile');
  try {
    let ctx = await chromium.launchPersistentContext(ud, {});
    let p = ctx.pages()[0];
    await p.goto(URL);
    await p.waitForFunction(() => /离线可用/.test(document.querySelector('#net').textContent), null, { timeout: 15000 }).catch(() => {});
    const badge = await p.textContent('#net');
    await ctx.close();
    check(/离线可用/.test(badge), `在线打开后角标显示「${badge}」`);

    ctx = await chromium.launchPersistentContext(ud, { offline: true });   // 相当于飞行模式下点主屏幕图标
    p = ctx.pages()[0];
    for (const u of [URL, URL + '?tab=send', URL + 'index.html']) {
      let t = '';
      try { await p.goto(u, { timeout: 8000 }); t = await p.title(); } catch (e) { t = '❌ ' + e.message.split('\n')[0]; }
      check(t === 'QRStream', `断网冷启动 ${u.replace(URL, '/')} → ${t}`);
    }
    await p.goto(URL + '?tab=send');
    await p.fill('#sText', 'offline ok'); await p.click('#sGen');
    const ok = await p.waitForFunction(() => /会话/.test(document.querySelector('#sInfo').textContent), null, { timeout: 5000 }).then(() => true, () => false);
    check(ok, '断网状态下发送页可以生成二维码');
    await ctx.close();
  } finally { srv.close(); }
  finish();
})();
