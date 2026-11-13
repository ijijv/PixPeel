/* PixPeel 桌面版界面（引擎在 engine.js，文案在 i18n.js） */
const $ = (s, r = document) => r.querySelector(s);
const api = window.xapi;
let CFG = null;
let tt;
function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => e.classList.remove('show'), 4200); }

/* ───────── 撤回轻提示：3 秒 + 递减进度条 ─────────
 * 用法：undoToast('已删除 3 个元素', { undo: () => {...}, expire: () => {...} })
 * expire 在 3 秒内没人点撤回时触发（用来真正执行删除）；undo 则是反悔。 */
let undoJob = null;
function undoToast(msg, opt) {
  opt = opt || {};
  let el = $('#undoToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'undoToast';
    el.innerHTML = '<span class="utx"></span><button class="btn sm uact"></button><i class="ubar"></i>';
    document.body.appendChild(el);
    el.querySelector('.uact').onclick = () => {
      const j = undoJob; if (!j) return;
      undoJob = null; clearTimeout(j.timer); el.classList.remove('on');
      if (j.opt.undo) j.opt.undo();
    };
  }
  const ms = opt.ms || 3000;
  el.querySelector('.utx').textContent = msg;
  el.querySelector('.uact').textContent = t('undo');
  el.classList.add('on');
  const bar = el.querySelector('.ubar');
  bar.style.transition = 'none'; bar.style.width = '100%';
  void bar.offsetWidth;                       // 强制重排，让进度条从头开始
  bar.style.transition = 'width ' + ms + 'ms linear'; bar.style.width = '0%';
  if (undoJob) { clearTimeout(undoJob.timer); if (undoJob.opt.expire) undoJob.opt.expire(); }
  undoJob = { opt, timer: setTimeout(() => { const j = undoJob; undoJob = null; el.classList.remove('on'); if (j && j.opt.expire) j.opt.expire(); }, ms) };
}
/** 撤回轻提示的宿主组件是否正在显示（避免多个提示互相打断） */
const undoBusy = () => !!undoJob;
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const toBlob = (cv) => new Promise(r => cv.toBlob(r, 'image/png'));
const toBytes = async (cv) => new Uint8Array(await (await toBlob(cv)).arrayBuffer());
const pretty = (acc) => String(acc || '').replace('CommandOrControl', api.platform === 'darwin' ? '⌘' : 'Ctrl').replace('Alt', api.platform === 'darwin' ? '⌥' : 'Alt').replace(/\+/g, ' + ');

/* ───────── 语言 / 主题 ───────── */
function applyLang() {
  const prev = I18N.lang;
  I18N.setLang(CFG && CFG.langResolved || I18N.resolve('auto', navigator.language));
  document.documentElement.lang = I18N.lang === 'zh' ? 'zh-CN' : 'en';
  document.querySelectorAll('[data-i18n]').forEach(e => { e.textContent = t(e.dataset.i18n); });
  /* 语言变了：自动命名的元素（元素 1 / Element 1）要跟着换文案，用户自己改过的不动 */
  if (prev && prev !== I18N.lang && typeof relabelLayers === 'function') {
    if (relabelLayers()) { segList(); segRender(); }
  }
}
const darkMQ = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const m = CFG && CFG.theme || 'auto';
  document.documentElement.dataset.theme = m === 'auto' ? (darkMQ.matches ? 'dark' : 'light') : m;
}
darkMQ.addEventListener && darkMQ.addEventListener('change', applyTheme);
function applyAll() { applyLang(); applyTheme(); refreshHint(); if (CFG) aiSetMode(CFG.aiModel); }

/* ───────── 页面切换 ───────── */
function showView(v) {
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  document.querySelectorAll('.view').forEach(e => e.classList.toggle('on', e.id === 'v-' + v));
  if (v === 'lib') renderLib();
  if (v === 'set') renderSettings();
  if (v === 'board') Board.enter();
  if (v === 'svglib' && typeof SvgLib !== 'undefined') SvgLib.render();
  if (v === 'svgcanvas' && typeof SvgCanvas !== 'undefined') SvgCanvas.enter();
}
$('#nav').onclick = (e) => { const b = e.target.closest('button'); if (b) showView(b.dataset.v); };
$('#btnCap').onclick = () => api.capture();
$('#btnImp').onclick = () => api.importImage();

