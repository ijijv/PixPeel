/* PixPeel · 桌面版主进程
 * Shortcut → capture → auto split → you pick → tray (PixPeel main process)
 */
const {
  app, BrowserWindow, Tray, Menu, globalShortcut, desktopCapturer, screen, ipcMain, dialog,
  clipboard, nativeImage, shell, Notification, systemPreferences, nativeTheme
} = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const I18N = require('./renderer/i18n');
const APP = require('./config');

/* 必须在 ready 之前设置：Windows 通知的名称/图标、userData 目录都靠它 */
app.setName(APP.name);
if (process.platform === 'win32') app.setAppUserModelId(APP.appId);
const { listLib, listSvg, resolveSafe, safeName, uniquePath } = require('./lib');
const server = require('./server');

/* Windows 的窗口图标必须用多尺寸 ICO。
 * 用 1024×1024 的 PNG 的话，Electron 转不出合适的小图标，
 * 任务栏和窗口标题栏就会变成系统自带的“空白文档”图标。 */
const isWin = process.platform === 'win32';
const appIcon = () => path.join(__dirname, 'build', isWin ? 'icon.ico' : 'icon.png');

if (!app.requestSingleInstanceLock()) { app.quit(); return; }

const DEFAULTS = () => ({
  saveDir: path.join(app.getPath('pictures'), APP.name),
  hotkey: 'CommandOrControl+Shift+X',
  hotkey2: 'CommandOrControl+Alt+X',
  autoHide: true,
  autoHD: false,
  aiModel: 'q8',
  notify: true,
  openAtLogin: false,
  linkEnabled: true,
  port: 17652,
  lang: 'auto',
  theme: 'auto',
  closeToTray: true,
  checkUpdate: true
});
const HOTKEY_DEFAULTS = { hotkey: 'CommandOrControl+Shift+X', hotkey2: 'CommandOrControl+Alt+X' };
let settings = null;
let win = null, tray = null, overlay = null, liveWin = null, liveCount = 0;
let capturing = false, quitting = false;
const lang = () => I18N.resolve(settings && settings.lang, app.getLocale());
const T = (k, v) => I18N.t(k, v, lang());
const keep = new Set();           // 通知对象要留着引用，否则可能被回收，点击事件就丢了
function notify(body, onClick, title) {
  if (!settings.notify || !Notification.isSupported()) return;
  const n = new Notification({
    title: title || APP.name, body, silent: true,
    icon: nativeImage.createFromPath(path.join(__dirname, 'build', 'notify.png'))
  });
  keep.add(n);
  n.on('click', () => { keep.delete(n); try { onClick && onClick(); } catch (e) { console.error(e); } });
  n.on('close', () => keep.delete(n));
  n.show();
}
function openLibrary() { showWindow(); toRenderer('nav', 'lib'); }
function applyTheme() {
  nativeTheme.themeSource = settings.theme === 'light' ? 'light' : settings.theme === 'dark' ? 'dark' : 'system';
}
const bgColor = () => (nativeTheme.shouldUseDarkColors ? '#0e1118' : '#f3f5f9');

