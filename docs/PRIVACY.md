# Privacy Policy

**Short version: PixPeel works on your computer. It does not collect, upload or sell your data.**

## What stays on your device
- Screenshots and imported images are processed locally in memory. They are never uploaded.
- Elements you save are written to the folder you choose (default: Pictures/PixPeel).
- Settings are stored in a small `settings.json` in the app's data folder (Settings → About → Settings folder).

## Network requests (the only ones the app makes)
1. **Update check** (optional, on by default, can be turned off in Settings): one request to `api.github.com` asking for the latest release version number. No personal data or identifiers are sent beyond what any HTTPS request contains (your IP address and a `User-Agent` of “PixPeel”).
2. **AI pick** (optional, only if you use that tool): downloads a small open-source model and its runtime from public CDNs (jsdelivr / unpkg / huggingface.co or hf-mirror.com) the first time. Your image is **not** sent; inference runs locally.

## Local link service
If “Let the editor read the library” is on, the app serves your library on `127.0.0.1` (this computer only) so the “小剪动画” editor can read it. It is not reachable from other devices. Turn it off in Settings at any time.

## Permissions
- **Screen recording (macOS)** / screen capture (Windows, Linux): only used when you press a hotkey, to take one picture of the screen.
- **Launch at login**: off by default.

## No analytics
No telemetry, no tracking, no ads, no accounts.

## Changes
If this policy changes, the new version will be shown in the changelog.
