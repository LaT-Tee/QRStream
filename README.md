<div align="center">

# QRStream

**用一串动态二维码，在没有网络、没有 USB、没有剪贴板的环境之间传文件。**

全程不联网、不配对、不经过任何服务器，数据只存在于两台设备之间。

纯浏览器 · 完全离线 · 喷泉码抗丢帧 · 自研彩格码（抗混帧、最多 64 色）· 收发二合一 PWA + 油猴发送端

[![CI](https://github.com/LaT-Tee/QRStream/actions/workflows/ci.yml/badge.svg)](https://github.com/LaT-Tee/QRStream/actions/workflows/ci.yml)
![License: MIT](https://img.shields.io/badge/license-MIT-green)
![PWA](https://img.shields.io/badge/PWA-offline-blue)
![No server](https://img.shields.io/badge/server-none-lightgrey)

*Air-gapped file transfer over animated QR codes — fountain-coded, offline-first PWA (iOS / Android / desktop) plus a userscript sender.*

**[👉 在线使用：qrtransmit.pages.dev](https://qrtransmit.pages.dev/)**

</div>

---

## 目录

- [为什么选 QRStream](#为什么选-qrstream)
- [特性](#特性)
- [它是怎么工作的](#它是怎么工作的)
- [快速开始](#快速开始)
- [从源码构建](#从源码构建)
- [部署](#部署)
- [油猴发送端](#油猴发送端)
- [参数调优](#参数调优)
- [兼容性](#兼容性)
- [测试](#测试)
- [项目结构](#项目结构)
- [常见问题](#常见问题)
- [许可证与致谢](#许可证与致谢)

## 为什么选 QRStream

| 能力 | 常见二维码传输工具 | QRStream |
|---|---|---|
| 单张图承载 | 1 帧（黑白码） | **彩格码**：一张图 13 块、最多 64 色；或 QR **RGB 三通道** 3 帧 |
| 屏幕与摄像头不同步（混帧） | 一张照片混进两帧就整码作废 | 彩格码**分块独立校验**，只丢过渡带里的块；换帧对齐屏幕刷新 |
| 漏帧处理 | 顺序轮播，漏一帧要等下一轮 | **喷泉码**，收够任意 K+≈2 帧即可还原 |
| 离线能力 | 要联网打开网页或安装 App | **PWA 离线应用** + 电脑上**双击 `index.html`** 即用 |
| 识别引擎 | 单一 JS 引擎 | **zxing-wasm** 为主，jsQR 兜底 |
| 中断恢复 | 刷新就从头开始 | **IndexedDB 断点续传** |
| 数据完整性 | 无校验或只校验一部分 | **逐帧 + 整包双重 CRC32** |

## 特性

| | |
|---|---|
| 🌊 **喷泉码，漏帧不用等下一轮** | GF(2) 随机线性喷泉码：先播一轮源帧，之后无限播放冗余帧。接收端收到**任意** K+≈2 帧即可还原，不存在"缺第 37 帧要再等一整轮"的问题 |
| 🟪 **彩格码（默认）** | 自定义彩色格子码：四角定位 + 时钟线 + 导频校色 + **LDPC 软判决**。一张图分成 13 个独立小块，混帧/局部模糊只丢坏掉的块。仿真中同样格子大小下单张比 QR RGB 多装 42%，详见 [仿真报告](docs/SIMULATION.md) |
| 🎨 **QR RGB 三通道（兼容）** | R/G/B 三个通道各放一个二维码，一张图同时传 3 帧；油猴脚本和旧版接收端用这个 |
| 📦 **高密度编码** | Base45 + QR Alphanumeric 模式，同样数据比 Base64 + Byte 模式小约 2–4 个 QR 版本 |
| ✈️ **真离线 PWA** | 首次联网打开后整个应用缓存在本机；飞行模式下从主屏幕图标直接打开。识别引擎（zxing-wasm）内联，不依赖任何 CDN |
| 🔁 **断点续传** | 接收进度实时写入 IndexedDB，刷新页面、切走 App、锁屏后都能接着收（未完成的会话保留 3 天） |
| ⚡ **不卡界面** | 识别和解码分别在两个 Web Worker 里；摄像头按 `requestVideoFrameCallback` 取帧，有背压 |
| 🛡️ **两级校验** | 每帧 32 位 CRC（防误识别污染解码）+ 整包 CRC32 + 解压后长度校验 |
| 📄 **原样无损** | 文件按原始字节发送，不改格式、不缩放；默认压缩：自动在 **LZMA（7-Zip 同款算法）** 和 deflate 里选更小的，省 5% 以上才采用；全部离线运行 |
| 🧩 **两种发送端** | PWA 内置发送页（手机→电脑也行）；油猴脚本可在任意网页上 Alt+Q 打开 |
| 🖱️ **双击即用** | 构建产物已提交到仓库，电脑上双击 `dist/web/index.html` 就能离线运行，可随 U 盘携带 |

**更多细节：**

- 接收端自动识别彩格码和二维码（黑白、RGB 都行）；块拼图实时区分「直接收到 / 冗余补出 / 还没收到」，识别率偏低时会提示怎么调整
- 同一会话 QR 版本固定，播放过程中二维码尺寸不跳变，便于对焦
- 双击二维码全屏播放；支持暂停、逐帧前进/后退、从头重播
- 只有「码型」「压缩」两项设置，其余参数固定为仿真选出的最优值；设备支持时接收端可调摄像头变焦
- 发送页键盘操作：空格暂停/继续，←/→ 逐张，Home 从头，F 全屏
- 浅色 / 深色主题跟随系统
- 支持拖放文件、在文本框里直接粘贴截图；接收完成后可下载，或通过系统分享面板保存
- 传输期间自动保持屏幕常亮
- Android 上长按主屏幕图标可直接进入「接收」或「发送」

## 它是怎么工作的

```
 发送端                                                              接收端
 ┌──────────────┐  LZMA/deflate  ┌─────────┐  K 个 C 字节源块  ┌──────────────────────┐
 │ 文件 / 文本   │ ─────────────► │ 数据包   │ ───────────────► │ 系统帧 SEQ 0..K-1     │
 └──────────────┘                └─────────┘                  │ 冗余帧 SEQ ≥ K (XOR)  │
                                                              └──────────┬───────────┘
                     彩格码（分块 + 卷积码）或 Base45 → QR（黑白/RGB×3）→ 屏幕 │
                                                                         ▼
 ┌───────────┐  CRC/解压  ┌───────────────┐  增量高斯消元  ┌─────────────┐  zxing-wasm  📷
 │ 文件/文本  │ ◄───────── │ 回代还原数据包 │ ◄──────────── │ Decode Worker │ ◄────────── Scan Worker
 └───────────┘            └───────────────┘   (IndexedDB)  └─────────────┘
```

完整的帧格式、`rowBits` 伪随机算法、解码步骤、彩格码版面与信道编码见 **[docs/PROTOCOL.md](docs/PROTOCOL.md)**，可据此实现兼容的第三方收发端。彩格码的参数是怎么用仿真定下来的，见 **[docs/SIMULATION.md](docs/SIMULATION.md)**。

**QR 模式下一帧长这样**（彩格码是二进制块，见协议第 7 节）：

```
QX4:7BAJ:14:6801:9A3F0C21:23:5E7D11B0:<Base45 载荷>*
    │    │  │    │        │  └ 本帧 CRC32
    │    │  │    │        └ 帧序号（≥K 为冗余帧）
    │    │  │    └ 整包 CRC32
    │    │  └ 数据包字节数
    │    └ 源块数 K
    └ 会话 ID
```

## 快速开始

### 1. 打开应用

- **电脑，最省事**：直接双击仓库里的 `dist/web/index.html`，无需部署、无需联网。所有代码与 WebAssembly 都已内联在这一个文件里，右上角会显示 **本地文件**。
  > 本地文件方式不会注册 Service Worker，也不能「安装」；用来**发送**完全没问题。接收需要摄像头，取决于浏览器是否允许本地页面使用摄像头（Chrome / Edge 会弹窗询问），不行时请改用部署地址或 `npm run serve`。
- **在线版**：直接打开 **<https://qrtransmit.pages.dev/>**（手机推荐这个）。也可以访问你自己部署的地址（见[部署](#部署)），或本地运行 `npm run serve` 后打开 `http://localhost:8080`。
- **安装到主屏幕**（推荐，离线可用）：
  - **iPhone / iPad**：Safari 打开 → 分享 → **添加到主屏幕** → 从主屏幕图标打开一次，等右上角出现 **离线可用**。
  - **Android**：Chrome 打开 → 菜单 → **安装应用**。
  - **电脑**：Chrome / Edge 地址栏右侧的"安装"图标。

> ⚠️ iOS 上，主屏幕 App 与 Safari **各有一份独立缓存**，从主屏幕图标打开过、看到「离线可用」后才能断网使用。

### 2. 传输

1. **接收端**（通常是手机）：「接收」→ 开始扫描，把取景框对准发送端屏幕。
2. **发送端**：「发送」页（或电脑上的油猴脚本 Alt+Q）→ 输入文本或选文件 → **开始播放**（建议全屏）。
3. 块拼图填满后自动还原，并显示**用时和平均传输速度**（按还原后的大小计），以及压缩后实际传了多少。文本可复制，图片可预览/保存（iPhone：长按图片 →「存储到照片」，或「分享」→「存储图像」），文件可下载或「分享 → 存到文件」。

中途中断？直接重新扫描同一个会话，进度会从本机恢复。

## 从源码构建

**要求**：Node.js ≥ 18（无需 Python 或其它工具链）。

```bash
git clone https://github.com/LaT-Tee/QRStream.git
cd QRStream
npm ci
npm run build
```

产物（`dist/` 已提交到仓库，不想自己构建的话可以直接用；改了 `src/` 后记得重新 `npm run build` 并一起提交）：

```
dist/
├── web/                          ← 部署这个目录
│   ├── index.html                ← 收发二合一（zxing-wasm / jsQR / qrcode-generator 已内联，约 770 KB），可直接双击打开
│   ├── sw.js                     ← Service Worker（浏览器规定必须是独立文件）
│   ├── manifest.webmanifest
│   ├── icon.png                  ← 应用图标（唯一一个，manifest / apple-touch-icon / favicon 共用）
│   ├── _headers                  ← Cloudflare Pages 响应头（其它托管会忽略）
│   └── THIRD_PARTY_LICENSES.txt
└── qrstream-sender.user.js       ← 油猴脚本
```

本地预览：

```bash
npm run serve            # http://localhost:8080 （localhost 属于安全上下文，摄像头和 Service Worker 可用）
```

构建脚本 [`scripts/build.mjs`](scripts/build.mjs) 做的事：把 `src/` 下的模板与模块拼装，WASM 和 jsQR 以 raw-deflate + Base64 内联，生成图标与 manifest，并以全部文件内容的哈希作为 Service Worker 缓存版本号（内容变了用户端自动更新）。

## 部署

`dist/web/` 是纯静态文件，放到**任何 HTTPS 静态托管**都能用（摄像头 API 和 Service Worker 都要求 HTTPS）。

### A. Cloudflare Pages（网页上传，最简单）

1. `npm run build`
2. Cloudflare 控制台 → **Workers & Pages** → 创建 / 选择 Pages 项目 → **Create deployment**
3. 把 `dist/web` 文件夹拖进去 → Deploy

### B. Cloudflare Pages（命令行）

```bash
npm run build
npx wrangler pages deploy dist/web --project-name=<你的项目名>
```

### C. GitHub Actions 自动部署到 Cloudflare Pages

仓库已包含 [`.github/workflows/deploy-cloudflare.yml`](.github/workflows/deploy-cloudflare.yml)。在仓库 **Settings → Secrets and variables → Actions** 配置：

| 类型 | 名称 | 说明 |
|---|---|---|
| Secret | `CLOUDFLARE_API_TOKEN` | API Token，权限 *Account → Cloudflare Pages → Edit* |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | 账户 ID |
| Variable | `CF_PAGES_PROJECT` | Pages 项目名 |

之后每次推送到 `main` 都会自动 构建 → 单元测试 → 部署。未配置 `CF_PAGES_PROJECT` 时该 workflow 会自动跳过，不会报错。

### D. GitHub Pages

仓库 **Settings → Pages → Source** 选 **GitHub Actions**，然后在 Actions 页手动运行 **Deploy to GitHub Pages**（[workflow](.github/workflows/deploy-github-pages.yml)）。

### E. 自建服务器 / 内网（Nginx 示例）

```nginx
server {
    listen 443 ssl http2;
    server_name qr.example.internal;
    root /var/www/qrstream;            # 拷入 dist/web 的内容

    location = /sw.js  { add_header Cache-Control "no-cache"; }
    location = /index.html { add_header Cache-Control "no-cache"; }
    location ~* \.webmanifest$ { types { application/manifest+json webmanifest; } }
}
```

> 内网证书需要被手机信任，否则 iOS 不允许使用摄像头和 Service Worker。

### 发布版本

```bash
npm version patch          # 或 minor / major，会同步 package.json 版本号
git push --follow-tags
```

推送 `v*` 标签会触发 [Release workflow](.github/workflows/release.yml)：自动构建并在 GitHub Release 附上 `qrstream-sender.user.js` 和 `qrstream-web-vX.Y.Z.zip`。

## 油猴发送端

适合"内容在电脑上、手机来接收"的场景，在任意网页上都能用。

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/)。
2. 打开 `dist/qrstream-sender.user.js`（或 Release 附件）→ 安装。
3. 任意网页按 **Alt + Q** 打开面板（也可从油猴菜单打开）。可以在文本框里直接 **Ctrl+V 粘贴截图**。

依赖已全部内联，**断网电脑也能安装和使用**。构建时设置环境变量 `USERSCRIPT_URL=<脚本公开地址>`，会写入 `@updateURL` / `@downloadURL`，油猴可自动检查更新（Release workflow 已默认设置）。

## 设置

只有两项可选，其余参数都固定为仿真选出的最优值（见 [仿真报告](docs/SIMULATION.md)）：提高单张信息量会让扫描变难，综合下来反而更慢，所以不再开放调节。

| 设置 | 默认 | 说明 |
|---|---|---|
| 码型 | 彩格码 | 彩格码最快、抗混帧；二维码兼容旧版接收端 |
| 压缩 | 开 | 无损。LZMA（7-Zip 同款，第 3 级）和 deflate 都试一遍取更小的；文本、CSV、源码、BMP 用 LZMA 通常比 deflate 再小 12%–37%。JPEG/ZIP 等省不到 5% 时自动按原样发送 |

固定参数：

| 参数 | 取值 | 为什么 |
|---|---|---|
| 换帧间隔 | 66 ms（60 Hz 下 4 次刷新） | 30 fps 摄像头下每张都能被完整拍到一次；更短会两帧混在一张照片里，旧版默认 50 ms 时约六成二维码因此作废 |
| 彩格码 | 85×85 格、16 色、LDPC 码率 3/4 | 竖拿手机时每格约 10 像素（1080p）；同等稳定性下单张最大 |
| 二维码 | RGB 三通道、每帧 500 字节、纠错 L | 与旧版一致 |
| 接收端摄像头 | 1080p | 比 720p 多一半像素，手机离屏幕远一些也能读，识别耗时相当 |

**吞吐参考**（仿真估算：摄像头 30 fps、曝光 10 ms、手机竖拿码占取景框 85%；实际取决于屏幕、摄像头和光照）：

| 配置 | 每秒有效数据 | 100 KB 约需 |
|---|---|---|
| 旧版默认：二维码 RGB，50 ms | ≈ 11 KB/s | ≈ 9 s |
| 二维码 RGB，66 ms | ≈ 22 KB/s | ≈ 4.5 s |
| **彩格码 标准，66 ms（默认）** | ≈ 32 KB/s | ≈ 3.1 s |
| 彩格码 极速，66 ms | ≈ 49 KB/s | ≈ 2 s |

## 兼容性

| 平台 | 接收 | 发送 | 备注 |
|---|---|---|---|
| iOS / iPadOS 16.4+ Safari、主屏幕 App | ✅ | ✅ | 需要 `DecompressionStream('deflate-raw')` |
| Android Chrome 103+ | ✅ | ✅ | 支持变焦滑条 |
| 桌面 Chrome / Edge 103+ | ✅ | ✅ | |
| 桌面 Firefox 113+ | ✅ | ✅ | |
| 油猴脚本 | — | ✅ | Tampermonkey / Violentmonkey |

自动化测试在 Chromium 上覆盖全部流程；其它平台以真机实测为准，遇到问题欢迎提 Issue。

识别引擎：优先 **zxing-wasm**（zxing-cpp 的 WebAssembly 版），加载失败时自动回退 **jsQR**。

## 测试

```bash
npm test                          # 单元测试：喷泉码正确性/开销、RGB 串色模拟识别、彩格码（仿真摄像头、混帧、转 90°）
npm run sim                       # 码型参数仿真 + 混帧时序模型（结果见 docs/SIMULATION.md）
npm run bench                     # 大 K（10000）压力测试

# 端到端（需要 ffmpeg 和 Playwright Chromium）
npx playwright install chromium
npm run test:e2e
```

端到端测试会：用 PWA 发送页逐帧截图 → ffmpeg 合成带模糊、噪声和 YUV420 色度抽样的"摄像头视频" → 作为 Chromium 假摄像头喂给接收页，验证黑白 / RGB / 彩格码（默认档及其它色阶、码率）/ **全部是混帧的视频** / 断点续传 / jsQR 回退 / 油猴脚本；并在一个**模拟 Cloudflare Pages 重定向规则**的服务器上验证断网冷启动。

## 项目结构

```
src/
├── app.html            PWA 页面模板（UI、摄像头、主线程逻辑）
├── codec.js            协议编解码：Base45、CRC32、rowBits、帧解析、喷泉码解码器（收发共用）
├── grid-code.js        彩格码：版面、LDPC / 卷积码、画帧、定位、校色、读帧（收发共用）
├── sender-core.js      发送端核心：输入预处理、会话/分块、QR 生成、RGB 合成、播放器（PWA 与油猴共用）
├── scan-core.js        单帧识别：黑白 / RGB 通道分离 / 串色补偿
├── scan-worker.js      识别 Worker（彩格码 + 二维码：zxing-wasm → jsQR 回退）
├── decode-worker.js    解码 Worker（增量消元、回代、校验解压、IndexedDB 续传）
├── sw.js               Service Worker 模板
├── userscript.js       油猴脚本模板
└── static/_headers     Cloudflare Pages 响应头
scripts/build.mjs       构建脚本
test/unit/              单元测试
test/e2e/               端到端测试（Playwright + ffmpeg）
test/sim/               屏幕→摄像头仿真、参数扫描、混帧时序模型
test/helpers/           本地静态服务器（可模拟 Cloudflare 重定向）、测试工具
docs/PROTOCOL.md        帧协议规范（含彩格码 QX5）
docs/SIMULATION.md      彩格码仿真报告
```

## 常见问题

<details>
<summary><b>飞行模式下打不开？</b></summary>

1. 确认右上角显示过 **离线可用**（点它会显示说明）。
2. iOS：主屏幕 App 和 Safari 缓存是分开的，要从**主屏幕图标**联网打开一次。
3. 长期不打开的网页 App 可能被 iOS 清理缓存，联网打开一次即可恢复。
4. 自己部署时，确认 `sw.js` 与 `index.html` 在同一目录且通过 HTTPS 访问。

</details>

<details>
<summary><b>双击 index.html 打开，和部署版有什么区别？</b></summary>

功能一样，只是浏览器对 `file://` 页面不启用 Service Worker：不能「安装到主屏幕」，右上角显示「本地文件」而不是「离线可用」——但文件本身就在本机，断网照样能打开。手机上请用部署地址。

</details>

<details>
<summary><b>更新了部署，手机上还是旧版？</b></summary>

Service Worker 采用"缓存优先 + 后台更新"：新版本在**第一次联网打开时下载，第二次打开时生效**。

</details>

<details>
<summary><b>一直识别不到 / 识别很慢？</b></summary>

- 让码占满取景框的四个角标，避开屏幕反光；
- 彩格码：看接收页的「块识别率」，偏低时靠近一些、拿稳；发送端全屏播放，码会更大；
- 实在读不出来，发送端换成「二维码」；
- 二维码时接收页底部会显示识别引擎：显示 `jsQR（备用）` 说明 WASM 没加载成功，速度会慢很多。

</details>

<details>
<summary><b>还差最后几块一直收不齐？</b></summary>

继续播放就行：之后播放的都是冗余数据，任意新块都有效，不用等某一块转回来。

</details>

<details>
<summary><b>最大能传多大？</b></summary>

单次会话上限 K = 20000 块（彩格码标准档每块 164 B，约 3.1 MB；二维码 500 B/帧时约 10 MB）。实际受时间限制：彩格码标准档 1 MB 约 33 秒。

</details>

## 安全与合规

- 所有处理都在本地浏览器完成，不向任何服务器上传数据；
- 二维码是**明文**传输，旁人拍到屏幕即可还原内容，敏感数据请先自行加密；
- 请在所在组织的信息安全规定允许的范围内使用。

## 许可证与致谢

本项目以 [MIT](LICENSE) 许可证发布。

构建产物内联了以下第三方代码，完整许可证见构建输出中的 `THIRD_PARTY_LICENSES.txt`：

- [zxing-wasm](https://github.com/Sec-ant/zxing-wasm)（MIT），封装 [zxing-cpp](https://github.com/zxing-cpp/zxing-cpp)（Apache-2.0）
- [jsQR](https://github.com/cozmo/jsQR)（Apache-2.0）
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator)（MIT）
- [LZMA-JS](https://github.com/LZMA-JS/LZMA-JS)（MIT），LZMA 压缩/解压
- [Doto](https://github.com/oliverlalan/Doto) 点阵字体（SIL OFL 1.1）

"QR Code" 是株式会社デンソーウェーブ（DENSO WAVE INCORPORATED）的注册商标。