/* ---------- 设置 ---------- */
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function loadSettings() {
  let s = {};
  try { s = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch (e) { /* first run */ }
  settings = Object.assign(DEFAULTS(), s);
}
function saveSettings() {
  try { fs.mkdirSync(path.dirname(settingsFile()), { recursive: true }); fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2)); } catch (e) { console.error(e); }
}
const ensureDir = (d) => { try { fs.mkdirSync(d, { recursive: true }); } catch (e) { /* ignore */ } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const toRenderer = (ch, data) => { if (win && !win.isDestroyed()) win.webContents.send(ch, data); };

/* ---------- 主窗口 ---------- */
function createWindow() {
  win = new BrowserWindow({
    width: 1220, height: 820, minWidth: 900, minHeight: 600, show: false,
    title: APP.name, backgroundColor: bgColor(), autoHideMenuBar: true,
    icon: appIcon(),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('close', (e) => { if (!quitting && settings.closeToTray !== false) { e.preventDefault(); win.hide(); } else if (!quitting) { quitting = true; app.quit(); } });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
}
function showWindow() {
  if (!win || win.isDestroyed()) createWindow();
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
}

/* ---------- 托盘 ---------- */
function buildTray() {
  const f = process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png';
  let img = nativeImage.createFromPath(path.join(__dirname, 'build', f));
  if (process.platform === 'darwin') img.setTemplateImage(true);
  tray = new Tray(img);
  tray.setToolTip(APP.name);
  refreshTrayMenu();
  tray.on('click', () => { if (process.platform !== 'darwin') showWindow(); });
}
function hotkeyLabel(h) { return String(h).replace('CommandOrControl', process.platform === 'darwin' ? '⌘' : 'Ctrl'); }
function refreshTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: T('trayCap', { k: hotkeyLabel(settings.hotkey) }), click: () => startCapture() },
    { label: T('trayLive', { k: hotkeyLabel(settings.hotkey2) }), click: () => startLivePick() },
    { label: T('trayImp'), click: () => importDialog() },
    { type: 'separator' },
    { label: T('trayOpen'), click: () => showWindow() },
    { label: T('trayLib'), click: () => openLibrary() },
    { label: T('trayDir'), click: () => { ensureDir(settings.saveDir); shell.openPath(settings.saveDir); } },
    { type: 'separator' },
    { label: T('trayQuit'), click: () => { quitting = true; app.quit(); } }
  ]));
}

/* ---------- 快捷键 ---------- */
function registerHotkeys() {
  try { globalShortcut.unregisterAll(); } catch (e) { /* ignore */ }
  const res = { ok: true, msgs: [] };
  const reg = (acc, fn, label) => {
    if (!acc) return;
    let ok = false;
    try { ok = globalShortcut.register(acc, fn); } catch (e) { res.ok = false; res.msgs.push(T('hkBad', { l: label })); return; }
    if (!ok) { res.ok = false; res.msgs.push(T('hkBusy', { l: label })); }
  };
  reg(settings.hotkey, () => startCapture(), T('lblFrame'));
  if (settings.hotkey2 && settings.hotkey2 !== settings.hotkey) reg(settings.hotkey2, () => startLivePick(), T('lblLive'));
  return res;
}

