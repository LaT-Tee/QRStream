const { rowBits, FountainDecoder } = require('../../src/codec.js');
// 统计接收开销：收到多少帧才满秩（数据用 4 字节占位）。理论值 ≈ 1.6 帧
for (const [K, loss, start] of [[100,0.1,0],[100,0,100],[1000,0.1,0],[1000,0,1000]]) {
  let tot = 0, mx = 0; const N = K > 500 ? 30 : 300;
  for (let t = 0; t < N; t++) {
    const sid = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, '0');
    const d = new FountainDecoder(sid, K, 4); let got = 0;
    for (let s = start; !d.done; s++) { if (Math.random() < loss) continue; got++; d.add(s, new Uint8Array(4)); }
    tot += got - K; mx = Math.max(mx, got - K);
  }
  console.log(`K=${K} loss=${loss} start=${start}: 平均多收 ${(tot / N).toFixed(2)} 帧, 最坏 ${mx}`);
  if (tot / N > 3) { console.error('平均开销异常'); process.exit(1); }
}
