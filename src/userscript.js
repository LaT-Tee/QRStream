// ==UserScript==
// @name         QRStream Sender
// @namespace    qrstream.sender
// @version      /*@VERSION*/
// @license      MIT
// @description  Alt+Q 打开面板。喷泉码 + 32 位帧校验 + 固定 QR 版本 + 可选 RGB 三通道（×3）。依赖全部内联，离线可用
// @match        *://*/*
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @noframes
// ==/UserScript==

/* 本脚本内联了 qrcode-generator（MIT, https://github.com/kazuhikoarase/qrcode-generator）
 *
 * 协议 QX4（接收端兼容 QX3）：
 *   QX4:<SID>:<K>:<LEN>:<CRC32>:<SEQ>:<FCK32>:<BASE45载荷>*
 *   SEQ<K 系统帧；SEQ>=K 冗余帧 = rowBits(SID,SEQ,K) 选中源块的 XOR（GF(2) 随机线性喷泉码）
 *   RGB 模式：一张图的 R/G/B 三个通道各放一个 QR（3 个连续 SEQ），版本固定所以三层完全对齐
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
/*@SENDER_CORE*/
  })(NS);
  const QXS = NS.QXS;

  let root = null, sFile = null, sess = null, player = null;

  function css() { return `
    #qrx-root{position:fixed;z-index:2147483647;top:20px;right:20px;width:580px;max-height:calc(100vh - 40px);overflow:auto;
      background:#fff;color:#222;border:1px solid #888;border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.35);
      font:13px/1.5 "Segoe UI","Meiryo","Microsoft YaHei",sans-serif;padding:10px}
    #qrx-root *{box-sizing:border-box;font:inherit;color:inherit}
    #qrx-root h3{margin:0 0 6px;font-weight:bold;font-size:15px;display:flex;justify-content:space-between;cursor:move}
    #qrx-root textarea{width:100%;height:100px;border:1px solid #aaa;border-radius:4px;padding:4px;font-family:Consolas,monospace;background:#fff}
    #qrx-root .row{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;margin:6px 0}
    #qrx-root input[type=number]{width:70px;border:1px solid #aaa;border-radius:3px;padding:1px 3px;background:#fff}
    #qrx-root input[type=text]{border:1px solid #aaa;border-radius:3px;padding:1px 3px;background:#fff}
    #qrx-root select{border:1px solid #aaa;background:#fff}
    #qrx-root button{border:1px solid #666;background:#f2f2f2;border-radius:4px;padding:2px 10px;cursor:pointer}
    #qrx-root button.primary{background:#0a64d8;color:#fff;border-color:#0a64d8}
    #qrx-root canvas#qrx-cv{display:block;margin:6px auto;background:#fff;max-width:100%;image-rendering:pixelated}
    #qrx-root .info{font-size:12px;color:#555;white-space:pre-wrap}
    #qrx-root .big{text-align:center;font-size:16px;font-weight:bold}
    #qrx-root #qrx-file-name{color:#0a64d8}
    #qrx-root.qrx-full{top:0;right:0;left:0;bottom:0;width:auto;max-height:none;border-radius:0}
    #qrx-root.qrx-full .qrx-ctl{display:none}
    #qrx-root.qrx-full canvas#qrx-cv{max-height:calc(100vh - 80px);width:auto}
  `; }
  function el(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
  const $ = id => root.querySelector('#' + id);
  const fmtB = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB';

  function openPanel() {
    if (root) { root.style.display = root.style.display === 'none' ? '' : 'none'; return; }
    const style = document.createElement('style'); style.textContent = css(); document.head.appendChild(style);
    root = el(`
    <div id="qrx-root">
      <h3><span>📤 QRStream Sender</span><span><button id="qrx-full" title="全屏">⛶</button> <button id="qrx-close">×</button></span></h3>
      <div class="qrx-ctl">
        <textarea id="qrx-text" placeholder="输入文本（支持换行）……&#10;或选择文件 / 在此 Ctrl+V 粘贴图片"></textarea>
        <div class="row"><input type="file" id="qrx-file"><span id="qrx-file-name"></span><button id="qrx-clearfile">清除文件</button></div>
        <div class="row">
          <label>每帧字节 <input type="number" id="qrx-chunk" value="500" min="52" max="1900" step="4"></label>
          <label>纠错 <select id="qrx-ecc"><option selected>L</option><option>M</option><option>Q</option><option>H</option></select></label>
          <label>间隔ms <input type="number" id="qrx-ms" value="66" min="34" step="2" title="对齐屏幕刷新；摄像头 30 帧/秒时 66ms 每张都能被完整拍到一次，太短会两帧混在一张照片里"></label>
          <label>尺寸px <input type="number" id="qrx-px" value="520" min="200" step="40"></label>
        </div>
        <div class="row">
          <label><input type="checkbox" id="qrx-rgb" checked> RGB 三通道（×3）</label>
          <label><input type="checkbox" id="qrx-z" checked> 压缩（deflate，原样无损）</label>
        </div>
        <div class="row">
          <button class="primary" id="qrx-gen">生成并播放</button>
          <button id="qrx-pause">▶ 播放</button>
          <button id="qrx-prev">◀</button><button id="qrx-next">▶</button>
          <button id="qrx-restart">⏮ 从头</button>
          <label>只播帧 <input type="text" id="qrx-only" placeholder="如 3,7,10-12" style="width:110px"></label>
          <button id="qrx-apply">应用</button>
        </div>
      </div>
      <canvas id="qrx-cv" width="520" height="520"></canvas>
      <div class="big" id="qrx-idx"></div>
      <div class="info" id="qrx-info"></div>
    </div>`);
    document.body.appendChild(root);

    player = new QXS.Player($('qrx-cv'), {
      size: () => root.classList.contains('qrx-full') ? Math.min(innerWidth - 20, innerHeight - 80) : (+$('qrx-px').value || 520),
      interval: () => +$('qrx-ms').value || 66,
      onShow: label => { $('qrx-idx').textContent = label; },
    });
    const sync = () => { $('qrx-pause').textContent = player.playing ? '⏸ 暂停' : '▶ 播放'; };
    $('qrx-close').onclick = () => { player.stop(); sync(); root.style.display = 'none'; };
    $('qrx-full').onclick = () => { root.classList.toggle('qrx-full'); player.render(); };
    $('qrx-file').onchange = e => setFile(e.target.files[0] || null);
    $('qrx-clearfile').onclick = () => { setFile(null); $('qrx-file').value = ''; };
    $('qrx-text').addEventListener('paste', e => {
      const it = [...(e.clipboardData?.items || [])].find(i => i.kind === 'file');
      if (!it) return;
      e.preventDefault();
      const f = it.getAsFile();
      setFile(new File([f], f.name && f.name !== 'image.png' ? f.name : 'pasted.' + ((f.type.split('/')[1]) || 'bin'), { type: f.type }));
    });
    $('qrx-gen').onclick = () => generate().catch(err => { info('❌ ' + err.message); }).finally(() => { $('qrx-gen').disabled = false; sync(); });
    $('qrx-pause').onclick = () => { if (!sess) return; player.playing ? player.stop() : player.play(); sync(); };
    $('qrx-prev').onclick = () => { player.stop(); sync(); player.step(-1); };
    $('qrx-next').onclick = () => { player.stop(); sync(); player.step(1); };
    $('qrx-restart').onclick = () => { if (!sess) return; player.setOnly(null); $('qrx-only').value = ''; player.restart(); };
    $('qrx-apply').onclick = () => { if (!sess) return; const l = QXS.parseRanges($('qrx-only').value, sess.K); player.setOnly(l.length ? l : null); };
    $('qrx-rgb').onchange = () => { if (sess) { player.setRGB($('qrx-rgb').checked); showInfo(); } };
    $('qrx-px').onchange = () => player.render();
    $('qrx-cv').ondblclick = () => { root.classList.toggle('qrx-full'); player.render(); };
    dragable(root, root.querySelector('h3'));
  }

  function setFile(f) { sFile = f; $('qrx-file-name').textContent = f ? `📎 ${f.name}（${fmtB(f.size)}）` : ''; }
  function info(s) { $('qrx-info').textContent = s; }
  function showInfo() {
    const ms = +$('qrx-ms').value || 66, per = $('qrx-rgb').checked ? 3 : 1, fps = 1000 / ms;
    info(`会话: ${sess.sid}　类型: ${sess.meta.t}${sess.meta.z ? '(已压缩)' : ''}　原始 ${fmtB(sess.meta.len)} → 包 ${fmtB(sess.len)}
源块 K=${sess.K}　QR v${sess.type}（固定）　纠错 ${sess.ecc}　${fps.toFixed(1)} 码/秒${per === 3 ? `（RGB ×3 = ${(fps * 3).toFixed(1)} 帧/秒）` : ''}
接收端收到任意约 ${sess.K + 2} 帧即可还原（理想约 ${((sess.K + 2) / per / fps).toFixed(1)} 秒），漏帧无需等下一轮`);
  }

  function dragable(box, handle) {
    let sx, sy, ox, oy, on = false;
    handle.addEventListener('mousedown', e => {
      if (e.target.tagName === 'BUTTON' || box.classList.contains('qrx-full')) return;
      on = true; sx = e.clientX; sy = e.clientY; const r = box.getBoundingClientRect(); ox = r.left; oy = r.top; e.preventDefault();
    });
    window.addEventListener('mousemove', e => { if (!on) return;
      box.style.left = ox + e.clientX - sx + 'px'; box.style.top = oy + e.clientY - sy + 'px'; box.style.right = 'auto'; });
    window.addEventListener('mouseup', () => on = false);
  }

  async function generate() {
    player.stop();
    $('qrx-gen').disabled = true;
    info('处理中…'); await new Promise(r => setTimeout(r, 0));
    const { meta, data } = await QXS.prepareInput({ file: sFile, text: $('qrx-text').value, compress: $('qrx-z').checked });
    const s = new QXS.SenderSession(meta, data, { chunk: +$('qrx-chunk').value || 500, ecc: $('qrx-ecc').value });
    const ms = +$('qrx-ms').value || 66;
    if (s.K > 3000 && !confirm(`共 ${s.K} 帧，至少约 ${(s.K * ms / 60000 / ($('qrx-rgb').checked ? 3 : 1)).toFixed(1)} 分钟。建议先压缩图片/调低质量。继续？`)) { info('已取消'); return; }
    sess = s; $('qrx-chunk').value = s.C; $('qrx-only').value = '';
    player.load(sess, $('qrx-rgb').checked);
    showInfo();
    player.play();
  }

  if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand('打开 QRStream Sender (Alt+Q)', openPanel);
  window.addEventListener('keydown', e => { if (e.altKey && (e.key === 'q' || e.key === 'Q')) { e.preventDefault(); openPanel(); } });
})();
