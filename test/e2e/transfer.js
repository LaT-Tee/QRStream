// 端到端：发送页生成帧 → ffmpeg 合成摄像头视频 → Chromium 假摄像头 → 接收页还原；含 RGB 与断点续传
const path = require('path'), fs = require('fs');
const { serve } = require('../helpers/serve');
const { WEB, TMP, sleep, randText, captureSender, makeVideo, receive, check, finish } = require('../helpers/common');

(async () => {
  const srv = await serve(WEB, 8765);
  const URL = 'http://localhost:8765/';
  try {
    for (const rgb of [false, true]) {
      const name = rgb ? 'RGB' : '黑白', text = randText(5000);
      const cap = await captureSender(URL, text, { rgb });
      console.log(`\n[${name}] K=${cap.K} QRv${cap.ver} 帧数=${cap.frames.length}  ${cap.frames[0].label}`);
      const r = await receive(URL, makeVideo(cap.frames, rgb ? 'rgb' : 'mono'));
      console.log('  ' + r.status + '\n  ' + r.perf);
      check(r.ok && r.text === text, `${name}：还原文本与原文一致`);
      check(!r.logs.length, `${name}：无页面错误 ${r.logs.join(' | ')}`);
      await r.close();
    }

    console.log('\n[断点续传] 第一次只给前 5 个源帧；第二次只给冗余帧');
    const text = randText(6000);
    const cap = await captureSender(URL, text);
    const ud = path.join(TMP, 'profile');
    const r1 = await receive(URL, makeVideo(cap.frames.slice(0, 5), 'part1'), { userDataDir: ud, waitDone: false, timeout: 9000 });
    console.log('  第一次：' + r1.status);
    await r1.page.click('#stopBtn'); await sleep(1200); await r1.close();
    const r2 = await receive(URL, makeVideo(cap.frames.slice(cap.K), 'part2'), { userDataDir: ud });
    console.log('  第二次：' + r2.status + '\n  ' + r2.log);
    check(/ 5 \//.test(r1.status) || /：5 \//.test(r1.status), '第一次停在 5/K');
    check(r2.ok && r2.text === text && /恢复 5 帧/.test(r2.log), '第二次 = 本机恢复 5 帧 + 冗余帧 → 还原成功');
    await r2.close();
  } finally { srv.close(); }
  finish();
})();