/* ---------- 截屏 + 框选 ---------- */
async function startCapture() {
  if (capturing) return { ok: false, msg: '正在截图中' };
  capturing = true;
  try {
    if (process.platform === 'darwin') {
      const st = systemPreferences.getMediaAccessStatus('screen');
      if (st === 'denied' || st === 'restricted') {
        capturing = false;
        showWindow();
        toRenderer('toast', T('permMac', { app: APP.name }));
        shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
        return { ok: false, msg: 'no-permission' };
      }
    }
    const pt = screen.getCursorScreenPoint();
    const d = screen.getDisplayNearestPoint(pt);
    const sf = d.scaleFactor || 1;
    if (win && win.isVisible()) { win.hide(); await sleep(260); }   // 别把自己拍进去
    const size = { width: Math.round(d.size.width * sf), height: Math.round(d.size.height * sf) };
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
    const src = sources.find(s => String(s.display_id) === String(d.id)) || sources[0];
    if (!src || src.thumbnail.isEmpty()) { capturing = false; showWindow(); toRenderer('toast', T('capFail')); return { ok: false }; }
    const full = src.thumbnail;
    const preview = 'data:image/jpeg;base64,' + full.toJPEG(92).toString('base64');

    overlay = new BrowserWindow({
      x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height,
      frame: false, resizable: false, movable: false, minimizable: false, maximizable: false,
      skipTaskbar: true, alwaysOnTop: true, show: false, hasShadow: false, enableLargerThanScreen: true,
      backgroundColor: '#000000', focusable: true,
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false }
    });
    overlay.setAlwaysOnTop(true, 'screen-saver');
    if (process.platform === 'darwin') overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    await overlay.loadFile(path.join(__dirname, 'overlay.html'));
    overlay.webContents.send('overlay:init', { dataURL: preview, w: d.bounds.width, h: d.bounds.height, lang: lang() });
    overlay.show(); overlay.focus();

    const rect = await new Promise((resolve) => {
      const onDone = (e, r) => { cleanup(); resolve(r); };
      const onClosed = () => { cleanup(); resolve(null); };
      const cleanup = () => { ipcMain.removeListener('overlay:done', onDone); if (overlay && !overlay.isDestroyed()) overlay.removeListener('closed', onClosed); };
      ipcMain.once('overlay:done', onDone);
      overlay.once('closed', onClosed);
    });
    if (overlay && !overlay.isDestroyed()) overlay.destroy();
    overlay = null;
    if (!rect || rect.w < 4 || rect.h < 4) { capturing = false; return { ok: false, msg: 'cancel' }; }

    const k = full.getSize().width / d.bounds.width;      // 截图像素 / 屏幕逻辑像素
    const r = {
      x: Math.max(0, Math.round(rect.x * k)), y: Math.max(0, Math.round(rect.y * k)),
      width: Math.round(rect.w * k), height: Math.round(rect.h * k)
    };
    const fs_ = full.getSize();
    r.width = Math.min(r.width, fs_.width - r.x); r.height = Math.min(r.height, fs_.height - r.y);
    const crop = full.crop(r);
    showWindow();
    toRenderer('capture:image', { dataURL: crop.toDataURL(), name: T('capName', { s: stamp() }) });
    capturing = false;
    return { ok: true };
  } catch (e) {
    console.error(e);
    if (overlay && !overlay.isDestroyed()) overlay.destroy();
    overlay = null; capturing = false;
    showWindow(); toRenderer('toast', T('capErr', { e: String(e.message || e).slice(0, 80) }));
    return { ok: false };
  }
}
const pad = (n) => String(n).padStart(2, '0');
function stamp(d = new Date()) { return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`; }

/* ---------- 点选提取：不变暗、不定格，直接点屏幕上的元素 ---------- */
async function startLivePick() {
  if (liveWin && !liveWin.isDestroyed()) { liveWin.close(); return; }
  if (capturing) return;
  capturing = true;
  try {
    if (process.platform === 'darwin') {
      const st = systemPreferences.getMediaAccessStatus('screen');
      if (st === 'denied' || st === 'restricted') {
        showWindow();
        toRenderer('toast', T('permMac', { app: APP.name }));
        shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
        return;
      }
    }
    const pt = screen.getCursorScreenPoint();
    const d = screen.getDisplayNearestPoint(pt);
    const sf = d.scaleFactor || 1;
    if (win && win.isVisible()) { win.hide(); await sleep(260); }
    const size = { width: Math.round(d.size.width * sf), height: Math.round(d.size.height * sf) };
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
    const src = sources.find(s => String(s.display_id) === String(d.id)) || sources[0];
    if (!src || src.thumbnail.isEmpty()) { showWindow(); toRenderer('toast', T('capFail')); return; }
    const png = src.thumbnail.toPNG();
    liveCount = 0;
    liveWin = new BrowserWindow({
      x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height,
      frame: false, transparent: true, backgroundColor: '#00000000', resizable: false, movable: false, minimizable: false, maximizable: false,
      skipTaskbar: true, alwaysOnTop: true, show: false, hasShadow: false, enableLargerThanScreen: true, focusable: true,
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false }
    });
    liveWin.setAlwaysOnTop(true, 'screen-saver');
    if (process.platform === 'darwin') liveWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    await liveWin.loadFile(path.join(__dirname, 'live.html'));
    liveWin.webContents.send('live:init', { png: new Uint8Array(png), w: d.bounds.width, h: d.bounds.height, lang: lang() });
    liveWin.show(); liveWin.focus();
    await new Promise((resolve) => liveWin.once('closed', resolve));
    liveWin = null;
    if (liveCount) notify(T('notifLive', { n: liveCount }) + '\n' + T('notifClick'), openLibrary);
  } catch (e) {
    console.error(e);
    if (liveWin && !liveWin.isDestroyed()) liveWin.destroy();
    liveWin = null;
    showWindow(); toRenderer('toast', T('capErr', { e: String(e.message || e).slice(0, 80) }));
  } finally { capturing = false; }
}
function saveLive(o) {
  ensureDir(settings.saveDir);
  const d = new Date();
  const dir = path.join(settings.saveDir, T('grpLive', { d: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }));
  ensureDir(dir);
  const p = uniquePath(dir, T('elemFile', { t: `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}` }), '.png');
  fs.writeFileSync(p, Buffer.from(o.data));
  liveCount++;
  return { ok: true, count: liveCount };
}

async function importDialog() {
  showWindow();
  const r = await dialog.showOpenDialog(win, { title: T('pickImgT'), properties: ['openFile'], filters: [{ name: T('imgFilter'), extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }] });
  if (r.canceled || !r.filePaths[0]) return { ok: false };
  const p = r.filePaths[0], ext = path.extname(p).slice(1).toLowerCase();
  const mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp' }[ext] || 'image/png';
  toRenderer('capture:image', { dataURL: `data:${mime};base64,` + fs.readFileSync(p).toString('base64'), name: path.basename(p) });
  return { ok: true };
}

/* ---------- 联动服务 ---------- */
async function applyServer() {
  server.stop();
  if (!settings.linkEnabled) return { ok: true, running: false };
  const r = await server.start(() => settings.saveDir, settings.port);
  return { ...r, running: server.running() };
}

/* ---------- 设置给界面看的版本 ---------- */
function publicSettings() {
  return {
    ...settings, serverRunning: server.running(), platform: process.platform,
    langResolved: lang(), version: app.getVersion(), name: APP.name, repo: APP.repo, repoUrl: APP.repoUrl, repoConfigured: APP.configured,
    versions: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node },
    userData: app.getPath('userData'), defaults: HOTKEY_DEFAULTS, locale: app.getLocale()
  };
}

/* ---------- 检查更新：只问 GitHub 一次最新版本号，不更新也不上传任何东西 ---------- */
function getJSON(url, depth) {
  return new Promise((resolve, reject) => {
    depth = depth || 0;
    const req = https.get(url, { headers: { 'User-Agent': APP.name, Accept: 'application/vnd.github+json' }, timeout: 8000 }, (r) => {
      /* GitHub 对改名/换过用户名的仓库会回 301（指向 /repositories/<id>），这里跟一下 */
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && depth < 4) {
        r.resume();
        let next; try { next = new URL(r.headers.location, url).href; } catch (e) { return reject(new Error('HTTP ' + r.statusCode)); }
        return getJSON(next, depth + 1).then(resolve, reject);
      }
      let b = ''; r.setEncoding('utf8'); r.on('data', (c) => { b += c; });
      r.on('end', () => { if (r.statusCode !== 200) return reject(new Error('HTTP ' + r.statusCode)); try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}
function cmpVer(a, b) {
  const pa = String(a).replace(/^v/, '').split('-')[0].split('.').map(Number), pb = String(b).replace(/^v/, '').split('-')[0].split('.').map(Number);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d > 0 ? 1 : -1; }
  return 0;
}
async function checkUpdate() {
  if (!APP.configured) return { ok: false, code: 'norepo' };
  try {
    const j = await getJSON(`https://api.github.com/repos/${APP.repo}/releases/latest`);
    const latest = String(j.tag_name || '').replace(/^v/, '');
    if (!latest) return { ok: false, code: 'err', msg: 'no release' };
    return { ok: true, latest, current: app.getVersion(), newer: cmpVer(latest, app.getVersion()) > 0, url: j.html_url || (APP.repoUrl + '/releases') };
  } catch (e) { return { ok: false, code: 'err', msg: String(e.message || e) }; }
}
const safeExternal = (u) => /^https:\/\/(github\.com|api\.github\.com)\//.test(String(u)) ? shell.openExternal(u) : false;

