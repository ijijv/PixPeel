# Changelog

## 1.0.5

- **Better gap repair**: only gaps of 2 px or less could be closed before. There is now a crack filler that joins a break **only where there is foreground on both sides and the gap is narrow**, so 3–4 px notches and stepped/jagged cracks get closed up (measured: 1–4 px straight gaps fully repaired, jagged cracks completely closed) without two distant elements being glued together.
- New setting “Gap repair width”: widen or narrow how much gets bridged (default 4 px). The wider it is, the more likely two very close elements get merged into one — your call.
- Measured effect of the edge smoothing: a hard edge used to have only two alpha levels (0 / 255); it now gets a gradient transition band (measured: 0 → 200 transitional pixels), which noticeably reduces stair-step jaggies.

## 1.0.4

- **Batch splitting**: you can now select several images at once (button or drag & drop). Each one is split automatically and every element ends up in a single list; clicking an element jumps to the image it came from.
- **The Extract page is now a contact sheet**: images are scaled to a uniform size and tiled in a grid on one big canvas. The one you are working on is highlighted; scroll to zoom in for detail, drag to pan, and get the whole batch at a glance before you pick.
- **Edge smoothing & gap repair (on by default)**: on export, small gaps along the edge are filled, enclosed holes are closed, and the alpha transition is smoothed — no more broken outlines or stair-stepped jaggies. Pure local math, no network and no model; switch it off in Settings to export exactly as split.
- The rail logo is now redrawn from the icon’s own geometry: the white dashed frame inside the orange rounded square keeps flowing around the centre dot.
- Fix: the SVG canvas kept the previous language’s wording after switching the interface language.
- Fix: the element list jumped back to the top when it was redrawn (scrolling down and then clicking an element sent you back to the first row). The scroll position is kept now.
- The element panel is a denser card grid that reflows with the sidebar width, so the empty space is used.
- Fix: importing several images at once made them fight over “the image currently being split”, so elements could be cut from the wrong source (a red photo yielding blue pixels). Images are now processed one after another.
- Fix: importing an image could hang forever while the app was in the background (image decoding never returned when the window was hidden).
- Fix: clicking “SVG Canvas” in the rail before opening any SVG crashed the page. It now shows an empty state with “Import SVG” and “SVG Library” entry points.
- Fix: the element list still jumped back to the top when you clicked an element after scrolling — the scroll position was being saved on the outer panel instead of the list that actually scrolls. The list now stays where you left it.
- Fix: element names (“元素 1” / “Element 1”) were frozen in whichever language was active when you split the image, so switching the interface language left the old wording behind. Auto-generated names now follow the language; names you renamed yourself are left alone.
- AI picking with the full-precision model used to fail outright on machines without enough memory. It now falls back to the quantized model automatically and tells you it did.

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
