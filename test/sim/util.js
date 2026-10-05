/* 仿真共用：造会话、存 PNG */
'use strict';
global.QX = global.QX || require('../../src/codec.js');
const fs = require('fs');
const { PNG } = require('pngjs');
function fakeSession(C, K = 1000, sid = 'SIM1') {
  return { sid, K, len: K * C, crc: '0BADF00D', C, payload: s => { const u = new Uint8Array(C); let x = (s * 2654435761) >>> 0 || 1;
    for (let i = 0; i < C; i++) { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; u[i] = x & 255; } return u; } };
}
function savePNG(file, px, w, h) { const p = new PNG({ width: w, height: h }); p.data = Buffer.from(px.buffer, px.byteOffset, px.length); fs.writeFileSync(file, PNG.sync.write(p)); }
module.exports = { fakeSession, savePNG };
