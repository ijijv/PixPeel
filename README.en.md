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
- **Click-to-extract mode**: the screen stays as it is; hover highlights an element, click saves it straight to the library. Click as many as you like.
- **Import images**: button, drag & drop, or `Ctrl+V`.
- **Refine tools**: Pick / Wand / Lasso / AI pick (optional, downloads a small model on first use and falls back to the hf-mirror.com mirror in China); export layered SVG.
- **Board**: compose pictures from library elements or imported images; pick canvas size and transparent / solid background; move, scale, rotate, delete; export PNG / JPG or save back to the library.
- **Undo / zoom / shortcuts**: Ctrl+Z / Ctrl+Shift+Z on both the Extract page and the Board, wheel zoom, Space-drag pan; every shortcut is listed in Settings.
- **Enhance**: the library flags low-res items and upscales + sharpens them locally (classical resampling, not generative AI), saving a new `-HD` file and keeping the original.
- **Library**: click to copy, reveal in folder, delete (to trash).
- **Link with the “小剪动画” video editor**: saved elements show up in its sticker library.
- Lives in the tray, optional launch at login, notification after saving (click it to open the library).
- 简体中文 / English, light / dark / system theme.

## Download

Get the file for your system from [Releases](https://github.com/ijijv/PixPeel/releases):

| System | File | Notes |
| --- | --- | --- |
| Windows (not sure which one? take this) | `PixPeel-Setup-x.y.z-win.exe` | One installer that adapts to 64-bit / 32-bit / ARM, about 230 MB |
| Windows 64-bit (most PCs) | `PixPeel-Setup-x.y.z-win-x64.exe` | Wizard: license → install path → progress → optional desktop shortcut |
| Windows 32-bit | `PixPeel-Setup-x.y.z-win-ia32.exe` | Older PCs |
| Windows on ARM | `PixPeel-Setup-x.y.z-win-arm64.exe` | |
| macOS Apple Silicon | `PixPeel-x.y.z-mac-arm64.dmg` | |
| macOS Intel | `PixPeel-x.y.z-mac-x64.dmg` | |
| Linux 64-bit | `PixPeel-x.y.z-linux-x86_64.AppImage` / `…-linux-amd64.deb` / `…-linux-x86_64.rpm` | AppImage needs no install, deb for Debian / Ubuntu, rpm for Fedora / openSUSE |
| Linux ARM64 | `PixPeel-x.y.z-linux-arm64.AppImage` / `…-linux-arm64.deb` / `…-linux-aarch64.rpm` | Raspberry Pi and friends |

Each release includes `SHA256SUMS.txt` to verify downloads.

**Upgrading**: just run the new installer; it replaces the old version and keeps your settings and saved elements.

### First-run notes (the builds are not paid-code-signed)

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

1. In PixPeel settings make sure “Let the editor read the library” is on (`127.0.0.1:17652`, this computer only).
2. Open the **locally downloaded “小剪动画.html”**, go to “贴图” on the left and click “Connect PixPeel desktop”.
3. Newly saved elements then appear automatically.

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

### Publishing a release

1. Bump `version` in `package.json` and describe changes in `docs/CHANGELOG*.md`.
2. Make sure the repository slug in `config.js`, `package.json` and the READMEs is `ijijv/PixPeel` (the update check relies on it).
3. Commit, then tag and push:
   ```bash
   git tag v1.0.1 && git push origin v1.0.1
   ```
4. GitHub Actions (`.github/workflows/release.yml`) builds on Windows / macOS / Linux, creates the Release and attaches every installer plus `SHA256SUMS.txt`.
5. The Linux rpm package depends on the build machine's rpm version, so the CI Linux job is pinned to `ubuntu-24.04`. If you move to a newer runner, check that rpm still builds (AppImage and deb are unaffected).

To rename the app, edit `config.js` and `package.json` (`productName`, `appId`).

### Layout

```
main.js  preload.js  lib.js  server.js  config.js   main process & local link server
overlay.html  live.html                              capture / click-to-extract overlays
renderer/   UI, i18n (i18n.js), splitting engine (engine.js)
build/      icons, tray icons, installer script & license
docs/       changelog, privacy policy (also shown in-app)
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
