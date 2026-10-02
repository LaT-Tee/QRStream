#!/usr/bin/env node
/**
 * 构建脚本：把 src/ 组装成可直接部署的静态站点和油猴脚本。
 *
 *   dist/web/                    ← 部署这个目录（任何 HTTPS 静态托管均可）
 *     index.html                 ← 收发二合一，zxing-wasm / jsQR / qrcode-generator 全部内联
 *     sw.js                      ← Service Worker（浏览器要求独立文件）
 *     manifest.webmanifest, icon.png
 *   dist/qrstream-sender.user.js ← 油猴（Tampermonkey / Violentmonkey）发送端
 *
 * 用法：node scripts/build.mjs        （或 npm run build）
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const src = p => fs.readFileSync(path.join(ROOT, 'src', p), 'utf8');
const mod = p => require.resolve(p, { paths: [ROOT] });
const OUT = path.join(ROOT, 'dist'), WEB = path.join(OUT, 'web');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(WEB, { recursive: true });

const rawDeflateB64 = buf => zlib.deflateRawSync(buf, { level: 9 }).toString('base64');
function safe(s, what) {
  // 内联进 <script> 时不能出现 </script
  if (/<\/script/i.test(s)) throw new Error(`${what} 含有 </script，不能直接内联`);
  return s;
}
function fill(tpl, parts, what) {
  for (const [k, v] of Object.entries(parts)) {
    if (!tpl.includes(k)) throw new Error(`${what} 缺少占位符 ${k}`);
    tpl = tpl.split(k).join(v);
  }
  return tpl;
}

/* ---------- 第三方库 ---------- */
const qrlib = fs.readFileSync(mod('qrcode-generator/qrcode.js'), 'utf8');
// zxing-wasm 的 exports 不暴露 package.json，从入口往上找包目录
function pkgDir(name, entry) {
  let d = path.dirname(mod(entry));
  while (!fs.existsSync(path.join(d, 'package.json')) || JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8')).name !== name) {
    const up = path.dirname(d); if (up === d) throw new Error('找不到 ' + name); d = up;
  }
  return d;
}
const zxDir = pkgDir('zxing-wasm', 'zxing-wasm/reader');
const zxJs = fs.readFileSync(path.join(zxDir, 'dist/iife/reader/index.js'), 'utf8');
const zxWasm = fs.readFileSync(path.join(zxDir, 'dist/reader/zxing_reader.wasm'));
const jsqr = fs.readFileSync(mod('jsqr/dist/jsQR.js'));

const codec = src('codec.js'), sender = src('sender-core.js'), scanCore = src('scan-core.js');
const parts = {
  '/*@QRCODE_LIB*/': safe(qrlib, 'qrcode-generator'),
  '/*@CODEC*/': safe(codec, 'codec.js'),
  '/*@SENDER_CORE*/': safe(sender, 'sender-core.js'),
};

/* ---------- index.html ---------- */
const html = fill(src('app.html'), {
  ...parts,
  '/*@ZXING_JS*/': safe(zxJs, 'zxing-wasm'),
  '/*@ZXING_WASM_B64*/': rawDeflateB64(zxWasm),
  '/*@JSQR_B64*/': rawDeflateB64(jsqr),
  '/*@SCAN_WORKER*/': safe(scanCore + '\n' + src('scan-worker.js'), 'scan-worker'),
  '/*@DECODE_WORKER*/': safe(codec + '\n' + src('decode-worker.js'), 'decode-worker'),
  '/*@VERSION*/': pkg.version,
}, 'app.html');
const BANNER = `<!-- QRStream v${pkg.version} · MIT License
     Bundled third-party code: zxing-wasm (MIT) wrapping zxing-cpp (Apache-2.0), jsQR (Apache-2.0),
     qrcode-generator (MIT). Full texts: THIRD_PARTY_LICENSES.txt -->\n`;
fs.writeFileSync(path.join(WEB, 'index.html'), html.replace('<!DOCTYPE html>\n', '<!DOCTYPE html>\n' + BANNER));