/* ───────── 拆元素页 ───────── */
const IC = {
  pick: '<svg class="i" viewBox="0 0 24 24"><path d="M6 4l12 6-5 2-2 5z"/></svg>',
  wand: '<svg class="i" viewBox="0 0 24 24"><path d="M5 19L15 9M14 6l4 4M17 3v2M21 7h-2M7 5V3M6 4H4"/></svg>',
  lasso: '<svg class="i" viewBox="0 0 24 24"><path d="M12 5c4.4 0 8 1.8 8 4s-3.6 4-8 4-8-1.8-8-4 3.6-4 8-4z"/><path d="M8 13c-1 3 0 5 2 6"/></svg>',
  ai: '<svg class="i" viewBox="0 0 24 24"><path d="M12 3l1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7zM18 16l.8 2.2L21 19l-2.2.8L18 22l-.8-2.2L15 19l2.2-.8z"/></svg>'
};
function renderEmpty() {
  SEG.src = null; SEG.layers = []; SEG.tiles = []; SEG.cur = 0; SEG.wall = { w: 0, h: 0 };
  SEG.sel.clear(); SEG.hov = null; SEG.lasso = null;
  $('#v-edit').innerHTML = `<div class="empty"><div class="finder" id="drop">
    <h2>${t('emTitle', { k: '<kbd>' + esc(pretty(CFG && CFG.hotkey)) + '</kbd>' })}</h2>
    <p>${t('emP1')}</p>
    <p class="tip" style="max-width:none">${t('emTip', { k: '<kbd>' + esc(pretty(CFG && CFG.hotkey2)) + '</kbd>' })}</p>
    <div class="big"><button class="btn primary" id="emCap">${t('emCap')}</button><button class="btn" id="emImp">${t('emImp')}</button></div>
    <span class="tip">${t('emDrop')}</span></div></div>`;
  $('#emCap').onclick = () => api.capture();
  $('#emImp').onclick = () => api.importImage();
}
function openImage(el, w, h, name) {
  if (SEG.ai) { try { SEG.ai.w.terminate(); URL.revokeObjectURL(SEG.ai.url); } catch (e) { } SEG.ai = null; }
  /* 批量导入：每张图都是拼贴墙上的一块，元素全部汇总到一个列表里 */
  const src = segPrep(el, w, h);
  const tile = segAddTile(src, name);
  const tileIdx = SEG.tiles.length - 1;
  SEG.cur = tileIdx;
  SEG.src = src;
  SEG.sel = new Set(); SEG.hov = null; SEG.tool = 'pick'; SEG.mode = 'new'; SEG.lasso = null;
  SEG.name = name || t('image');
  showView('edit');
  buildEdit();
  segBusy(t('splitting'));
  const before = new Set(SEG.layers.map(l => l.id));
  return new Promise(res => setTimeout(async () => {
    SEG.cur = tileIdx; SEG.src = src;          // 拆的时候锁死这一张，别被别的图抢走
    const info = await segAuto();
    SEG.layers.forEach(l => { if (!before.has(l.id)) { l.tile = tileIdx; l.on = false; } });
    segBusy(''); segRender(); segList();
    const tp = $('#segInfo'); if (tp) tp.textContent = info;
    res(SEG.layers.length - before.size);
  }, 30));
}
/** 切换当前操作的图块 */
function setCurTile(tile) {
  const i = SEG.tiles.indexOf(tile); if (i < 0 || i === SEG.cur) return;
  SEG.cur = i; SEG.src = tile.src; SEG.lasso = null; SEG.hov = null;
  const sb = $('#segName'); if (sb) sb.textContent = tile.name;
  const ss = $('#segSize'); if (ss) ss.textContent = tile.w + ' × ' + tile.h;
  segList(); segRender();
}
function buildEdit() {
  $('#v-edit').innerHTML = `
    <div class="stageWrap">
      <div class="segStage"><canvas id="segCv" width="${SEG.wall.w || SEG.src.w}" height="${SEG.wall.h || SEG.src.h}"></canvas><div id="segBusy" style="display:none"></div></div>
      <div class="stageBar"><span id="segName">${esc(SEG.name)}</span><span class="dim" id="segSize">${SEG.src.w} × ${SEG.src.h}</span><span class="sp"></span>
        <span class="hint"><span>${t('hintClick')}</span><span><kbd>Enter</kbd> ${t('hintSave')}</span><span><kbd>Esc</kbd> ${t('hintHide')}</span></span></div>
    </div>
    <aside class="inspector">
      <div class="inspBody">
        <div class="grp"><div class="seg" id="segTools">
          <button class="${SEG.tool === 'pick' ? 'on' : ''}" data-st="pick" title="${t('toolPickTip')}">${IC.pick}${t('toolPick')}</button>
          <button class="${SEG.tool === 'wand' ? 'on' : ''}" data-st="wand" title="${t('toolWandTip')}">${IC.wand}${t('toolWand')}</button>
          <button class="${SEG.tool === 'lasso' ? 'on' : ''}" data-st="lasso" title="${t('toolLassoTip')}">${IC.lasso}${t('toolLasso')}</button>
          <button class="${SEG.tool === 'ai' ? 'on' : ''}" data-st="ai" title="${t('toolAiTip')}">${IC.ai}${t('toolAi')}</button></div>
          <div id="segParams" class="grp"></div></div>
        <div class="grp"><div class="gt">${t('elements')} <small id="segCount"></small></div>
          <div id="segList"></div>
          <div class="chips"><button class="btn sm" id="bAll">${t('selAll')}</button><button class="btn sm" id="bNone">${t('selNone')}</button><button class="btn sm" id="bMerge" title="${t('mergeTip')}">${t('merge')}</button><button class="btn sm danger" id="bDel" title="${t('removeTip')}">${t('remove')}</button><button class="btn sm danger" id="bClear" title="${t('segClearAll')}">${t('segClearAll')}</button></div></div>
        <label class="row2"><input type="checkbox" class="sw" id="segResid"><span>${t('resid')}</span></label>
      </div>
      <div class="inspFoot">
        <button class="btn primary" id="bSave" style="padding:11px">${t('saveSel', { n: 0 })}</button>
        <div class="chips"><button class="btn" id="bCopy" title="${t('copyTip')}">${t('copy')}</button><button class="btn" id="bSvg" title="${t('svgTip')}">${t('svgBtn')}</button><button class="btn ghost" id="bNew">${t('another')}</button></div>
      </div>
    </aside>`;
  segParams(); segBindD();
}
function segParams() {
  const p = $('#segParams'); if (!p) return;
  const sl = (k, l, min, max, st, v) => `<label class="fld"><span>${l}</span><input type="range" data-sp="${k}" min="${min}" max="${max}" step="${st}" value="${v}"><b>${v}</b></label>`;
  const mode = (k, l, tip) => `<button class="btn sm${SEG.mode === k ? ' on' : ''}" data-sm="${k}" title="${tip}">${l}</button>`;
  if (SEG.tool === 'pick') {
    p.innerHTML = `<label class="fld" style="grid-template-columns:78px 1fr"><span>${t('how')}</span><select data-sp="how"><option value="auto"${SEG.how === 'auto' ? ' selected' : ''}>${t('howAuto')}</option><option value="bg"${SEG.how === 'bg' ? ' selected' : ''}>${t('howBg')}</option><option value="color"${SEG.how === 'color' ? ' selected' : ''}>${t('howColor')}</option></select></label>
    ${sl('tol', t('pTol'), 8, 120, 1, SEG.tol)}${sl('merge', t('pMerge'), 0, 40, 1, SEG.merge)}${sl('minA', t('pMinA'), 0.02, 5, 0.02, SEG.minA)}${SEG.how === 'color' ? sl('K', t('pK'), 2, 12, 1, SEG.K) : ''}
    <div class="row2"><button class="btn sm" id="segRe">${t('redo')}</button><span class="tip" id="segInfo"></span></div>`;
  } else {
    p.innerHTML = `<div class="chips">${mode('new', t('modeNew'), t('modeNewTip'))}${mode('add', t('modeAdd'), t('modeAddTip'))}${mode('sub', t('modeSub'), t('modeSubTip'))}</div>
    ${SEG.tool === 'wand' ? sl('wtol', t('pWand'), 6, 120, 1, SEG.wtol || 32) + '<div class="tip">' + t('tipWand') + '</div>' : ''}
    ${SEG.tool === 'lasso' ? '<div class="tip">' + t('tipLasso') + '</div>' : ''}
    ${SEG.tool === 'ai' ? '<div class="tip">' + t('tipAi') + '</div>' + aiPanel() : ''}`;
  }
  aiBind();
}
function segList() {
  const el = $('#segList'); if (!el) return;
  const n = SEG.layers.filter(l => l.on).length;
  $('#segCount').textContent = SEG.tiles.length > 1 ? t('countSelImg', { n: SEG.layers.length, s: n, img: SEG.tiles.length }) : t('countSel', { n: SEG.layers.length, s: n });
  const bs = $('#bSave'); if (bs) { bs.textContent = n ? t('saveSel', { n }) : t('saveHint'); bs.disabled = !n; }
  /* 元素列表做成卡片网格：列数随侧栏宽度自动变，缩略图给足空间，不再一小条一小条地挤着 */
  const BOX = 96;
  /* 整块重画会把滚动位置弹回顶部，先记住、画完再放回去。
     注意：真正滚的是 #segList 自己（max-height:280px + overflow:auto），外面那层 .inspBody 有时也在滚，两个都要还回去 */
  const box = el.closest('.inspBody') || el.parentElement;
  const keepTop = el.scrollTop;
  const keepBody = box ? box.scrollTop : 0;
  el.innerHTML = SEG.layers.length ? SEG.layers.map(L => {
    const tile = SEG.tiles[L.tile];
    return `<div class="segCard${L.on ? ' sel' : ''}" data-l="${L.id}">
      <div class="scBox"><canvas data-lt="${L.id}" width="${BOX}" height="${BOX}"></canvas>
        <input type="checkbox" data-lc="${L.id}" ${L.on ? 'checked' : ''}></div>
      <input class="segName" data-ln="${L.id}" value="${esc(L.name)}">
      <span class="dim">${L.bw}×${L.bh}</span>
      ${SEG.tiles.length > 1 && tile ? `<span class="src" title="${esc(tile.name)}">${esc(tile.name)}</span>` : ''}
    </div>`; }).join('') : '<div class="tip">' + t('noElems') + '</div>';
  if (box) box.scrollTop = keepBody;
  el.scrollTop = keepTop;
  el.querySelectorAll('canvas[data-lt]').forEach(cv => {
    const L = SEG.layers.find(l => l.id === cv.dataset.lt); if (!L) return;
    const g = cv.getContext('2d'), w = L.bw, h = L.bh, s = Math.min(BOX / w, BOX / h);
    const dw = Math.max(1, Math.round(w * s)), dh = Math.max(1, Math.round(h * s));
    g.clearRect(0, 0, BOX, BOX);
    g.drawImage(segCut(L, 0).cv, Math.round((BOX - dw) / 2), Math.round((BOX - dh) / 2), dw, dh);
  });
}
function segRender() {
  const cv = $('#segCv'); if (!cv || !SEG.src) return;
  const g = cv.getContext('2d'), W = SEG.wall.w || SEG.src.w, H = SEG.wall.h || SEG.src.h;
  g.clearRect(0, 0, W, H);
  /* 拼贴墙：所有导入的图统一缩放、网格铺开，当前操作的那块高亮 */
  for (const tile of SEG.tiles) {
    const act = (tile === segCurTile());
    g.save(); g.globalAlpha = act ? 1 : .45;
    g.drawImage(tile.src.cv, tile.x, tile.y, tile.w * tile.sc, tile.h * tile.sc);
    g.restore();
    g.save(); g.strokeStyle = act ? '#52e3bd' : 'rgba(255,255,255,.18)'; g.lineWidth = act ? 2 : 1;
    g.strokeRect(tile.x - .5, tile.y - .5, tile.w * tile.sc + 1, tile.h * tile.sc + 1); g.restore();
    if (SEG.tiles.length > 1) {
      g.save(); g.font = `${Math.max(11, 14 * tile.sc)}px sans-serif`; g.fillStyle = act ? '#52e3bd' : 'rgba(255,255,255,.55)';
      g.fillText(tile.name, tile.x + 2, tile.y - 6); g.restore();
    }
  }
  const tile = segCurTile(); if (!tile) return;
  const sc = tile.sc, ox = tile.x, oy = tile.y;
  for (const L of SEG.layers) {
    if (L.tile !== SEG.cur) continue;
    const hov = SEG.hov === L.id;
    g.globalAlpha = L.on ? .3 : hov ? .22 : .0;
    g.drawImage(L.tint, ox + L.bx * sc, oy + L.by * sc, L.bw * sc, L.bh * sc);
  }
  g.globalAlpha = 1;
  const lw = Math.max(2, tile.w * sc / 400);
  for (const L of SEG.layers) {
    if (L.tile !== SEG.cur) continue;
    if (!(L.on || SEG.hov === L.id || SEG.sel.has(L.id))) continue;
    g.strokeStyle = L.on ? '#52e3bd' : L.color; g.lineWidth = lw; g.setLineDash([8, 6]);
    g.strokeRect(ox + L.bx * sc - 1, oy + L.by * sc - 1, L.bw * sc + 2, L.bh * sc + 2); g.setLineDash([]);
  }
  if (SEG.lasso && SEG.lasso.length > 1) {
    g.strokeStyle = '#fff'; g.lineWidth = lw; g.setLineDash([6, 5]); g.beginPath();
    SEG.lasso.forEach((p, i) => i ? g.lineTo(ox + p[0] * sc, oy + p[1] * sc) : g.moveTo(ox + p[0] * sc, oy + p[1] * sc)); g.stroke(); g.setLineDash([]);
  }
}
function segAt(x, y) {
  let best = null;
  for (const L of SEG.layers) {
    if (L.tile !== SEG.cur) continue;
    if (x < L.bx || y < L.by || x >= L.bx + L.bw || y >= L.by + L.bh) continue;
    if (L.m[(Math.floor(y) - L.by) * L.bw + Math.floor(x) - L.bx] && (!best || L.area < best.area)) best = L;
  }
  return best;
}
/* 屏幕坐标 → 拼贴墙坐标 → 落在哪张图上 → 该图内的像素坐标 */
function segWallPt(e) {
  const cv = $('#segCv'), r = cv.getBoundingClientRect();
  const W = SEG.wall.w || 1, H = SEG.wall.h || 1;
  const wx = (e.clientX - r.left) * W / r.width, wy = (e.clientY - r.top) * H / r.height;
  const tile = segTileAt(wx, wy);
  if (!tile) return { wx, wy, tile: null, x: 0, y: 0 };
  return { wx, wy, tile, x: Math.floor((wx - tile.x) / tile.sc), y: Math.floor((wy - tile.y) / tile.sc) };
}
function segPt(e) {
  const p = segWallPt(e);
  if (p.tile && p.tile !== segCurTile()) setCurTile(p.tile);
  const tl = segCurTile(); if (!tl) return [0, 0];
  return [Math.max(0, Math.min(tl.w - 1, p.x)), Math.max(0, Math.min(tl.h - 1, p.y))];
}
/* 手动新建的元素默认就是选中的 */
const _segApply = segApply;
segApply = function (full) { const before = new Set(SEG.layers.map(l => l.id)); _segApply(full); SEG.layers.forEach(l => { if (!before.has(l.id)) l.on = true; }); };

