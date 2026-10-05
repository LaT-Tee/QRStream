// 纯解码器测试：随机丢帧、中途加入、只缺少量块等场景，并统计开销与耗时
const QX = require('../../src/codec.js');
const { crc32n, hex, rowBits, FountainDecoder } = QX;

function makeSender(bytes, C) {
  const K = Math.ceil(bytes.length / C);
  const padded = new Uint8Array(K * C); padded.set(bytes);
  const blocks = Array.from({ length: K }, (_, i) => new Uint32Array(padded.buffer, i * C, C >>> 2));
  const sid = 'T' + Math.random().toString(36).slice(2, 5).toUpperCase().padEnd(3, '0');
  function payload(seq) {
    if (seq < K) return padded.slice(seq * C, (seq + 1) * C);
    const bits = rowBits(sid, seq, K), out = new Uint32Array(C >>> 2);
    for (let w = 0; w < bits.length; w++) { let x = bits[w];
      while (x) { const b = 31 - Math.clz32(x & -x); x &= x - 1; const s = blocks[(w << 5) + b]; for (let j = 0; j < out.length; j++) out[j] ^= s[j]; } }
    return new Uint8Array(out.buffer);
  }
  return { K, sid, padded, payload, crc: hex(crc32n(bytes), 8) };
}

function run(name, size, C, { loss = 0.1, startAt = 0 } = {}) {
  const data = new Uint8Array(size); for (let i = 0; i < size; i++) data[i] = (i * 2654435761 >>> 13) & 255;
  const s = makeSender(data, C), dec = new FountainDecoder(s.sid, s.K, C);
  let shown = 0, got = 0, t0 = Date.now(), maxStep = 0;
  for (let seq = startAt; !dec.done; seq++) {
    shown++;
    if (Math.random() < loss) continue;
    got++;
    const t = performance.now(); dec.add(seq, s.payload(seq)); maxStep = Math.max(maxStep, performance.now() - t);
    if (shown > s.K * 5) throw new Error(name + ' 没收敛');
  }
  const t2 = performance.now(); dec.solve(); const tSolve = performance.now() - t2;
  const ok = hex(crc32n(dec.packet(size)), 8) === s.crc;
  console.log(`${name.padEnd(28)} K=${String(s.K).padStart(5)}  收到=${got}  多收=${got - s.K}  播放=${shown}  ` +
    `总耗时=${Date.now() - t0}ms  单帧最慢=${maxStep.toFixed(1)}ms  回代=${tSolve.toFixed(0)}ms  ${ok ? 'CRC OK' : 'CRC FAIL'}`);
  if (!ok) process.exit(1);
}

run('无丢帧', 50000, 500, { loss: 0 });
run('丢 10%', 50000, 500, { loss: 0.1 });
run('丢 40%', 50000, 500, { loss: 0.4 });
run('丢 10%，K=1', 300, 500, { loss: 0.1 });
run('错过系统帧(全冗余)', 200000, 500, { loss: 0.1, startAt: 400 });
run('丢 10%，K=2000', 1000000, 500, { loss: 0.1 });
run('错过系统帧，K=2000', 1000000, 500, { loss: 0.1, startAt: 2000 });

// 先收到冗余帧、后补源帧（中途加入后循环回到开头 / 用「只播帧」补发）：每个收到的源帧都要立刻把对应块标成已知
// （已经被冗余帧消元解出的块，源帧再到属于正常的 useless，跳过）
function lateSources(K, C, nRed, seed = 1) {
  const data = new Uint8Array(K * C - 7); for (let i = 0; i < data.length; i++) data[i] = (i * 2246822519 >>> 11) & 255;
  const s = makeSender(data, C), dec = new FountainDecoder(s.sid, s.K, C);
  const how = new Array(s.K).fill(0), take = () => { for (const [c, h] of dec.newly) { if (how[c]) throw new Error('块重复确定 ' + c); how[c] = h; } };
  for (let seq = s.K; seq < s.K + nRed; seq++) { dec.add(seq, s.payload(seq)); take(); }
  const order = [...Array(s.K).keys()];
  let x = seed * 2654435761 >>> 0 || 1;
  for (let i = order.length - 1; i > 0; i--) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; const j = x % (i + 1), t = order[i]; order[i] = order[j]; order[j] = t; }
  for (const seq of order) {
    if (dec.done) break;
    if (how[seq]) continue;
    const r = dec.add(seq, s.payload(seq)); take();
    if (r !== 'useful' || how[seq] !== 's') throw new Error(`源帧 ${seq} 没有立即确定（${r}）`);
  }
  if (!dec.done) throw new Error('lateSources 没收敛');
  dec.solve();
  const ok = hex(crc32n(dec.packet(data.length)), 8) === s.crc;
  console.log(`${('先冗余 ' + nRed + ' 帧再补源帧').padEnd(28)} K=${String(s.K).padStart(5)}  源帧确定=${how.filter(h => h === 's').length}  ${ok ? 'CRC OK' : 'CRC FAIL'}`);
  if (!ok) process.exit(1);
}
for (let seed = 1; seed <= 20; seed++) { lateSources(64, 100, 20, seed); lateSources(70, 100, 69, seed); }
lateSources(300, 100, 150);

if (process.argv.includes('--big')) {
  run('丢 10%，K=10000', 5000000, 500, { loss: 0.1 });
  run('错过系统帧，K=6000', 3000000, 500, { loss: 0.1, startAt: 6000 });
}
