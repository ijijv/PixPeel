<div align="center">

<img src="build/icon.png" width="96" alt="PixPeel">

# PixPeel

**Split every element out of a screenshot or image and save it as a transparent PNG sticker.**

English · [简体中文](README.md)

</div>

Press a hotkey → drag a region (or just click an element on screen) → elements are split automatically → pick the ones you want → saved to your library.
Everything runs locally. No uploads, no account.

## Features

- **Capture mode**: the screen dims, drag a region, elements are split automatically, pick and save as transparent PNGs.
- **Batch splitting**: import several images at once — each is split automatically and every element lands in one list; the images are tiled on a contact sheet so you can scan the whole batch and zoom in on the details.
- **Click-to-extract mode**: the screen stays as it is; hover highlights an element, click saves it straight to the library. Click as many as you like.
- **Import images**: button, drag & drop, or `Ctrl+V`.
- **Refine tools**: Pick / Wand / Lasso / AI pick (optional, downloads a small model on first use and falls back to the hf-mirror.com mirror in China); export layered SVG. Two AI models to choose from: **quantized** (default — small, fast, light on memory) and **full precision** (slightly more accurate, roughly twice the download and memory). Switch in Settings.
- **Board**: compose pictures from library elements or imported images; pick canvas size and transparent / solid background; move, scale, rotate, delete; export PNG / JPG or save back to the library.
- **Undo / zoom / shortcuts**: Ctrl+Z / Ctrl+Shift+Z on both the Extract page and the Board, wheel zoom, Space-drag pan; every shortcut is listed in Settings.
- **Enhance**: the library flags low-res items and upscales + sharpens them locally (classical resampling, not generative AI), saving a new `-HD` file and keeping the original. On top of Lanczos and unsharp masking it now does iterative back-projection and de-fringing, so edges look tighter and halos are less visible.
- **Edge smoothing**: on export, small gaps along the edge are filled, enclosed holes are closed and the alpha transition is smoothed — no more broken outlines or stair-stepped jaggies. Pure local math; can be switched off in Settings.
- **Library**: click to copy, reveal in folder, delete (to trash) — with a 3-second “Undo” prompt, and a one-click “Clear” (also undoable).
- **SVG Library / SVG Canvas**: layered SVGs live in their own SVG library. In the SVG canvas you can show/hide, move, scale, rotate and fade each layer, and export any single layer as a transparent PNG back into the element library. Marquee-select several layers, delete them together, drag the corners to scale, the top dot to rotate, and use the middle button to pan.
- **Link with the “小剪动画” video editor**: saved elements show up in its sticker library.
- **Drag images in**: drop an image from the desktop onto the working area, or straight onto a rail button — “Extract” splits it, “Library” stores it, “Board” takes it as a material, “SVG Library / SVG Canvas” treat it as SVG.
- Lives in the tray, optional launch at login, notification after saving (click it to open the library).
- 简体中文 / English, light / dark / system theme.

## Download

