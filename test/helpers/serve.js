/* 极简静态服务器（零依赖）。
 *   cfRedirect=true 时模拟 Cloudflare Pages 的"漂亮 URL"：/index.html、/foo.html 会 308 到无扩展名地址。
 * 命令行：node test/helpers/serve.js <目录> [端口] [--cf]
 */
const http = require('http'), fs = require('fs'), path = require('path');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.json': 'application/json', '.y4m': 'video/x-yuv4mpeg' };

function serve(dir, port, { cfRedirect = false } = {}) {
  dir = path.resolve(dir);
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (cfRedirect && p.endsWith('.html')) {
      res.writeHead(308, { Location: p.endsWith('/index.html') ? p.slice(0, -10) : p.slice(0, -5) }); return res.end();
    }
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(dir, p);
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(r => srv.listen(port, '127.0.0.1', () => r(srv)));
}
module.exports = { serve };

if (require.main === module) {
  const [dir = 'dist/web', port = '8080'] = process.argv.slice(2).filter(a => !a.startsWith('--'));
  serve(dir, +port, { cfRedirect: process.argv.includes('--cf') }).then(() =>
    console.log(`http://localhost:${port}/  (${path.resolve(dir)})　localhost 属于安全上下文，摄像头和 Service Worker 都能用`));
}
