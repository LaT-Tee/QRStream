// ==UserScript==
// @name         QRStream Sender
// @namespace    qrstream.sender
// @version      /*@VERSION*/
// @license      MIT
// @description  Alt+Q 打开发送面板：彩格码（默认）或二维码，喷泉码抗丢帧。依赖全部内联，离线可用
// @match        *://*/*
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @noframes
// ==/UserScript==

/* eslint-disable */
/* jshint ignore:start */
/* 上面两行关掉 Tampermonkey 编辑器自带的代码检查：脚本内联了第三方库（qrcode-generator 等老式写法会反复 var 同名变量），
 * 检查器会报一大堆「'i' is already defined」之类的提示。它们只是风格警告，不影响运行。
 *
 * 本脚本内联了 qrcode-generator（MIT, https://github.com/kazuhikoarase/qrcode-generator）
 * 协议见 https://github.com/LaT-Tee/QRStream/blob/main/docs/PROTOCOL.md（QX4 二维码、QX5 彩格码）
 */
(function () {
  'use strict';
  const NS = {};
  (function () {
/*@QRCODE_LIB*/
    NS.qrcode = qrcode;
  }).call(NS);
  (function (self) {
/*@CODEC*/
  })(NS);
  (function (self) {
/*@GRID_CODE*/
  })(NS);
  (function (self) {
/*@SENDER_CORE*/
  })(NS);
  const QXS = NS.QXS, QXG = NS.QXG;

  /* 固定参数，与网页版一致（仿真选出的最优值，见 docs/SIMULATION.md） */
  const INTERVAL_MS = 66;
  const GRID = { long: 85, levels: [2, 4, 2], rate: 5, tile: 24 };
  const QR = { chunk: 500, ecc: 'L', rgb: true };

  let host = null, root = null, sFile = null, sess = null, sGrid = null, player = null;
  const fmtB = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB';
  const $ = id => root.getElementById(id);

  // 面板放在 Shadow DOM 里：所在网页的样式进不来，面板在哪个网站上都长一样
  const CSS = `
  @font-face{font-family:"Doto";font-weight:900;src:url(data:font/woff2;base64,/*@FONT_DOTO*/) format("woff2")}
  :host{all:initial}
  .p{--paper:#eceef0;--sheet:#f8f9fa;--ink:#000;--ink2:#565d66;--ink3:#8b929b;--rule:#cdd2d8;--idle:#d6dae0;--bad:#d4373c;
    --sans:-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Microsoft YaHei UI","Microsoft YaHei","Noto Sans CJK SC",sans-serif;
    position:fixed;z-index:2147483647;top:20px;right:20px;width:420px;max-height:calc(100vh - 40px);overflow:auto;box-sizing:border-box;
    background:var(--paper);color:var(--ink);border:1px solid var(--rule);border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.25);
    font:14px/1.6 var(--sans);-webkit-font-smoothing:antialiased;color-scheme:light}
  @media (prefers-color-scheme:dark){ .p{--paper:#000;--sheet:#121315;--ink:#f2f4f6;--ink2:#a0a7b0;--ink3:#6c737c;--rule:#26292d;--idle:#2a2e33;--bad:#ff6369;color-scheme:dark} }
  .p *{box-sizing:border-box;font:inherit;color:inherit}
  [hidden]{display:none!important}
  :focus-visible{outline:2px solid var(--ink);outline-offset:2px}
  .hd{display:flex;align-items:center;gap:10px;padding:14px 14px 12px 16px;cursor:move;user-select:none}
  .mark{position:relative;width:18px;height:18px;border:3px solid var(--ink)}
  .mark::after{content:"";position:absolute;inset:3px;background:var(--ink)}
  .ttl{flex:1;font:900 18px/1 "Doto",ui-monospace,monospace}
  .ib{height:32px;min-width:32px;padding:0 10px;display:grid;place-items:center;border:1px solid var(--rule);border-radius:999px;background:var(--sheet);cursor:pointer;font-size:13px;line-height:1}
  .bd{display:grid;gap:12px;padding:0 14px 14px}
  .compose{display:grid;gap:12px}
  .sheet{background:var(--sheet);border:1px solid var(--rule);border-radius:12px}
  .sheet:focus-within{border-color:var(--ink)}
  .p textarea:focus-visible{outline:none}
  textarea{display:block;width:100%;height:110px;resize:vertical;padding:12px 14px 6px;border:0;background:transparent;outline:none;font:14px/1.6 var(--sans)}
  textarea::placeholder{color:var(--ink3)}
  .frow{display:flex;align-items:center;gap:8px;padding:6px 14px 12px}
  .pick{position:relative;font-size:13px;font-weight:600;text-decoration:underline;text-underline-offset:3px;cursor:pointer}
  .pick input{position:absolute;width:1px;height:1px;opacity:0}
  .fname{font-size:12px;color:var(--ink2);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .x{border:0;background:none;color:var(--ink3);cursor:pointer;font-size:12px}
  .opts{border-top:1px solid var(--rule);padding:12px 14px 14px;display:grid;gap:12px}
  .seg{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .seg label{position:relative;display:grid;gap:6px;padding:10px 12px;border:1.5px solid var(--rule);border-radius:9px;cursor:pointer;background:var(--paper)}
  .seg input{position:absolute;opacity:0;pointer-events:none}
  .seg b{font-weight:650}
  .seg small{font-size:12px;color:var(--ink2);line-height:1.4}
  .seg label:has(input:checked){border-color:var(--ink)}
  .seg label:has(input:checked)::after{content:"";position:absolute;right:10px;top:12px;width:8px;height:8px;background:var(--ink)}
  .pal{display:flex;flex-wrap:wrap;gap:2px}
  .pal i{width:7px;height:7px;box-shadow:inset 0 0 0 1px var(--rule)}
  .sw{display:flex;align-items:center;gap:10px;cursor:pointer}
  .sw span{flex:1}
  .sw small{display:block;font-size:12px;color:var(--ink2)}
  .sw input{appearance:none;-webkit-appearance:none;width:40px;height:24px;margin:0;border-radius:999px;background:var(--idle);position:relative;cursor:pointer}
  .sw input::before{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:var(--sheet);box-shadow:0 1px 2px rgba(0,0,0,.3);transition:transform .2s}
  .sw input:checked{background:var(--ink)}
  .sw input:checked::before{transform:translateX(16px)}
  .btn{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:0 16px;border:1.5px solid var(--ink);border-radius:999px;background:transparent;font-weight:600;cursor:pointer}
  .btn:disabled{opacity:.3;pointer-events:none}
  .btn.solid{background:var(--ink);color:var(--paper)}
  .btn.wide{width:100%;min-height:46px}
  .stage{position:relative;background:#fff;border-radius:6px;padding:16px;display:flex;justify-content:center;box-shadow:0 0 0 1px var(--rule)}
  canvas{display:block;max-width:100%;image-rendering:pixelated}
  .bar{display:flex;align-items:center;gap:8px;margin-top:10px}
  .idx{flex:1;font-size:13px;color:var(--ink2)}
  .bar .btn{min-height:36px;padding:0 14px}
  .info{margin-top:10px;font-size:13px}
  .info small{display:block;font-size:12px;color:var(--ink3)}
  .err{color:var(--bad);font-size:12px}
  .err:empty{display:none}
  /* 播放中收起输入区，码在最上面 */
  .p.playing .compose{display:none}
  /* 全屏：白底播放画面，只留底部控制条 */
  .p.full{top:0;right:0;left:0!important;bottom:0;width:auto;max-height:none;border-radius:0;border:0;background:#fff;color-scheme:light}
  .p.full .hd,.p.full .compose,.p.full .info,.p.full .idx{display:none}
  .p.full .bd{height:100%;padding:16px 16px 80px;display:flex;flex-direction:column}
  .p.full .out{flex:1;display:flex;flex-direction:column}
  .p.full .stage{flex:1;align-items:center;box-shadow:none}
  .p.full .bar{position:fixed;left:50%;transform:translateX(-50%);bottom:18px;padding:4px;border-radius:999px;background:#000;margin:0}
  .p.full .bar .btn{border:0;color:#fff;background:transparent}
  `;

  function openPanel() {
    if (host) { const p = $('p'); p.hidden = !p.hidden; return; }
    host = document.createElement('qrstream-sender');
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${CSS}</style>
    <div class="p" id="p">
      <div class="hd" id="hd"><span class="mark"></span><span class="ttl">QRStream</span>
        <button class="ib" id="qrx-edit" hidden>换内容</button><button class="ib" id="qrx-close" title="关闭（Alt+Q 再打开）" aria-label="关闭">✕</button></div>
      <div class="bd">
        <div class="compose">
          <div class="sheet">
            <textarea id="qrx-text" aria-label="要发送的内容" placeholder="输入或粘贴要发送的文字。截图可以直接粘贴。"></textarea>
            <div class="frow"><label class="pick">选择文件<input type="file" id="qrx-file"></label><span class="fname" id="qrx-file-name"></span><button class="x" id="qrx-clearfile" hidden>移除</button></div>
            <div class="opts">
              <div class="seg" role="radiogroup" aria-label="码型">
                <label><input type="radio" name="k" id="qrx-grid" checked><b>彩格码</b><span class="pal" id="palG"></span><small>最快。用 QRStream 接收</small></label>
                <label><input type="radio" name="k" id="qrx-qr"><b>二维码</b><span class="pal" id="palQ"></span><small>旧版接收端也能读</small></label>
              </div>
              <label class="sw"><span>压缩<small>无损，能省 5% 以上才启用</small></span><input type="checkbox" id="qrx-z" checked></label>
            </div>
          </div>
          <button class="btn solid wide" id="qrx-gen">开始播放</button>
          <div class="err" id="qrx-err"></div>
        </div>
        <div class="out" id="qrx-out" hidden>
          <div class="stage"><canvas id="qrx-cv" width="300" height="300"></canvas></div>
          <div class="bar"><span class="idx" id="qrx-idx"></span><button class="btn" id="qrx-pause">暂停</button><button class="btn solid" id="qrx-full2">全屏</button></div>
          <div class="info" id="qrx-info"></div>
        </div>
      </div>
    </div>`;
    document.documentElement.appendChild(host);
    for (const [id, gl] of [['palG', [0, 85, 170, 255]], ['palQ', [0, 255]]])
      for (const r of [0, 255]) for (const g of gl) for (const b of [0, 255]) { const i = document.createElement('i'); i.style.background = `rgb(${r},${g},${b})`; $(id).appendChild(i); }

    player = new QXS.Player($('qrx-cv'), {
      box: () => $('p').classList.contains('full') ? { w: innerWidth - 24, h: innerHeight - 110 } : { w: 390, h: 390 },
      dpr: () => window.devicePixelRatio || 1,
      interval: () => INTERVAL_MS,
      onShow: label => { $('qrx-idx').textContent = label; },
    });
    const sync = () => { $('qrx-pause').textContent = player.playing ? '暂停' : '继续播放'; };
    const full = on => { if (!sess) return; $('p').classList.toggle('full', on); $('qrx-full2').textContent = on ? '退出全屏' : '全屏'; requestAnimationFrame(() => player.render()); };
    $('qrx-close').onclick = () => { player.stop(); sync(); full(false); $('p').hidden = true; };
    $('qrx-edit').onclick = () => { const on = $('p').classList.toggle('playing'); $('qrx-edit').textContent = on ? '换内容' : '收起'; };
    $('qrx-full2').onclick = () => full(!$('p').classList.contains('full'));
    $('qrx-cv').ondblclick = () => full(!$('p').classList.contains('full'));
    $('qrx-file').onchange = e => setFile(e.target.files[0] || null);
    $('qrx-clearfile').onclick = () => { setFile(null); $('qrx-file').value = ''; };
    $('qrx-text').addEventListener('paste', e => {
      const it = [...(e.clipboardData?.items || [])].find(i => i.kind === 'file');
      if (!it) return;
      e.preventDefault();
      const f = it.getAsFile();
      setFile(new File([f], f.name && f.name !== 'image.png' ? f.name : 'pasted.' + ((f.type.split('/')[1]) || 'bin'), { type: f.type }));
    });
    $('qrx-gen').onclick = () => { $('qrx-err').textContent = ''; generate().catch(err => { $('qrx-err').textContent = err.message; }).finally(() => { $('qrx-gen').disabled = false; sync(); }); };
    $('qrx-pause').onclick = () => { if (!sess) return; player.playing ? player.stop() : player.play(); sync(); };
    window.addEventListener('keydown', e => { if (e.key === 'Escape' && $('p').classList.contains('full')) full(false); });
    dragable($('p'), $('hd'));
  }

  function setFile(f) { sFile = f; $('qrx-file-name').textContent = f ? `${f.name} · ${fmtB(f.size)}` : ''; $('qrx-clearfile').hidden = !f; }
  function showInfo() {
    const per = sGrid ? sGrid.per : 3, secs = (sess.K + 2) / per * INTERVAL_MS / 1000, el = $('qrx-info');
    el.dataset.k = sess.K; el.dataset.per = per; el.dataset.ver = sGrid ? 'grid' : sess.type;
    const t = secs < 60 ? `约 ${Math.max(1, Math.ceil(secs))} 秒` : `约 ${(secs / 60).toFixed(1)} 分钟`;
    el.innerHTML = `${fmtB(sess.meta.len)}${sess.meta.z ? '（已压缩）' : ''}，满速 ${fmtB(1000 / INTERVAL_MS * per * sess.C)}/秒，${t}传完。`
      + `<small>接收端收到任意 ${sess.K + 2} 块就能还原。会话 ${sess.sid}</small>`;
  }

  function dragable(box, handle) {
    let sx, sy, ox, oy, on = false;
    handle.addEventListener('mousedown', e => {
      if (e.target.tagName === 'BUTTON' || box.classList.contains('full')) return;
      on = true; sx = e.clientX; sy = e.clientY; const r = box.getBoundingClientRect(); ox = r.left; oy = r.top; e.preventDefault();
    });
    window.addEventListener('mousemove', e => { if (!on) return;
      box.style.left = ox + e.clientX - sx + 'px'; box.style.top = oy + e.clientY - sy + 'px'; box.style.right = 'auto'; });
    window.addEventListener('mouseup', () => { on = false; });
  }

  async function generate() {
    player.stop();
    $('qrx-gen').disabled = true;
    await new Promise(r => setTimeout(r, 0));
    const { meta, data } = await QXS.prepareInput({ file: sFile, text: $('qrx-text').value, compress: $('qrx-z').checked });
    let s, grid = null;
    if ($('qrx-grid').checked) {
      const L = QXG.makeLayout(QXG.profile(GRID));
      s = new QXS.SenderSession(meta, data, { chunk: L.C, qr: false });
      grid = new QXG.GridFramer(s, L);
    } else s = new QXS.SenderSession(meta, data, { chunk: QR.chunk, ecc: QR.ecc });
    const per = grid ? grid.per : 3, mins = (s.K + 2) / per * INTERVAL_MS / 60000;
    if (mins > 3 && !confirm(`内容较大，至少需要约 ${mins.toFixed(1)} 分钟。继续？`)) return;
    sess = s; sGrid = grid;
    $('qrx-out').hidden = false; $('p').classList.add('playing'); $('qrx-edit').hidden = false; $('qrx-edit').textContent = '换内容';
    player.load(sess, QR.rgb, grid);
    showInfo();
    player.play();
  }

  if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand('打开 QRStream 发送面板 (Alt+Q)', openPanel);
  window.addEventListener('keydown', e => { if (e.altKey && (e.key === 'q' || e.key === 'Q' || e.code === 'KeyQ')) { e.preventDefault(); openPanel(); } });
})();
/* jshint ignore:end */
