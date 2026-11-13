# Changelog

## 1.0.3

- Fix: “Check for updates” reported HTTP 301. The GitHub account was renamed, so the old repository path redirects — the correct path is used now and the request follows redirects automatically.
- Fix: library card buttons were cut off in English (“Board” showed as “oard”). The action buttons moved to the bottom of the card and are allowed to wrap.
- Fix: reordering layers in the SVG canvas did nothing (the DOM order is really changed now, so the stacking updates).
- Fix: layers in the SVG canvas rotated around the canvas origin; they now rotate around their own centre.
- Fix: the middle mouse button could not pan the SVG canvas.
- SVG canvas: marquee multi-select, corner-scale + top-rotate handles, Delete to remove the selection, Clear all, arrow-key nudging.
- Board: marquee multi-select (the selection can then be deleted / scaled / rotated together), Clear canvas. The middle button still pans.
- The Extract page’s element list gained “Clear”; the element library and the SVG library gained “Clear” as well (everything is marked first and can be undone within 3 seconds — only then is it really deleted).
- The AI pick panel now spells out which model is in use, how big it is, what hardware it wants and whether it is already downloaded; you can download it or switch between quantized and full precision with one click.
- The logo in the left rail now has a dashed ring slowly turning around its centre dot.
- Images can be dropped straight onto the rail buttons: “Extract” splits them, “Library” stores them, “Board” adds a layer, “SVG Library / SVG Canvas” treat them as SVG — which is different from dropping onto the working area on the right.

## 1.0.2

- New “SVG Library” and “SVG Canvas” sections: layered SVGs are stored on their own; in the SVG canvas you can show/hide, move, scale, rotate, fade and delete each layer, and export any single layer as a transparent PNG back into the element library. See docs/LINK-PROTOCOL.md for the interface contract.
- Deletes are now undoable for 3 seconds: the library, the Extract page and the Board all show a toast with a shrinking progress bar; the delete only happens when the bar runs out.
- The element list is now a responsive card grid — thumbnails grow and reflow with the sidebar width instead of squeezing into thin rows.
- New ↩ button on the Extract page to leave the current image and go back to the empty page.
- Drag an image from the desktop onto any page: the Extract page splits it, the Board takes it as a material, the Library stores it, the SVG Library treats it as an SVG. A hint at the top tells you what the current page will do with it.
- HD enhance upgraded: on top of Lanczos + unsharp masking it now does iterative back-projection (tighter outlines) and de-fringing (fewer white/black halos).
- The AI model is now your choice: quantized (default, ~15–40 MB, fast, light) or full precision (~40–100 MB, slightly more accurate, heavier), switchable in Settings. Once the model is downloaded it goes straight to “AI is looking at the image”.
- Library items gained a “Board” button that copies them onto the board while the original stays in the library for repeated use.
- Fix: white icon for the taskbar / notifications on Windows (the window now uses a multi-size ICO and the Start Menu shortcut is recreated on every install).
- Fix: after installing a new build, launch-at-login still pointed at the old path so nothing started on boot; it now re-aligns to the current executable on startup.

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
