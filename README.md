<div align="center">

# QRStream

**用一串动态二维码，在没有网络、没有 USB、没有剪贴板的环境之间传文件。**

全程不联网、不配对、不经过任何服务器，数据只存在于两台设备之间。

纯浏览器 · 完全离线 · 喷泉码抗丢帧 · 可选 RGB 三通道 · 收发二合一 PWA + 油猴发送端

[![CI](https://github.com/<your-name>/qrstream/actions/workflows/ci.yml/badge.svg)](https://github.com/<your-name>/qrstream/actions/workflows/ci.yml)
![License: MIT](https://img.shields.io/badge/license-MIT-green)
![PWA](https://img.shields.io/badge/PWA-offline-blue)
![No server](https://img.shields.io/badge/server-none-lightgrey)

*Air-gapped file transfer over animated QR codes — fountain-coded, offline-first PWA (iOS / Android / desktop) plus a userscript sender.*

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
| 单张图承载帧数 | 1 帧（黑白码） | **3 帧**（RGB 三通道彩色码） |
| 漏帧处理 | 顺序轮播，漏一帧要等下一轮 | **喷泉码**，收够任意 K+≈2 帧即可还原 |
| 离线能力 | 要联网打开网页或安装 App | **PWA 离线应用** + 电脑上**双击 `index.html`** 即用 |
| 识别引擎 | 单一 JS 引擎 | **zxing-wasm** 为主，jsQR 兜底 |
| 中断恢复 | 刷新就从头开始 | **IndexedDB 断点续传** |
| 数据完整性 | 无校验或只校验一部分 | **逐帧 + 整包双重 CRC32** |

## 特性

| | |
|---|---|
| 🌊 **喷泉码，漏帧不用等下一轮** | GF(2) 随机线性喷泉码：先播一轮源帧，之后无限播放冗余帧。接收端收到**任意** K+≈2 帧即可还原，不存在"缺第 37 帧要再等一整轮"的问题 |
| 🎨 **RGB 三通道（可选）** | R/G/B 三个通道各放一个二维码，一张图同时传 3 帧，理论吞吐 ×3 |
| 📦 **高密度编码** | Base45 + QR Alphanumeric 模式，同样数据比 Base64 + Byte 模式小约 2–4 个 QR 版本 |
| ✈️ **真离线 PWA** | 首次联网打开后整个应用缓存在本机；飞行模式下从主屏幕图标直接打开。识别引擎（zxing-wasm）内联，不依赖任何 CDN |
| 🔁 **断点续传** | 接收进度实时写入 IndexedDB，刷新页面、切走 App、锁屏后都能接着收（未完成的会话保留 3 天） |
| ⚡ **不卡界面** | 识别和解码分别在两个 Web Worker 里；摄像头按 `requestVideoFrameCallback` 取帧，有背压 |
| 🛡️ **两级校验** | 每帧 32 位 CRC（防误识别污染解码）+ 整包 CRC32 + 解压后长度校验 |
| 📄 **原样无损** | 文件按原始字节发送，不改格式、不缩放；默认 deflate 压缩，省 5% 以上才采用 |
| 🧩 **两种发送端** | PWA 内置发送页（手机→电脑也行）；油猴脚本可在任意网页上 Alt+Q 打开 |
| 🖱️ **双击即用** | 构建产物已提交到仓库，电脑上双击 `dist/web/index.html` 就能离线运行，可随 U 盘携带 |

**更多细节：**

- 接收端识别模式可选「自动 / 黑白 / RGB ×3」，黑白码同样兼容；进度网格实时区分「源帧收到 / 冗余帧补出 / 未收到」
- 同一会话 QR 版本固定，播放过程中二维码尺寸不跳变，便于对焦
- 双击二维码全屏播放；支持暂停、逐帧前进/后退、从头重播
- 可调每帧字节、播放间隔、纠错等级（L / M / Q / H）、二维码尺寸；接收端可调解码分辨率，设备支持时可调摄像头变焦
- 支持拖放文件、在文本框里直接粘贴截图；接收完成后可下载，或通过系统分享面板保存
- 传输期间自动保持屏幕常亮
- Android 上长按主屏幕图标可直接进入「接收」或「发送」

## 它是怎么工作的

```
 发送端                                                              接收端
 ┌──────────────┐    deflate     ┌─────────┐  K 个 C 字节源块  ┌──────────────────────┐
 │ 文件 / 文本   │ ─────────────► │ 数据包   │ ───────────────► │ 系统帧 SEQ 0..K-1     │
 └──────────────┘                └─────────┘                  │ 冗余帧 SEQ ≥ K (XOR)  │
                                                              └──────────┬───────────┘
                                         Base45 → QR（黑白 或 RGB×3）→ 屏幕   │
                                                                         ▼
 ┌───────────┐  CRC/解压  ┌───────────────┐  增量高斯消元  ┌─────────────┐  zxing-wasm  📷
 │ 文件/文本  │ ◄───────── │ 回代还原数据包 │ ◄──────────── │ Decode Worker │ ◄────────── Scan Worker
 └───────────┘            └───────────────┘   (IndexedDB)  └─────────────┘
```

完整的帧格式、`rowBits` 伪随机算法、解码步骤见 **[docs/PROTOCOL.md](docs/PROTOCOL.md)**，可据此实现兼容的第三方收发端。

**一帧长这样：**

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
- 访问你部署好的地址（见[部署](#部署)），或本地运行 `npm run serve` 后打开 `http://localhost:8080`。
- **安装到主屏幕**（推荐，离线可用）：
  - **iPhone / iPad**：Safari 打开 → 分享 → **添加到主屏幕** → 从主屏幕图标打开一次，等右上角出现 **可离线**。
  - **Android**：Chrome 打开 → 菜单 → **安装应用**。
  - **电脑**：Chrome / Edge 地址栏右侧的"安装"图标。

> ⚠️ iOS 上，主屏幕 App 与 Safari **各有一份独立缓存**，从主屏幕图标打开过、看到「可离线」后才能断网使用。

### 2. 传输

1. **接收端**（通常是手机）：「📥 接收」→ 📷 开始扫描，把取景框对准发送端屏幕。
2. **发送端**：「📤 发送」页（或电脑上的油猴脚本 Alt+Q）→ 输入文本或选文件 → **生成并播放**。
3. 进度条走满后自动还原：文本可复制，图片可预览/保存，文件可下载或「分享 → 存到文件」。

中途中断？直接重新扫描同一个会话，进度会从本机恢复。

## 从源码构建

**要求**：Node.js ≥ 18（无需 Python 或其它工具链）。

```bash
git clone https://github.com/<your-name>/qrstream.git
cd qrstream
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

之后每次推送到 `main` 都会自动 构建 → 单元测试 → 部署。

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

## 参数调优

| 参数 | 默认 | 说明 |
|---|---|---|
| 每帧字节 | 500 | 越大 → 帧越少，但 QR 版本越高、模块越小、越难识别。屏幕大且近：800–1000；手机屏幕或远距离：300–400 |
| 间隔 ms | 50 | 每张码显示时长。接收端摄像头约 30 帧/秒（33 ms），所以下限 34；50 ms 让每张码至少被拍到 1 次以上，漏拍的由喷泉码兜底。接收端「识别 码/秒」明显偏低时调大到 67/100 |
| 纠错 | L | 屏幕传输几乎没有遮挡，L 最省空间；有反光/摩尔纹时试 M |
| RGB 三通道 | 开 | 每张图承载 3 帧。依赖屏幕色彩和摄像头色彩分离；若接收端识别率明显变差（反光、老屏幕、偏色），关掉改用黑白 |
| 压缩 (deflate) | 开 | 对文本、CSV、源码、BMP 等效果显著；JPEG/ZIP 等已压缩格式通常省不到 5%，会自动按原样发送 |
| 解码尺寸（接收端） | 640 | 码在画面中很小/很远时调到 800–1000；想省电用 480 |

**吞吐上限参考**（理论值；30 fps 摄像头会漏拍一部分，实际取决于屏幕、摄像头和光照）：

| 配置 | 每秒有效数据 | 100 KB 约需 |
|---|---|---|
| 黑白，500 B/帧，50 ms | ≤ 10 KB/s | ≥ 10 s |
| RGB，500 B/帧，50 ms（默认） | ≤ 30 KB/s | ≥ 3.5 s |

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
npm test                          # 单元测试：喷泉码正确性/开销、RGB 串色模拟识别
npm run bench                     # 大 K（10000）压力测试

# 端到端（需要 ffmpeg 和 Playwright Chromium）
npx playwright install chromium
npm run test:e2e
```

端到端测试会：用 PWA 发送页逐帧截图 → ffmpeg 合成带模糊、噪声和 YUV420 色度抽样的"摄像头视频" → 作为 Chromium 假摄像头喂给接收页，验证黑白 / RGB / 断点续传 / jsQR 回退 / 油猴脚本；并在一个**模拟 Cloudflare Pages 重定向规则**的服务器上验证断网冷启动。

## 项目结构

```
src/
├── app.html            PWA 页面模板（UI、摄像头、主线程逻辑）
├── codec.js            协议编解码：Base45、CRC32、rowBits、帧解析、喷泉码解码器（收发共用）
├── sender-core.js      发送端核心：输入预处理、会话/分块、QR 生成、RGB 合成、播放器（PWA 与油猴共用）
├── scan-core.js        单帧识别：黑白 / RGB 通道分离 / 串色补偿
├── scan-worker.js      识别 Worker（zxing-wasm → jsQR 回退）
├── decode-worker.js    解码 Worker（增量消元、回代、校验解压、IndexedDB 续传）
├── sw.js               Service Worker 模板
├── userscript.js       油猴脚本模板
└── static/_headers     Cloudflare Pages 响应头
scripts/build.mjs       构建脚本
test/unit/              单元测试
test/e2e/               端到端测试（Playwright + ffmpeg）
test/helpers/           本地静态服务器（可模拟 Cloudflare 重定向）、测试工具
docs/PROTOCOL.md        帧协议规范
```

## 常见问题

<details>
<summary><b>飞行模式下打不开？</b></summary>

1. 确认右上角显示过 **可离线**（点它会显示说明）。
2. iOS：主屏幕 App 和 Safari 缓存是分开的，要从**主屏幕图标**联网打开一次。
3. 长期不打开的网页 App 可能被 iOS 清理缓存，联网打开一次即可恢复。
4. 自己部署时，确认 `sw.js` 与 `index.html` 在同一目录且通过 HTTPS 访问。

</details>

<details>
<summary><b>双击 index.html 打开，和部署版有什么区别？</b></summary>

功能一样，只是浏览器对 `file://` 页面不启用 Service Worker：不能「安装到主屏幕」，右上角显示「本地文件」而不是「可离线」——但文件本身就在本机，断网照样能打开。手机上请用部署地址。

</details>

<details>
<summary><b>更新了部署，手机上还是旧版？</b></summary>

Service Worker 采用"缓存优先 + 后台更新"：新版本在**第一次联网打开时下载，第二次打开时生效**。

</details>

<details>
<summary><b>一直识别不到 / 识别很慢？</b></summary>

- 让二维码占取景框（绿色虚线）的 60–90%，避免屏幕反光；
- 调低发送端「每帧字节」或调大「间隔 ms」；
- 码很小时把接收端「解码尺寸」调到 800/1000；
- 查看接收端底部的引擎名：显示 `jsQR（备用）` 说明 WASM 没加载成功，速度会慢很多。

</details>

<details>
<summary><b>还差最后几块一直收不齐？</b></summary>

正常情况下继续播放冗余帧即可，任意新帧都有效。也可以把接收端列出的缺失编号（如 `3,7,10-12`）填进发送端「只播帧」定向补发。

</details>

<details>
<summary><b>最大能传多大？</b></summary>

单次会话上限 K = 20000 帧（500 B/帧时约 10 MB）。实际受时间限制：默认设置（RGB、50 ms）下 1 MB 理论上约 35 秒，黑白约 1.7 分钟。

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

"QR Code" 是株式会社デンソーウェーブ（DENSO WAVE INCORPORATED）的注册商标。