/* ---------- IPC ---------- */
function ipc() {
  ipcMain.handle('settings:get', () => publicSettings());
  ipcMain.handle('settings:set', async (e, patch) => {
    const old = { ...settings };
    const res = { ok: true, msgs: [] };
    Object.assign(settings, patch || {});
    if ('hotkey' in patch || 'hotkey2' in patch) {
      if (settings.hotkey && settings.hotkey === settings.hotkey2) {
        settings.hotkey = old.hotkey; settings.hotkey2 = old.hotkey2; registerHotkeys();
        res.ok = false; res.msgs.push(T('hkBoth'));
      } else {
        const r = registerHotkeys();
        if (!r.ok) { settings.hotkey = old.hotkey; settings.hotkey2 = old.hotkey2; registerHotkeys(); res.ok = false; res.msgs.push(...r.msgs); }
      }
    }
    if ('saveDir' in patch) ensureDir(settings.saveDir);
    if ('openAtLogin' in patch) { try { app.setLoginItemSettings({ openAtLogin: !!settings.openAtLogin }); } catch (err) { /* ignore */ } }
    if ('linkEnabled' in patch || 'port' in patch) {
      const r = await applyServer();
      if (!r.ok) { res.ok = false; res.msgs.push(r.msg); }
    }
    if ('theme' in patch) { applyTheme(); if (win && !win.isDestroyed()) win.setBackgroundColor(bgColor()); }
    if ('lang' in patch) { refreshTrayMenu(); }
    saveSettings(); refreshTrayMenu();
    res.settings = publicSettings();
    return res;
  });
  ipcMain.handle('dir:pick', async () => {
    const r = await dialog.showOpenDialog(win, { title: T('pickDirT'), defaultPath: settings.saveDir, properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('dir:open', () => { ensureDir(settings.saveDir); return shell.openPath(settings.saveDir); });
  ipcMain.handle('lib:list', () => listLib(settings.saveDir));
  ipcMain.handle('lib:del', async (e, rel) => {
    const p = resolveSafe(settings.saveDir, rel); if (!p) return false;
    try { await shell.trashItem(p); } catch (err) { try { fs.unlinkSync(p); } catch (e2) { return false; } }
    const dir = path.dirname(p);
    try { if (path.resolve(dir) !== path.resolve(settings.saveDir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir); } catch (err) { /* ignore */ }
    return true;
  });
  ipcMain.handle('lib:reveal', (e, rel) => { const p = resolveSafe(settings.saveDir, rel); if (p) shell.showItemInFolder(p); });
  ipcMain.handle('lib:copy', (e, rel) => {
    const p = resolveSafe(settings.saveDir, rel); if (!p) return false;
    clipboard.writeImage(nativeImage.createFromPath(p)); return true;
  });
  ipcMain.handle('lib:read', (e, rel) => { const p = resolveSafe(settings.saveDir, rel); if (!p) return null; try { return fs.readFileSync(p); } catch (_) { return null; } });
  /* SVG 库：和素材库分开，SVG 不进「小剪动画」的素材列表 */
  ipcMain.handle('lib:listSvg', () => listSvg(settings.saveDir));
  ipcMain.handle('lib:saveSvg', (e, o) => {
    if (!o || !o.data) return { ok: false };
    try {
      ensureDir(settings.saveDir);
      const dir = path.join(settings.saveDir, safeName(o.group || T('grpSvg', { s: stamp() })));
      ensureDir(dir);
      const out = uniquePath(dir, safeName(o.name || 'svg'), '.svg');
      fs.writeFileSync(out, Buffer.from(o.data));
      return { ok: true, rel: path.relative(settings.saveDir, out).split(path.sep).join('/') };
    } catch (err) { console.error(err); return { ok: false }; }
  });
  ipcMain.handle('lib:hd', (e, o) => {
    const p = resolveSafe(settings.saveDir, o && o.rel); if (!p || !o.data) return { ok: false };
    try {
      const dir = path.dirname(p), base = path.basename(p).replace(/\.[^.]+$/, '');
      const out = uniquePath(dir, base + '-HD', '.png'); fs.writeFileSync(out, Buffer.from(o.data));
      return { ok: true, rel: path.relative(settings.saveDir, out).split(path.sep).join('/') };
    } catch (err) { return { ok: false }; }
  });
  ipcMain.handle('img:copy', (e, bytes) => { clipboard.writeImage(nativeImage.createFromBuffer(Buffer.from(bytes))); return true; });
  ipcMain.handle('save:elements', (e, o) => {
    const files = (o && o.files) || [];
    if (!files.length) return { ok: false };
    ensureDir(settings.saveDir);
    const quiet = !!o.quiet;
    const group = safeName((o.group || T('grpCap', { s: stamp() })));
    const dir = path.join(settings.saveDir, group);
    ensureDir(dir);
    let n = 0;
    for (const f of files) {
      try { fs.writeFileSync(uniquePath(dir, safeName(f.name), '.png'), Buffer.from(f.data)); n++; } catch (err) { console.error(err); }
    }
    if (n && !quiet) notify(T('notifSave', { n }) + '\n' + T('notifClick'), openLibrary);
    if (n && !quiet && settings.autoHide && win) win.hide();
    return { ok: n > 0, count: n, dir };
  });
  ipcMain.handle('save:as', async (e, o) => {
    const r = await dialog.showSaveDialog(win, { defaultPath: o.name, filters: o.filters || [] });
    if (r.canceled || !r.filePath) return false;
    fs.writeFileSync(r.filePath, Buffer.from(o.data)); return true;
  });
  ipcMain.handle('capture:start', () => startCapture());
  ipcMain.handle('update:check', () => checkUpdate());
  ipcMain.handle('open:external', (e, u) => safeExternal(u));
  ipcMain.handle('open:userdata', () => shell.openPath(app.getPath('userData')));
  ipcMain.handle('doc:get', (e, name) => {
    if (!['CHANGELOG', 'PRIVACY'].includes(name)) return '';
    const base = path.join(__dirname, 'docs', name);
    for (const f of [lang() === 'zh' ? base + '.zh-CN.md' : null, base + '.md']) {
      if (!f) continue;
      try { return fs.readFileSync(f, 'utf8'); } catch (err) { /* try next */ }
    }
    return '';
  });
  ipcMain.handle('settings:reset', async () => {
    const keepDir = settings.saveDir;
    settings = Object.assign(DEFAULTS(), { saveDir: keepDir });
    applyTheme(); registerHotkeys(); await applyServer();
    try { app.setLoginItemSettings({ openAtLogin: false }); } catch (err) { /* ignore */ }
    saveSettings(); refreshTrayMenu();
    return publicSettings();
  });
  ipcMain.handle('live:save', (e, o) => { try { return saveLive(o); } catch (err) { console.error(err); return { ok: false }; } });
  ipcMain.on('live:done', () => { if (liveWin && !liveWin.isDestroyed()) liveWin.close(); });
  ipcMain.handle('import:dialog', () => importDialog());
  ipcMain.handle('win:hide', () => { if (win) win.hide(); });
}

/* ---------- 启动 ---------- */
app.on('second-instance', () => showWindow());
app.on('window-all-closed', () => { /* 常驻托盘，不退出 */ });
app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => { globalShortcut.unregisterAll(); server.stop(); });
app.on('activate', () => showWindow());

/* 开机自启项必须跟着当前这个 exe 走。
 * 换机器位置、或者从“开发版 dist\win-unpacked”换成正式安装版之后，
 * 注册表里还指着旧路径，开机会拉起一个已经不存在的程序。启动时重新对齐一次。 */
function syncLoginItem() {
  if (!app.isPackaged) return; // 开发模式跑的是 electron.exe，不写自启项
  try {
    app.setLoginItemSettings({ openAtLogin: !!settings.openAtLogin, path: process.execPath });
  } catch (err) { /* ignore */ }
}

app.whenReady().then(async () => {
  loadSettings(); applyTheme(); ensureDir(settings.saveDir);
  syncLoginItem();
  ipc(); createWindow(); buildTray();
  const r = registerHotkeys();
  const sv = await applyServer();
  win.once('ready-to-show', () => {
    // 开机自启时安静地待在托盘；手动打开才显示窗口
    const hidden = process.argv.includes('--hidden') || (app.getLoginItemSettings && app.getLoginItemSettings().wasOpenedAtLogin);
    if (!hidden) win.show();
    if (!r.ok) toRenderer('toast', r.msgs.join('；'));
    if (!sv.ok) toRenderer('toast', sv.msg);
  });
  // 启动 8 秒后悄悄查一次更新（可在设置里关掉）
  if (settings.checkUpdate && APP.configured) {
    setTimeout(async () => {
      const u = await checkUpdate();
      if (u.ok && u.newer) {
        toRenderer('update', u);
        notify(T('notifUpd', { v: u.latest }) + '\n' + T('notifUpdClick'), () => safeExternal(u.url));
      }
    }, 8000);
  }
});