async function buildOut() {
  const items = SEG.layers.filter(l => l.on), out = [];
  if (!items.length) { toast(t('pickFirst')); return null; }
  /* 「剩下的部分也存成一层」只对当前这张图有意义（其它图的坐标不在同一个画布里） */
  if ($('#segResid') && $('#segResid').checked) {
    const here = items.filter(l => l.tile === SEG.cur);
    if (here.length) {
      const { w, h, data } = SEG.src, full = new Uint8Array(w * h);
      for (const L of here) for (let y = 0; y < L.bh; y++) for (let x = 0; x < L.bw; x++) if (L.m[y * L.bw + x]) full[(L.by + y) * w + L.bx + x] = 1;
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const g = cv.getContext('2d'), id = g.createImageData(w, h);
      for (let i = 0; i < w * h; i++) { if (full[i]) continue; const j = i * 4; id.data[j] = data[j]; id.data[j + 1] = data[j + 1]; id.data[j + 2] = data[j + 2]; id.data[j + 3] = data[j + 3]; }
      g.putImageData(id, 0, 0); out.push({ name: t('bg'), cv, x: 0, y: 0, area: 1e12 });
    }
  }
  for (const L of items) { const t = segCut(L, 1); out.push({ name: L.name, cv: t.cv, x: t.px, y: t.py, area: L.area }); await _yield(); }
  return out;
}
async function doSave() {
  segBusy(t('saving')); await _yield();
  const out = await buildOut(); segBusy('');
  if (!out) return;
  const base = String(SEG.name).replace(/\.[^.]+$/, '');
  const files = [];
  for (const o of out) files.push({ name: out.length === 1 ? base : o.name, data: await toBytes(o.cv) });
  const r = await api.saveElements({ files, group: t('grpCap', { s: new Date().toLocaleString('sv').replace(/[: ]/g, '-') }) });
  if (r && r.ok) { toast(t('savedN', { n: r.count })); renderEmpty(); if ($('#v-lib').classList.contains('on')) renderLib(); }
  else toast(t('saveFail'));
}
async function doCopy() {
  const L = SEG.layers.find(l => SEG.sel.has(l.id) && l.on) || SEG.layers.find(l => l.on);
  if (!L) { toast(t('pickOne')); return; }
  await api.copyImage(await toBytes(segCut(L, 1).cv)); toast(t('copied', { n: L.name }));
}
async function doSvg() {
  const out = await buildOut(); if (!out) return;
  out.sort((a, b) => b.area - a.area);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${SEG.src.w}" height="${SEG.src.h}" viewBox="0 0 ${SEG.src.w} ${SEG.src.h}">\n`;
  const used = new Set();
  for (const o of out) { let id = o.name.replace(/[^\w一-龥-]/g, '_') || 'layer', k = id, i = 2; while (used.has(k)) k = id + '_' + i++; used.add(k); s += `  <g id="${k}"><image x="${o.x}" y="${o.y}" width="${o.cv.width}" height="${o.cv.height}" xlink:href="${o.cv.toDataURL('image/png')}"/></g>\n`; }
  s += '</svg>';
  const ok = await api.saveAs({ name: String(SEG.name).replace(/\.[^.]+$/, '') + '-' + t('layersSuffix') + '.svg', data: new TextEncoder().encode(s), filters: [{ name: 'SVG', extensions: ['svg'] }] });
  if (ok) toast(t('svgDone'));
}
function segBindD() {
  const host = $('#v-edit');
  host.onclick = (e) => {
    const st = e.target.closest('[data-st]');
    if (st) { SEG.tool = st.dataset.st; SEG.lasso = null; $('#segTools').querySelectorAll('[data-st]').forEach(b => b.classList.toggle('on', b === st)); segParams(); return; }
    const sm = e.target.closest('[data-sm]'); if (sm) { SEG.mode = sm.dataset.sm; segParams(); return; }
    const id = e.target.id;
    if (id === 'segRe') { segBusy(t('splitting')); setTimeout(async () => { const info = await segAuto(); SEG.layers.forEach(l => l.on = false); segBusy(''); segRender(); segList(); const ti = $('#segInfo'); if (ti) ti.textContent = info; }, 20); return; }
    if (id === 'bAll') { SEG.layers.forEach(l => l.on = true); segList(); segRender(); return; }
    if (id === 'bNone') { SEG.layers.forEach(l => l.on = false); segList(); segRender(); return; }
    if (id === 'bDel') {
      const killed = SEG.layers.filter(l => l.on);
      if (!killed.length) { toast(t('pickOne')); return; }
      SEG.layers = SEG.layers.filter(l => !l.on); SEG.sel.clear(); segList(); segRender();
      undoToast(t('delUndo', { n: killed.length }), {
        undo: () => { SEG.layers.push.apply(SEG.layers, killed); killed.forEach(l => l.on = true); SEG.sel = new Set(killed.map(l => l.id)); segList(); segRender(); }
      });
      return;
    }
    if (id === 'bMerge') {
      const ls = SEG.layers.filter(l => l.on); if (ls.length < 2) { toast(t('pickTwo')); return; }
      const { w, h } = SEG.src, full = new Uint8Array(w * h);
      for (const L of ls) { const f = segFull(L); for (let i = 0; i < f.length; i++) if (f[i]) full[i] = 1; }
      const nl = segLayerFromFull(full, w, h, ls[0].name); nl.on = true; nl.autoName = ls[0].autoName;
      SEG.layers = SEG.layers.filter(l => !l.on); SEG.layers.push(nl); SEG.sel = new Set([nl.id]); segList(); segRender(); return;
    }
    if (id === 'bSave') { doSave(); return; }
    if (id === 'bCopy') { doCopy(); return; }
    if (id === 'bSvg') { doSvg(); return; }
    if (id === 'bNew') { api.importImage(); return; }
    if (id === 'bClear') {
      const killed = SEG.layers.slice();
      if (!killed.length) { toast(t('noElems')); return; }
      SEG.layers = []; SEG.sel.clear(); segList(); segRender();
      undoToast(t('segCleared', { n: killed.length }), {
        undo: () => { SEG.layers.push.apply(SEG.layers, killed); killed.forEach(l => l.on = false); segList(); segRender(); }
      });
      return;
    }
    const row = e.target.closest('.segRow, .segCard');
    if (row && !e.target.matches('input')) {
      const L = SEG.layers.find(l => l.id === row.dataset.l);
      if (L) {
        const tile = SEG.tiles[L.tile];
        if (tile && tile !== segCurTile()) setCurTile(tile);   // 点哪张图的元素，就切到那张图
        L.on = !L.on; SEG.sel = new Set([L.id]); segList(); segRender();
      }
    }
  };
  host.oninput = (e) => {
    const sp = e.target.dataset && e.target.dataset.sp;
    if (sp) { const v = sp === 'how' ? e.target.value : +e.target.value; SEG[sp] = v; const b = e.target.parentElement && e.target.parentElement.querySelector('b'); if (b) b.textContent = v; if (sp === 'how') segParams(); return; }
    if (e.target.dataset && e.target.dataset.ln) { const L = SEG.layers.find(l => l.id === e.target.dataset.ln); if (L) { L.name = e.target.value; L.autoName = null; } }  /* 用户自己改过名字，就不再跟着语言变 */
  };
  host.onchange = (e) => {
    if (e.target.dataset && e.target.dataset.lc) { const L = SEG.layers.find(l => l.id === e.target.dataset.lc); if (L) { L.on = e.target.checked; if (L.on) SEG.sel = new Set([L.id]); segList(); segRender(); } }
  };
  const cv = $('#segCv');
  cv.onpointermove = (e) => {
    const p = segWallPt(e);
    if (p.tile !== segCurTile()) { if (SEG.hov) { SEG.hov = null; segRender(); } return; }
    if (SEG.tool === 'lasso' && SEG.lasso) { SEG.lasso.push(segPt(e)); segRender(); return; }
    if (SEG.tool !== 'pick') return;
    const [x, y] = segPt(e), L = segAt(x, y), id = L ? L.id : null; if (id !== SEG.hov) { SEG.hov = id; segRender(); }
  };
  cv.onpointerleave = () => { if (SEG.hov) { SEG.hov = null; segRender(); } };
  cv.onpointerdown = async (e) => {
    const [x, y] = segPt(e);
    if (SEG.tool === 'pick') {
      const L = segAt(x, y);
      if (L) { L.on = !L.on; SEG.sel = new Set([L.id]); segList(); segRender(); }
      return;
    }
    if (SEG.tool === 'wand') { segApply(segWand(x, y, SEG.wtol || 32)); segList(); segRender(); return; }
    if (SEG.tool === 'ai') { await segAIClick(x, y); segList(); return; }
    if (SEG.tool === 'lasso') { cv.setPointerCapture(e.pointerId); SEG.lasso = [[x, y]]; }
  };
  cv.onpointerup = () => {
    if (SEG.tool !== 'lasso' || !SEG.lasso) return;
    const pts = SEG.lasso; SEG.lasso = null; if (pts.length < 4) { segRender(); return; }
    const { w, h } = SEG.src, c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fill();
    const d = g.getImageData(0, 0, w, h).data, full = new Uint8Array(w * h); for (let i = 0; i < full.length; i++) full[i] = d[i * 4 + 3] > 127 ? 1 : 0;
    segApply(full); segList(); segRender();
  };
}
/* 键盘：Enter 保存，Esc 收起，Ctrl+A 全选 */
document.addEventListener('keydown', (e) => {
  if (/^(INPUT|SELECT|TEXTAREA)$/.test((e.target.tagName || '')) && e.target.type !== 'checkbox' && e.target.type !== 'range') return;
  if (!$('#v-edit').classList.contains('on') || !SEG.src) { if (e.key === 'Escape') api.hideWindow(); return; }
  if (e.key === 'Enter') { e.preventDefault(); if (SEG.layers.some(l => l.on)) doSave(); }
  else if (e.key === 'Escape') api.hideWindow();
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); SEG.layers.forEach(l => l.on = true); segList(); segRender(); }
});