/* ---------- 第三方许可证全文（Apache-2.0 要求随分发附带） ---------- */
const lic = [
  ['zxing-wasm ' + require(path.join(pkgDir('zxing-wasm', 'zxing-wasm/reader'), 'package.json')).version + ' (MIT) — https://github.com/Sec-ant/zxing-wasm', path.join(zxDir, 'LICENSE')],
  ['zxing-cpp (Apache-2.0, compiled into zxing_reader.wasm) — https://github.com/zxing-cpp/zxing-cpp', path.join(path.dirname(mod('jsqr/dist/jsQR.js')), '..', 'LICENSE')],
  ['jsQR (Apache-2.0) — https://github.com/cozmo/jsQR', path.join(path.dirname(mod('jsqr/dist/jsQR.js')), '..', 'LICENSE')],
  ['qrcode-generator (MIT) — https://github.com/kazuhikoarase/qrcode-generator', null],
];
const MIT_QRGEN = `Copyright (c) 2009 Kazuhiko Arase

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and
to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
`;
fs.writeFileSync(path.join(WEB, 'THIRD_PARTY_LICENSES.txt'), lic.map(([t, f]) =>
  `${'='.repeat(78)}\n${t}\n${'='.repeat(78)}\n` + (f ? fs.readFileSync(f, 'utf8') : MIT_QRGEN)).join('\n'));

/* ---------- manifest ---------- */
fs.writeFileSync(path.join(WEB, 'manifest.webmanifest'), JSON.stringify({
  name: 'QRStream', short_name: 'QRStream', lang: 'zh',
  description: '离线二维码流传输（喷泉码 + RGB 三通道），发送/接收二合一',
  start_url: './', scope: './', display: 'standalone', orientation: 'any',
  background_color: '#111111', theme_color: '#111111',
  icons: [{ src: 'icon.png', sizes: '512x512', type: 'image/png', purpose: 'any' }],
  shortcuts: [{ name: '接收', url: './?tab=recv' }, { name: '发送', url: './?tab=send' }],
}, null, 2));

/* ---------- 静态附加文件（Cloudflare Pages 的 _headers 等；其它托管会忽略） ---------- */
for (const f of fs.readdirSync(path.join(ROOT, 'src/static'))) fs.copyFileSync(path.join(ROOT, 'src/static', f), path.join(WEB, f));

/* ---------- sw.js（缓存版本 = 所有文件内容的哈希，内容变了自动更新） ---------- */
const precache = ['./', 'manifest.webmanifest', 'icon.png'];
const h = crypto.createHash('sha256');
for (const f of ['index.html', ...precache.slice(1)]) h.update(fs.readFileSync(path.join(WEB, f)));
const cacheVer = h.digest('hex').slice(0, 10);
fs.writeFileSync(path.join(WEB, 'sw.js'), fill(src('sw.js'), { '/*@VERSION*/': cacheVer, '/*@FILES*/': JSON.stringify(precache) }, 'sw.js'));

/* ---------- 油猴脚本 ---------- */
// 设置环境变量 USERSCRIPT_URL（脚本的公开下载地址）后，会写入 @updateURL/@downloadURL，油猴可自动更新
let us = fill(src('userscript.js'), { ...parts, '/*@VERSION*/': pkg.version }, 'userscript.js');
if (process.env.USERSCRIPT_URL) us = us.replace('// @noframes', `// @noframes\n// @updateURL    ${process.env.USERSCRIPT_URL}\n// @downloadURL  ${process.env.USERSCRIPT_URL}`);
fs.writeFileSync(path.join(OUT, 'qrstream-sender.user.js'), us);

/* ---------- 汇总 ---------- */
const list = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? list(path.join(d, e.name)) : [path.join(d, e.name)]);
for (const f of list(OUT)) console.log(path.relative(ROOT, f).padEnd(42), (fs.statSync(f).size / 1024).toFixed(1).padStart(8), 'KB');
console.log(`version ${pkg.version} · cache ${cacheVer}`);
