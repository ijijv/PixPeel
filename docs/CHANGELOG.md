# Changelog

## 1.0.1

- The companion web animation editor “小剪动画” now ships with every release (`xiaoji-animation.html`, single file, double-click to open).
- Fix: after moving the install or switching from the dev build to the packaged one, the launch-at-login entry still pointed at the old path and nothing started on boot. It is now re-aligned to the current executable on startup.
- The in-app hint for linking with the editor now shows the real file name, and the tab is called “贴纸” (matching the editor) instead of “贴图”.

## 1.0.0

First public release.

- Undo / redo (Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y) on both the Extract page and the Board.
- Extract page zoom: wheel, + / −, Fit, 100%, pan with Space-drag or middle button; Board gets a “Zoom…” menu (incl. zoom to selection).
- Settings: a keyboard-shortcut cheat sheet.
- Library: shows each item’s resolution, flags low-res items and offers one-click / batch “Enhance” (local upscale + sharpen, saved as a new -HD file, original kept); optional “auto-enhance small images on save”.
- Fix: lasso / wand “Subtract” with no element picked now applies to the ticked or touched element.

- New “Board”: compose images from library elements or imported pictures. Preset / custom canvas size, transparent or solid background; click or drag materials in; move, scale, rotate, delete, reorder, wheel-zoom and pan; export PNG / JPG or save back to the library.

- Capture hotkey: dims the screen, drag a region, elements are split automatically, pick the ones you want and save as transparent PNGs.
- Click-to-extract hotkey: the screen is not dimmed; hover to highlight an element, click to save it straight to the library.
- Import images (button, drag & drop, or paste) and split them the same way. Pick / Wand / Lasso / optional AI pick tools; export layered SVG.
- Library with copy-to-clipboard, reveal in folder and delete (to trash).
- Optional link with the “小剪动画” video editor: saved elements appear in its sticker library.
- Windows installer with license, install path and desktop-shortcut options; macOS (Intel / Apple Silicon) and Linux builds.
- Settings: language (简体中文 / English), theme (system / light / dark), save folder, hotkeys, launch at login, close-to-tray, notifications, update check, changelog, privacy policy.
- Clicking the “saved” notification opens the library.