async function openDataURL(url, name) {
  try {
    /* 用 onload 而不是 decode()：decode() 在窗口隐藏时可能永远不返回 */
    const img = new Image();
    await new Promise((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('img')); img.src = url; });
    return await openImage(img, img.naturalWidth, img.naturalHeight, name);
  } catch (e) { toast(t('badImg')); }
}
async function openFile(f) {
  try { const bm = await createImageBitmap(f); return await openImage(bm, bm.width, bm.height, f.name || t('image')); } catch (e) { toast(t('badImg')); }
}
/* 批量导入：一次选多张，依次拆开，元素全部汇总 */
async function openFiles(list) {
  let n = 0;
  for (const f of list) { const c = await openFile(f); if (c) n += c; }
  toast(t('batchDone', { img: list.length, n }));
  return n;
}
/* 外部拖图进来：按当前页签决定怎么处理
 * 拆元素页 → 导入并拆解；画板 → 当图层/底图；素材库 → 直接存进库；SVG 库 / SVG 画布 → 当 SVG 处理 */
const curView = () => { const v = document.querySelector('.view.on'); return v ? v.id : 'v-edit'; };
const DROP_HINT = { 'v-edit': 'dropToSplit', 'v-lib': 'dropToLib', 'v-svglib': 'dropToSvgLib', 'v-svgcanvas': 'dropToSvgCanvas' };
['dragover', 'dragenter'].forEach(ev => document.addEventListener(ev, e => {
  e.preventDefault();
  const d = $('#drop'); if (d) d.classList.add('over');
  const h = $('#dropHint');
  if (h) { h.textContent = t(DROP_HINT[curView()] || 'dropToSplit'); h.classList.add('on'); }
}));
['dragleave', 'drop'].forEach(ev => document.addEventListener(ev, e => {
  e.preventDefault();
  const d = $('#drop'); if (d) d.classList.remove('over');
  const h = $('#dropHint'); if (h) h.classList.remove('on');
}));
document.addEventListener('drop', async (e) => {
  const files = [...(e.dataTransfer && e.dataTransfer.files || [])].filter(x => x.type && x.type.startsWith('image/'));
  if (!files.length) return;
  const v = curView();
  if (v === 'v-board') return;                                     // 画板自己接（拖进去当图层 / 首张当底图）
  if (v === 'v-lib') { await saveDroppedToLib(files[0]); return; }
  if ((v === 'v-svglib' || v === 'v-svgcanvas') && /svg/i.test((files[0].type || '') + files[0].name)) {
    if (v === 'v-svglib') { await SvgLib.importFile(files[0]); } else { await SvgCanvas.openFile(files[0]); }
    return;
  }
  await openFiles(files);                                           // 拆元素：一次多张，全部拆开
});
/* 把图片从桌面拖到左侧导航按钮上 = 直接用那个功能处理它（和拖进右边工作区不一样） */
const NAV_DROP = {
  edit: (f) => openFile(f),                 // 拆元素：导入并拆
  lib: (f) => saveDroppedToLib(f),         // 素材库：直接存进去
  board: (f) => addFileToBoard(f),         // 画板：加一个图层
  svglib: (f) => SvgLib.importFile(f),     // SVG 库：存成 SVG
  svgcanvas: (f) => SvgCanvas.openFile(f)  // SVG 画布：直接打开
};
$('#nav').addEventListener('dragover', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  b.classList.add('drop');
});
$('#nav').addEventListener('dragleave', (e) => {
  const b = e.target.closest('button'); if (b) b.classList.remove('drop');
});
$('#nav').addEventListener('drop', async (e) => {
  const b = e.target.closest('button'); if (!b) return;
  e.preventDefault(); e.stopPropagation();          // 别让全局 drop 又处理一遍
  b.classList.remove('drop');
  const f = [...(e.dataTransfer && e.dataTransfer.files || [])].find(x => x.type && x.type.startsWith('image/'));
  if (!f) return;
  const fn = NAV_DROP[b.dataset.v];
  if (!fn) { toast(t('navDropNo')); return; }
  await fn(f);
});
/* 拖到画板：加一个图层 */
async function addFileToBoard(f) {
  try { showView('board'); Board.enter(); await Board.addFile(f, null); }
  catch (e) { console.error('addFileToBoard', e); toast(t('badImg')); }
}
/* 拖到素材库：直接存进去 */
async function saveDroppedToLib(f) {
  try {
    const data = new Uint8Array(await f.arrayBuffer());
    const r = await api.saveElements({ files: [{ name: (f.name || t('image')).replace(/\.[^.]+$/, ''), data }], group: '', quiet: true });
    if (r && r.ok) { toast(t('savedLibDrop')); if ($('#v-lib').classList.contains('on')) renderLib(); } else toast(t('saveFail'));
  } catch (e) { toast(t('saveFail')); }
}
document.addEventListener('paste', (e) => { const f = [...(e.clipboardData && e.clipboardData.files || [])].find(f => f.type.startsWith('image/')); if (f) openFile(f); });