Get the file for your system from [Releases](https://github.com/lertone/PixPeel/releases):

| System | File | Notes |
| --- | --- | --- |
| Windows (not sure which one? take this) | `PixPeel-Setup-x.y.z-win.exe` | One installer that adapts to 64-bit / 32-bit / ARM, about 230 MB |
| Windows 64-bit (most PCs) | `PixPeel-Setup-x.y.z-win-x64.exe` | Wizard: license → install path → progress → optional desktop shortcut |
| Windows 32-bit | `PixPeel-Setup-x.y.z-win-ia32.exe` | Older PCs |
| Windows on ARM | `PixPeel-Setup-x.y.z-win-arm64.exe` | |
| macOS Apple Silicon | `PixPeel-x.y.z-mac-arm64.dmg` | a `.zip` of the same build is there too |
| macOS Intel | `PixPeel-x.y.z-mac-x64.dmg` | a `.zip` of the same build is there too |
| Linux 64-bit | `PixPeel-x.y.z-linux-x86_64.AppImage` / `…-linux-amd64.deb` / `…-linux-x86_64.rpm` | AppImage needs no install, deb for Debian / Ubuntu, rpm for Fedora / openSUSE |
| Linux ARM64 | `PixPeel-x.y.z-linux-arm64.AppImage` / `…-linux-arm64.deb` / `…-linux-aarch64.rpm` | Raspberry Pi and friends |

Each release includes `SHA256SUMS.txt` to verify downloads.

There is also a companion web animation editor, “小剪动画” — download it on its own, it works without installing PixPeel:
[xiaoji-animation.html](https://github.com/lertone/PixPeel/releases/latest/download/xiaoji-animation.html).

**Upgrading**: just run the new installer; it replaces the old version and keeps your settings and saved elements.

### First-run notes

The builds are not signed with a commercial code-signing certificate (those cost money), so the system shows “unknown publisher”. That is normal and does not mean the app is unsafe.

- **Windows**: SmartScreen may warn → “More info” → “Run anyway”.
- **macOS**: drag PixPeel to Applications. If it says the app is damaged / from an unverified developer, run `xattr -cr /Applications/PixPeel.app` or right-click → Open. Then enable **System Settings → Privacy & Security → Screen Recording** for PixPeel and restart it.
- **Linux**: `chmod +x PixPeel-*.AppImage && ./PixPeel-*.AppImage`. On Wayland, global hotkeys and screen capture are restricted by the system; an X11 session is recommended (see Known limitations).

## Usage

| Action | Default hotkey (⌘ instead of Ctrl on Mac) |
| --- | --- |
| Capture mode | `Ctrl + Shift + X` |
| Click-to-extract | `Ctrl + Alt + X` |

Both can be changed in **Settings**. In capture mode: click elements to select → `Enter` to save → the window tucks into the tray. In click-to-extract: scroll to adjust the range, `Esc` or right-click to finish.

Elements are saved to `Pictures/PixPeel` by default (changeable).

### Link with “小剪动画”

“小剪动画” is a separate companion tool (a local animation editor that runs in the browser) — it is a different program from PixPeel. You only need this step if you want to make animations with it; if all you want is splitting images into transparent stickers, ignore it entirely.

1. Download [xiaoji-animation.html](https://github.com/lertone/PixPeel/releases/latest/download/xiaoji-animation.html) — that is “小剪动画”, a single self-contained web page; double-click to open, nothing to install.
2. In PixPeel settings make sure “Let the editor read the library” is on (`127.0.0.1:17652`, this computer only).
3. Open the **locally downloaded xiaoji-animation.html**, go to “贴纸” on the left and click “Connect PixPeel desktop”.
4. Newly saved elements then appear automatically. You can also tick “自动同步” so anything you save in the desktop app lands in the sticker list right away.

> The online page may be blocked by the browser from reaching local addresses; use the downloaded file.

## Settings

Language, theme, save folder, both hotkeys, launch at login, close behavior (tray / quit), notifications, link service & port, update check on launch + manual check, changelog, privacy policy, license, project page, settings folder, reset to defaults.

## Run from source / build

Requires [Node.js](https://nodejs.org) 20+.

```bash
npm install
npm start            # run in development

npm run dist:win     # on Windows: x64 / ia32 / arm64 installers
npm run dist:mac     # on macOS: dmg + zip (x64 / arm64)
npm run dist:linux   # on Linux: AppImage / deb / rpm (x64 / arm64)
```

Output goes to `dist/`. macOS packages can only be built on macOS, so use GitHub Actions for cross-platform releases.

> The rpm package depends on the `rpmbuild` version of the build machine: newer rpm (6.x) dropped `xzmt` compression and the bundled electron-builder cannot produce it.
> For a reliable AppImage + deb, use `npm run dist:linux:core`; to build only the rpm, use `npm run dist:linux:rpm`.

The full release procedure lives in [docs/RELEASING.md](docs/RELEASING.md).

### Layout

```
main.js  preload.js  lib.js  server.js  config.js   main process & local link server
overlay.html  live.html                              capture / click-to-extract overlays
renderer/   UI, i18n (i18n.js), splitting engine (engine.js)
build/      icons, tray icons, installer script & license
docs/       changelog, privacy policy (also shown in-app), release notes, link protocol
editor/     xiaoji-animation.html — the companion web animation editor “小剪动画” (single file)
tools/      icon generator
```

## Known limitations

- On busy / photographic backgrounds the automatic detection may pick the whole background block; use Wand / Lasso / AI pick.
- On Linux Wayland, global hotkeys, screen capture and the transparent overlay may not work; the tray icon needs the AppIndicator extension on GNOME.
- Builds are unsigned (see above). “Update” currently means “tell you a new version exists and open the download page”, not a silent in-place update.
- Quit PixPeel from the tray before uninstalling, otherwise the uninstaller thinks the app is still running.

## Privacy

No data is collected; images are processed locally. See [docs/PRIVACY.md](docs/PRIVACY.md).

## License

[MIT](LICENSE)
