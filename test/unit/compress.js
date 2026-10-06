// 压缩：deflate / LZMA 自动择优；LZMA 结果能被解码线程用的解压器（lzma-d）逐字节还原（文本和非 UTF-8 二进制都要对）
'use strict';
global.QX = require('../../src/codec.js');
const { prepareInput } = require('../../src/sender-core.js');
const fs = require('fs'), vm = require('vm');
// 按解码线程的方式加载 lzma-d-min.js（this.LZMA）
const ctx = { setTimeout, setImmediate, clearTimeout }; vm.runInNewContext(fs.readFileSync(require.resolve('lzma/src/lzma-d-min.js'), 'utf8'), ctx);
const decode = data => { const r = ctx.LZMA.decompress(data); return typeof r === 'string' ? new TextEncoder().encode(r) : Uint8Array.from(r, x => x & 255); };
let fail = 0;
const check = (c, m) => { console.log((c ? '  ✔ ' : '  ✘ ') + m); if (!c) fail++; };
(async () => {
  const csv = Array.from({ length: 3000 }, (_, i) => `${i},2026-10-${(i % 28) + 1},用户${i % 97},${(i * 37 % 1000) / 10},上海市`).join('\n');
  const bin = new Uint8Array(150000); for (let i = 0; i < bin.length; i++) bin[i] = ((i / 600 | 0) * 7 + (i % 600 < 300 ? 0x80 : 0xC3)) & 255;   // 大量非法 UTF-8 序列
  const jpegLike = new Uint8Array(60000); let x = 7; for (let i = 0; i < jpegLike.length; i++) { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; jpegLike[i] = x & 255; }
  const cases = [
    ['表格文本', { text: csv }, 'lzma'],
    ['二进制（非 UTF-8）', { file: { name: 'a.bmp', type: 'image/bmp', arrayBuffer: async () => bin.buffer } }, 'lzma'],
    ['已压缩数据（随机字节）', { file: { name: 'a.jpg', type: 'image/jpeg', arrayBuffer: async () => jpegLike.buffer } }, false],
  ];
  for (const [name, inp, want] of cases) {
    const raw = inp.text != null ? new TextEncoder().encode(inp.text) : new Uint8Array(await inp.file.arrayBuffer());
    const { meta, data } = await prepareInput({ ...inp, compress: true });
    let ok = meta.z === want;
    if (meta.z === 'lzma') { const back = decode(data); ok = ok && back.length === raw.length && back.every((v, i) => v === raw[i]); }
    if (!meta.z) ok = ok && data.length === raw.length;
    check(ok, `${name}：${raw.length} → ${data.length} 字节，选用 ${meta.z || '不压缩'}${meta.z === 'lzma' ? '，解压逐字节一致' : ''}`);
  }
  if (fail) { console.error(`\n❌ ${fail} 项失败`); process.exit(1); }
})();