/* ───────── 素材库 ───────── */
async function renderLib() {
  const el = $('#v-lib');
  el.innerHTML = '<div class="page"><div class="tip">' + t('libLoading') + '</div></div>';
  const list = await api.listLib();
  const groups = {};
  for (const it of list) { const g = it.group || t('noGroup'); (groups[g] = groups[g] || []).push(it); }
  el.innerHTML = `<div class="page"><div class="libHead"><h2 class="pt">${t('libTitle')}</h2><span class="sp"></span><button class="btn" id="lbOpen">${t('libOpen')}</button><button class="btn ghost" id="lbRef">${t('libRefresh')}</button><button class="btn danger" id="lbClear">${t('libClear')}</button></div>
  <p class="lead">${t('libLead', { n: list.length, p: '<span class="path">' + esc(CFG ? CFG.saveDir : '') + '</span>' })}<br>${t('libLead2')}</p>
  ${list.length ? Object.entries(groups).map(([g, items]) => `<div class="gh"><b>${esc(g)}</b><span>${t('nItems', { n: items.length })}</span></div><div class="grid">${items.map(it => `<div class="cell" data-rel="${esc(it.rel)}" data-copy title="${t('clickCopy')}"><div class="im"><img loading="lazy" src="${esc(it.url)}"></div><div class="nm" title="${esc(it.name)}">${esc(it.name)}</div><div class="bar"><button class="btn sm" data-act="board" title="${t('toBoardTip')}">${t('toBoard')}</button><button class="btn sm" data-act="reveal" title="${t('revealTip')}">${t('reveal')}</button><button class="btn sm danger" data-act="del" title="${t('delTip')}">${t('del')}</button></div></div>`).join('')}</div>`).join('') : '<div class="blank"><b>' + t('libEmptyT') + '</b><span>' + t('libEmptyD') + '</span></div>'}</div>`;
  $('#lbOpen').onclick = () => api.openDir(); $('#lbRef').onclick = renderLib;
  $('#lbClear').onclick = () => clearAllPending('#v-lib', 'libClearUndo', 'libCleared');
  el.onclick = async (e) => {
    const cell = e.target.closest('.cell'); if (!cell) return; const rel = cell.dataset.rel;
    const b = e.target.closest('[data-act]');
    if (b && b.dataset.act === 'reveal') { api.revealLib(rel); return; }
    if (b && b.dataset.act === 'board') { await addLibToBoard(rel); return; }
    if (b && b.dataset.act === 'del') {
      /* 删除先不落地，给 3 秒反悔：撤回就取消，超时才真正进回收站 */
      cell.classList.add('pending');
      let undone = false;
      undoToast(t('delUndoFile'), {
        undo: () => { undone = true; cell.classList.remove('pending'); toast(t('undone')); },
        expire: async () => {
          if (undone) return;
          cell.classList.remove('pending');
          if (await api.delLib(rel)) { cell.remove(); toast(t('trashed')); } else toast(t('delFail'));
        }
      });
      return;
    }
    await api.copyLib(rel); toast(t('copiedPaste'));
  };
}

