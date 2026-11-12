# 发布新版本

> 这一步是给维护者看的，普通用户不用管。

1. 改 `package.json` 的 `version`，在 `docs/CHANGELOG*.md` 写上更新内容。
2. 确认 `config.js`、`package.json`、README 里的仓库地址是 `ijijv/PixPeel`（“检查更新”靠它）。
3. 提交后打 tag 并推送：
   ```bash
   git tag v1.0.1 && git push origin v1.0.1
   ```
4. GitHub Actions（`.github/workflows/release.yml`）会在 Windows / macOS / Linux 上分别打包，并自动创建 Release、附上所有安装包、`xiaoji-animation.html` 与 `SHA256SUMS.txt`。
5. Linux 的 rpm 包依赖构建机的 rpm 版本，所以 CI 里 Linux 固定跑在 `ubuntu-24.04`；以后换更新的 runner，记得先确认 rpm 还能打出来（AppImage 和 deb 不受影响）。

改软件名只需改 `config.js` 与 `package.json`（`productName`、`appId`）；安装向导脚本和许可协议里也有名字，可全局替换一次。

## 只想在本机打一个平台

```bash
npm install
npm run dist:win        # Windows：x64 / ia32 / arm64 三个安装包
npm run dist:win64      # Windows：只要 64 位
npm run dist:mac        # macOS：dmg + zip
npm run dist:linux      # Linux：AppImage / deb / rpm
npm run dist:linux:core # Linux：只要 AppImage + deb
npm run dist:linux:rpm  # Linux：只要 rpm
```

产物都在 `dist/`。macOS 包只能在 macOS 上打，所以跨平台发布走 GitHub Actions。

国内网络下载 Electron 慢时：

```bash
# Windows PowerShell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"; $env:ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"; npm install
```

## 小剪动画（H5）

`editor/xiaoji-animation.html` 是单文件网页版动画编辑器（「小剪动画」），直接双击就能用，不用装任何东西。

- 改完直接覆盖 `editor/xiaoji-animation.html` 提交即可，CI 会把它一起打进每个 Release。
- 它和 PixPeel 桌面版之间的接口约定写在 [LINK-PROTOCOL.md](LINK-PROTOCOL.md)，改任何一边之前先看那份文档。