/* 批量清空：先全部标记成“待删”，3 秒内可以撤回，超时才真的进回收站 */
async function clearAllPending(rootSel, undoKey, doneKey) {
  const cells = [...document.querySelectorAll(rootSel + ' .cell')];
  if (!cells.length) return;
  const items = cells.map(c => ({ cell: c, rel: c.dataset.rel }));
  items.forEach(x => x.cell.classList.add('pending'));
  let undone = false;
  undoToast(t(undoKey, { n: items.length }), {
    undo: () => { undone = true; items.forEach(x => x.cell.classList.remove('pending')); toast(t('undone')); },
    expire: async () => {
      if (undone) return;
      let n = 0;
      for (const x of items) { if (await api.delLib(x.rel)) { x.cell.remove(); n++; } else x.cell.classList.remove('pending'); }
      toast(t(doneKey, { n }));
    }
  });
}

/* 素材库 → 画板：复制一份进画板，素材本身留在库里，可以反复用 */
async function addLibToBoard(rel) {
  try {
    const bytes = await api.readLib(rel); if (!bytes) throw new Error('read');
    const ext = (rel.split('.').pop() || 'png').toLowerCase();
    const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }[ext] || 'image/png';
    const im = await Board.imgFromBlob(new Blob([bytes], { type: mime }));
    showView('board'); Board.enter();          // 先把画板挂好，再放图层
    Board.addLayer(im, rel.split('/').pop(), null, false);
    toast(t('addedToBoard'));
  } catch (e) { toast(t('badImg')); }
}

/* ───────── 设置 ───────── */
function accFromEvent(e) {
  const mods = [];
  if (e.ctrlKey || e.metaKey) mods.push('CommandOrControl');
  if (e.altKey) mods.push('Alt'); if (e.shiftKey) mods.push('Shift');
  let k = e.key; if (['Control', 'Shift', 'Alt', 'Meta'].includes(k)) return null;
  if (/^[a-z]$/i.test(k)) k = k.toUpperCase(); else if (/^[0-9]$/.test(k)) { } else if (/^F\d{1,2}$/.test(k)) { }
  else { const map = { ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace' }; k = map[k]; if (!k) return null; }
  if (!mods.length) return null;
  return [...mods, k].join('+');
}
/* 迷你 Markdown：标题 / 列表 / 粗体 / 行内代码 / 链接，够显示更新日志和隐私政策 */
function md(src) {
  const inl = (x) => esc(x).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '<a href="#" data-ext="$2">$1</a>');
  let h = '', ul = false;
  for (const line of String(src).split(/\r?\n/)) {
    const m = line.match(/^(#{1,3})\s+(.*)/), li = line.match(/^\s*[-*]\s+(.*)/);
    if (li) { if (!ul) { h += '<ul>'; ul = true; } h += '<li>' + inl(li[1]) + '</li>'; continue; }
    if (ul) { h += '</ul>'; ul = false; }
    if (m) h += `<h${m[1].length}>${inl(m[2])}</h${m[1].length}>`;
    else if (line.trim()) h += '<p>' + inl(line) + '</p>';
  }
  return h + (ul ? '</ul>' : '');
}
async function showDoc(name, title) {
  let m = $('#docModal');
  if (!m) { m = document.createElement('div'); m.id = 'docModal'; document.body.appendChild(m); }
  const text = await api.getDoc(name);
  m.innerHTML = `<div class="card"><header><span>${esc(title)}</span><span class="sp"></span><button class="btn sm" id="docX">${t('close')}</button></header><div id="docBody">${text ? md(text) : '<p>' + t('noDoc') + '</p>'}</div></div>`;
  m.classList.add('on');
  const close = () => m.classList.remove('on');
  $('#docX').onclick = close; m.onclick = (e) => { if (e.target === m) close(); };
  $('#docBody').onclick = (e) => { const a = e.target.closest('a[data-ext]'); if (a) { e.preventDefault(); api.openExternal(a.dataset.ext); } };
}
document.addEventListener('keydown', (e) => { const m = $('#docModal'); if (e.key === 'Escape' && m && m.classList.contains('on')) { e.stopPropagation(); m.classList.remove('on'); } }, true);

let UPD = null;            // 启动时查到的新版本
async function renderSettings() {
  CFG = await api.getSettings(); applyAll();
  const el = $('#v-set');
  const sw = (id, on) => `<input type="checkbox" class="sw" id="${id}" ${on ? 'checked' : ''}>`;
  const opt = (v, cur, label) => `<option value="${v}"${v === cur ? ' selected' : ''}>${label}</option>`;
  const kb = (a) => `<kbd style="font-size:13px;padding:3px 10px">${esc(pretty(a))}</kbd>`;
  el.innerHTML = `<div class="page"><h2 class="pt">${t('setTitle')}</h2><p class="lead">${t('setLead')}</p>
  ${UPD ? `<div class="banner"><span>${t('newVer', { v: '<b>' + esc(UPD.latest) + '</b>' })}</span><span class="sp"></span><button class="btn sm primary" id="bnGo">${t('goDl')}</button></div>` : ''}
  <div class="set"><h3>${t('sGeneral')}</h3>
    <div class="item"><div><div class="t">${t('sLang')}</div><div class="d">${t('sLangD')}</div></div>
      <select id="sLang">${opt('auto', CFG.lang, t('langAuto'))}${I18N.langs.map(l => opt(l, CFG.lang, I18N.D[l].langName)).join('')}</select></div>
    <div class="item"><div><div class="t">${t('sTheme')}</div><div class="d">${t('sThemeD')}</div></div>
      <select id="sTheme">${opt('auto', CFG.theme, t('themeAuto'))}${opt('dark', CFG.theme, t('themeDark'))}${opt('light', CFG.theme, t('themeLight'))}</select></div>
    <label class="item"><div><div class="t">${t('sLogin')}</div><div class="d">${t('sLoginD')}</div></div>${sw('sLogin', CFG.openAtLogin)}</label>
    <div class="item"><div><div class="t">${t('sClose')}</div><div class="d">${t('sCloseD')}</div></div>
      <select id="sClose">${opt('1', CFG.closeToTray === false ? '0' : '1', t('closeTray'))}${opt('0', CFG.closeToTray === false ? '0' : '1', t('closeQuit'))}</select></div>
    <label class="item"><div><div class="t">${t('sNotify')}</div><div class="d">${t('sNotifyD')}</div></div>${sw('sNotify', CFG.notify)}</label></div>
  <div class="set"><h3>${t('sSaveHk')}</h3>
    <div class="item"><div><div class="t">${t('sDir')}</div><div class="path" id="sDir">${esc(CFG.saveDir)}</div><div class="d">${t('sDirD')}</div></div><div class="row2"><button class="btn" id="sPick">${t('change')}</button><button class="btn ghost" id="sOpen">${t('open')}</button></div></div>
    <div class="item"><div><div class="t">${t('sHk1')}</div><div class="d">${t('sHk1D')}<span id="sRecTip" style="color:var(--mint)"></span></div></div><div class="row2">${kb(CFG.hotkey)}<button class="btn" id="sRec">${t('modify')}</button></div></div>
    <div class="item"><div><div class="t">${t('sHk2')}</div><div class="d">${t('sHk2D')}<span id="sRecTip2" style="color:var(--mint)"></span></div></div><div class="row2">${kb(CFG.hotkey2)}<button class="btn" id="sRec2">${t('modify')}</button></div></div>
    <div class="item"><div><div class="t">${t('hkReset')}</div></div><button class="btn ghost" id="sHkReset">${t('resetBtn')}</button></div>
    <label class="item"><div><div class="t">${t('sHide')}</div><div class="d">${t('sHideD')}</div></div>${sw('sHide', CFG.autoHide)}</label></div>
  <div class="set"><h3>${t('sLink')}</h3>
    <label class="item"><div><div class="t">${t('sLinkOn')}</div><div class="d">${t('sLinkOnD')}</div></div>${sw('sLink', CFG.linkEnabled)}</label>
    <div class="item"><div><div class="t"><span class="dot ${CFG.serverRunning ? 'ok' : 'bad'}"></span>${CFG.serverRunning ? t('srvOn') : t('srvOff')}</div><div class="d">${t('srvD')}</div></div><div class="row2"><input type="text" id="sPort" value="${CFG.port}" style="width:84px"><button class="btn" id="sPortOk">${t('apply')}</button></div></div>
    <div class="item"><div class="d" style="margin:0">${t('linkHow', { app: esc(CFG.name) })}</div><span></span></div></div>
  <div class="set"><h3>${t('sPriv')}</h3>
    <label class="item"><div><div class="t">${t('sUpd')}</div><div class="d">${t('sUpdD')}</div></div>${sw('sUpd', CFG.checkUpdate)}</label>
    <div class="item"><div><div class="t">${t('sUpdNow')}</div><div class="d" id="updMsg"></div></div><button class="btn" id="sUpdNow">${t('sUpdNow')}</button></div>
    <div class="item"><div><div class="t">${t('sPrivDoc')}</div><div class="d">${t('sPrivDocD')}</div></div><button class="btn" id="sPrivDoc">${t('view')}</button></div></div>
  <div class="set"><h3>${t('sAbout')}</h3>
    <div class="about"><img src="icon.png" alt=""><div><div class="nm">${esc(CFG.name)}</div><div class="vs">${t('sVer')} ${esc(CFG.version)} · ${t('sVerD', { e: CFG.versions.electron, c: CFG.versions.chrome, n: CFG.versions.node })}</div></div></div>
    <div class="item"><div><div class="t">${t('sLog')}</div><div class="d">${t('sLogD')}</div></div><button class="btn" id="sLog">${t('view')}</button></div>
    <div class="item"><div><div class="t">${t('sLic')}</div><div class="d">${t('sLicD')}</div></div><span></span></div>
    <div class="item"><div><div class="t">${t('sHome')}</div><div class="d">${t('sHomeD')}</div></div><button class="btn" id="sGit">${t('github')}</button></div>
    <div class="item"><div><div class="t">${t('sData')}</div><div class="d path">${esc(CFG.userData)}</div><div class="d">${t('sDataD')}</div></div><button class="btn ghost" id="sData">${t('open')}</button></div>
    <div class="item"><div><div class="t">${t('sReset')}</div><div class="d">${t('sResetD')}</div></div><button class="btn danger" id="sReset">${t('resetBtn')}</button></div></div>
  <p class="tip">${esc(CFG.name)} ${esc(CFG.version)} · ${t('footNote')}</p></div>`;
  const set = async (patch, quiet) => { const r = await api.setSettings(patch); if (r.settings) CFG = r.settings; if (!r.ok && !quiet) toast(r.msgs.join('；')); return r; };
  $('#sLang').onchange = async (e) => {
    await set({ lang: e.target.value }); applyAll();
    if (SEG.src) { buildEdit(); segList(); segRender(); } else renderEmpty();
    renderSettings();
  };
  $('#sTheme').onchange = async (e) => { await set({ theme: e.target.value }); applyTheme(); };
  $('#sClose').onchange = (e) => set({ closeToTray: e.target.value === '1' });
  $('#sPick').onclick = async () => { const d = await api.pickDir(); if (d) { await set({ saveDir: d }); renderSettings(); } };
  $('#sOpen').onclick = () => api.openDir();
  $('#sHide').onchange = (e) => set({ autoHide: e.target.checked });
  $('#sNotify').onchange = (e) => set({ notify: e.target.checked });
  $('#sLogin').onchange = (e) => set({ openAtLogin: e.target.checked });
  $('#sLink').onchange = async (e) => { await set({ linkEnabled: e.target.checked }); renderSettings(); };
  $('#sPortOk').onclick = async () => { const p = +$('#sPort').value; if (!(p >= 1024 && p <= 65535)) { toast(t('portBad')); return; } const r = await set({ port: p }, true); toast(r.ok ? t('portOk') : r.msgs.join('；')); renderSettings(); };
  $('#sUpd').onchange = (e) => set({ checkUpdate: e.target.checked });
  $('#sHkReset').onclick = async () => { await set({ hotkey: CFG.defaults.hotkey, hotkey2: CFG.defaults.hotkey2 }); refreshHint(); renderSettings(); };
  $('#sUpdNow').onclick = async () => {
    const m = $('#updMsg'); m.textContent = t('checking');
    const u = await api.checkUpdate();
    if (!u.ok) { m.textContent = u.code === 'norepo' ? t('updNoRepo') : t('updFail', { e: u.msg || '' }); return; }
    if (u.newer) { UPD = u; m.innerHTML = t('newVer', { v: '<b>' + esc(u.latest) + '</b>' }) + ' · <a href="#" id="updGo" style="color:var(--mint)">' + t('goDl') + '</a>'; $('#updGo').onclick = (e) => { e.preventDefault(); api.openExternal(u.url); }; }
    else m.textContent = t('upToDate', { v: u.current });
  };
  if ($('#bnGo')) $('#bnGo').onclick = () => api.openExternal(UPD.url);
  $('#sPrivDoc').onclick = () => showDoc('PRIVACY', t('sPrivDoc'));
  $('#sLog').onclick = () => showDoc('CHANGELOG', t('sLog'));
  $('#sGit').onclick = () => api.openExternal(CFG.repoUrl);
  $('#sData').onclick = () => api.openUserData();
  $('#sReset').onclick = async () => { if (!confirm(t('resetAsk'))) return; CFG = await api.resetSettings(); applyAll(); renderEmpty(); toast(t('resetDone')); renderSettings(); };
  const rec = (btn, tipId, key) => { $(btn).onclick = () => {
    const tip = $(tipId); tip.textContent = t('pressKeys');
    const h = async (e) => {
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Escape') { document.removeEventListener('keydown', h, true); tip.textContent = ''; return; }
      const acc = accFromEvent(e); if (!acc) return;
      document.removeEventListener('keydown', h, true);
      const r = await set({ [key]: acc }, true);
      if (!r.ok) toast(r.msgs.join('；')); else toast(t('hkChanged', { k: pretty(acc) }));
      renderSettings(); refreshHint();
    };
    document.addEventListener('keydown', h, true);
  }; };
  rec('#sRec', '#sRecTip', 'hotkey'); rec('#sRec2', '#sRecTip2', 'hotkey2');
}
function refreshHint() { const f = (a) => pretty(a).replace(/ \+ /g, '+'); $('#hkTip').innerHTML = CFG ? `${esc(f(CFG.hotkey))}<br>${esc(f(CFG.hotkey2))}` : ''; }

/* ───────── 启动 ───────── */
(async function () {
  CFG = await api.getSettings(); applyAll(); renderEmpty();
  api.onImage((d) => openDataURL(d.dataURL, d.name));
  api.onImages((d) => { (async () => { for (const it of d.items || []) await openDataURL(it.dataURL, it.name); })(); });
  api.onSettings((s) => { CFG = s; applyAll(); });
  api.onToast((m) => toast(m));
  api.onNav((v) => showView(v));
  api.onUpdate((u) => { UPD = u; });
})();
