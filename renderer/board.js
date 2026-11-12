/* PixPeel · 画板：用素材库里的元素（或导入的图片）拼图，导出成一张图。
 * 依赖 app.js 的 $ / api / toast / CFG，以及 i18n.js 的 t()。 */
const Board = (() => {
  const B = {
    W: 1080, H: 1080, bg: 'transparent', layers: [], sel: null, seq: 1,
    zoom: 0.5, px: 0, py: 0, fmt: 'png', sizeTouched: false,
    lang: '', mounted: false, fitted: false, space: false, mode: null
  };
  const PRESETS = [['1080x1080', '1:1 · 1080×1080'], ['1920x1080', '16:9 · 1920×1080'], ['1080x1920', '9:16 · 1080×1920'],
  ['1600x1200', '4:3 · 1600×1200'], ['1200x1600', '3:4 · 1200×1600'], ['512x512', '512×512'], ['2480x3508', 'A4 · 2480×3508']];
  const SWATCHES = ['transparent', '#ffffff', '#f2f2f2', '#111111', '#52e3bd', '#ff6b6b', '#ffd166', '#4dabf7', '#b197fc'];
  const MIN = 16, MAX = 8192, MAXPX = 50e6;
  const cache = new Map();   // 素材 rel → Image
  const isOn = () => { const v = $('#v-board'); return !!(v && v.classList.contains('on')); };
  const sel = () => B.layers.find(l => l.id === B.sel) || null;
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#52e3bd';
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ───────── 撤回 / 重做 ───────── */
  const H = { u: [], r: [], key: '', t: 0 };
  const snapB = () => ({ W: B.W, H: B.H, bg: B.bg, sel: B.sel, L: B.layers.map(l => Object.assign({}, l)),
    k: JSON.stringify([B.W, B.H, B.bg, B.layers.map(l => [l.id, l.x, l.y, l.s, l.r])]) });
  function hpush(b) { if (b.k === snapB().k) return; H.u.push(b); if (H.u.length > 80) H.u.shift(); H.r = []; hui(); }
  /** 做一步操作并记入历史；key 相同且间隔很短的连续操作（拖取色器、连按方向键）合并成一步 */
  function act(fn, key) {
    const co = key && H.key === key && Date.now() - H.t < 700; H.key = key || ''; H.t = Date.now();
    const b = co ? null : snapB(); fn(); if (b) hpush(b);
  }
  function hrestore(b) {
    B.W = b.W; B.H = b.H; B.bg = b.bg; B.layers = b.L.map(o => Object.assign({}, o)); B.sel = b.sel;
    syncSize(); syncSw(); draw(); tools(); hui();
  }
  function undo() { if (!H.u.length) return; H.r.push(snapB()); hrestore(H.u.pop()); H.key = ''; }
  function redo() { if (!H.r.length) return; H.u.push(snapB()); hrestore(H.r.pop()); H.key = ''; }
  function hui() { const a = $('#bdUndo'), b = $('#bdRedo'); if (a) a.disabled = !H.u.length; if (b) b.disabled = !H.r.length; }

  /* ───────── 界面 ───────── */
  function html() {
    return `<div class="bd">
    <aside class="bd-mat"><div class="bd-h"><b>${t('bdMat')}</b><span class="sp"></span><button class="btn sm ghost" id="bdRef">${t('bdRefresh')}</button></div>
      <div class="bd-tip">${t('bdMatTip')}</div><div class="bd-matList" id="bdMat"></div></aside>
    <div class="bd-main">
      <div class="bd-bar">
        <div class="bd-g"><span>${t('bdCanvas')}</span><select id="bdPre">${PRESETS.map(p => `<option value="${p[0]}">${p[1]}</option>`).join('')}<option value="custom">${t('bdCustom')}</option></select>
          <input id="bdW" type="number" min="${MIN}" max="${MAX}"><span>×</span><input id="bdH" type="number" min="${MIN}" max="${MAX}"><span>px</span></div>
        <div class="bd-g"><span>${t('bdBg')}</span><div class="bd-sw" id="bdSw">${SWATCHES.map(c => `<i data-c="${c}" class="${c === 'transparent' ? 'tp' : ''}" style="${c === 'transparent' ? '' : 'background:' + c}" title="${c === 'transparent' ? t('bdTransparent') : c}"></i>`).join('')}</div>
          <input type="color" id="bdCol" value="#ffffff" title="${t('bdPickColor')}"></div>
        <div class="bd-act"><button class="btn" id="bdImp">${t('bdImport')}</button>
        <button class="btn" id="bdToLib">${t('bdToLib')}</button>
        <select id="bdFmt"><option value="png">PNG</option><option value="jpg">JPG</option></select>
        <button class="btn primary" id="bdExp">${t('bdExport')}</button></div>
      </div>
      <div class="bd-stage" id="bdStage"><canvas id="bdCv"></canvas><div class="bd-empty" id="bdEmpty">${t('bdEmptyHint')}</div></div>
      <div class="bd-bar bd-bot">
        <div class="bd-g"><button class="btn sm" id="bdUndo" title="${t('undo')} (Ctrl+Z)">↶</button><button class="btn sm" id="bdRedo" title="${t('redoH')} (Ctrl+Shift+Z)">↷</button></div>
        <div class="bd-g" id="bdTools"><span>${t('bdAngle')}</span><input id="bdAng" type="number" min="-180" max="180" step="1">°
          <span>${t('bdSize')}</span><input id="bdScl" type="number" min="2" max="5000" step="1">%
          <button class="btn sm" id="bdR90" title="${t('bdRot90')}">⟳ 90°</button>
          <button class="btn sm" id="bdUp" title="${t('bdUp')}">↑</button><button class="btn sm" id="bdDn" title="${t('bdDown')}">↓</button>
          <button class="btn sm danger" id="bdDel" title="${t('bdDelete')} (Del)">${t('bdDelete')}</button></div>
        <span class="sp"></span><span class="bd-hint">${t('bdPan')}</span>
        <div class="bd-g"><button class="btn sm" id="bdZo" title="${t('bdZoomOut')}">−</button><b id="bdZl" class="bd-zl">50%</b><button class="btn sm" id="bdZi" title="${t('bdZoomIn')}">+</button>
          <button class="btn sm" id="bdFit">${t('bdFit')}</button><select id="bdZp" title="${t('zoomMode')}"><option value="">${t('zoomMode')}</option><option value="fit">${t('bdFit')} (0)</option><option value="0.25">25%</option><option value="0.5">50%</option><option value="1">100% (1)</option><option value="2">200%</option><option value="4">400%</option><option value="sel">${t('zoomSel')}</option></select></div>
      </div>
    </div>
    <input type="file" id="bdFile" accept="image/*" multiple hidden></div>`;
  }

  function mount() {
    const v = $('#v-board'); v.innerHTML = html(); B.lang = I18N.lang; B.mounted = true;
    const st = $('#bdStage'), cv = $('#bdCv');
    $('#bdRef').onclick = loadMat;
    $('#bdImp').onclick = () => $('#bdFile').click();
    $('#bdFile').onchange = async (e) => { for (const f of [...e.target.files]) await addFile(f, null); e.target.value = ''; };
    $('#bdPre').onchange = (e) => { if (e.target.value === 'custom') return; const [w, h] = e.target.value.split('x').map(Number); B.sizeTouched = true; act(() => setSize(w, h, true)); };
    const onSz = () => { const w = +$('#bdW').value, h = +$('#bdH').value; if (!(w >= MIN && w <= MAX && h >= MIN && h <= MAX) || w * h > MAXPX) { toast(t('bdSizeBad', { min: MIN, max: MAX })); syncSize(); return; } B.sizeTouched = true; act(() => setSize(w, h, true)); };
    $('#bdW').onchange = onSz; $('#bdH').onchange = onSz;
    $('#bdSw').onclick = (e) => { const i = e.target.closest('i'); if (i) act(() => setBg(i.dataset.c)); };
    $('#bdCol').oninput = (e) => act(() => setBg(e.target.value), 'bg');
    $('#bdFmt').value = B.fmt; $('#bdFmt').onchange = (e) => { B.fmt = e.target.value; };
    $('#bdExp').onclick = exportFile; $('#bdToLib').onclick = toLibrary;
    $('#bdAng').onchange = (e) => { const l = sel(); if (!l) return; act(() => { l.r = (+e.target.value || 0) * Math.PI / 180; draw(); }); };
    $('#bdScl').onchange = (e) => { const l = sel(); if (!l) return; act(() => { l.s = clamp((+e.target.value || 100) / 100, 0.02, 50); draw(); }); };
    $('#bdR90').onclick = () => { const l = sel(); if (l) act(() => { l.r += Math.PI / 2; draw(); tools(); }); };
    $('#bdUp').onclick = () => order(1); $('#bdDn').onclick = () => order(-1); $('#bdDel').onclick = del;
    $('#bdZi').onclick = () => zoomAt(1.25); $('#bdZo').onclick = () => zoomAt(1 / 1.25);
    $('#bdFit').onclick = fit;
    $('#bdZp').onchange = (e) => { const v = e.target.value; e.target.value = ''; if (v === 'fit') fit(); else if (v === 'sel') zoomSel(); else if (v) zoomTo(+v); };
    $('#bdUndo').onclick = undo; $('#bdRedo').onclick = redo;
    st.addEventListener('wheel', (e) => { e.preventDefault(); const r = cv.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    st.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    st.addEventListener('drop', async (e) => {
      e.preventDefault(); e.stopPropagation();
      const r = cv.getBoundingClientRect(), at = toDoc(e.clientX - r.left, e.clientY - r.top);
      const rel = e.dataTransfer.getData('text/x-pixpeel-rel');
      if (rel) { await addMat(rel, at); return; }
      for (const f of [...(e.dataTransfer.files || [])].filter(f => f.type.startsWith('image/'))) await addFile(f, at);
    });
    if (window.ResizeObserver) new ResizeObserver(() => { if (isOn()) { if (!B.fitted) fit(); else draw(); } }).observe(st);
    syncSize(); syncSw(); tools(); hui(); loadMat();
  }

  /* ───────── 素材侧栏 ───────── */
  async function loadMat() {
    const box = $('#bdMat'); if (!box) return;
    let list = []; try { list = await api.listLib(); } catch (e) { }
    if (!list.length) { box.innerHTML = `<div class="bd-none">${t('bdMatEmpty')}</div>`; return; }
    const groups = {}; for (const it of list) (groups[it.group || t('noGroup')] = groups[it.group || t('noGroup')] || []).push(it);
    box.innerHTML = Object.entries(groups).map(([g, items]) => `<div class="bd-gh">${esc(g)}</div><div class="bd-grid">${items.map(it => `<div class="bd-tile" draggable="true" data-rel="${esc(it.rel)}" title="${esc(it.name)}"><img src="${esc(it.url)}" alt="" draggable="false" loading="lazy"></div>`).join('')}</div>`).join('');
    box.onclick = (e) => { const c = e.target.closest('.bd-tile'); if (c) addMat(c.dataset.rel, null); };
    box.ondragstart = (e) => { const c = e.target.closest('.bd-tile'); if (!c) return; e.dataTransfer.setData('text/x-pixpeel-rel', c.dataset.rel); e.dataTransfer.effectAllowed = 'copy'; };
  }
  const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp' };
  async function imgFromBlob(blob) {
    /* 用 onload 而不是 decode()：decode() 在某些情况下会一直挂着不返回，onload 更稳 */
    const url = URL.createObjectURL(blob); const im = new Image();
    await new Promise((res, rej) => { im.onload = () => res(); im.onerror = () => rej(new Error('img')); im.src = url; });
    return im;
  }
  async function addMat(rel, at) {
    try {
      let im = cache.get(rel);
      if (!im) {
        const bytes = await api.readLib(rel); if (!bytes) throw new Error('read');
        im = await imgFromBlob(new Blob([bytes], { type: MIME[(rel.split('.').pop() || '').toLowerCase()] || 'image/png' })); cache.set(rel, im);
      }
      addLayer(im, rel.split('/').pop(), at, false);
    } catch (e) { toast(t('badImg')); }
  }
  async function addFile(f, at) {
    try { const im = await imgFromBlob(f); addLayer(im, f.name, at, true); } catch (e) { toast(t('badImg')); }
  }

  /* ───────── 图层 ───────── */
  function addLayer(im, name, at, isFile) { act(() => addLayer0(im, name, at, isFile)); }
  function addLayer0(im, name, at, isFile) {
    const w = im.naturalWidth, h = im.naturalHeight;
    let s = 1, cx = B.W / 2, cy = B.H / 2;
    if (isFile && !B.layers.length && !B.sizeTouched) {            // 第一张导入的图 → 当作底图，画布跟它一样大
      let W = w, H = h; const k = Math.min(1, MAX / Math.max(W, H), Math.sqrt(MAXPX / (W * H)));
      W = Math.max(MIN, Math.round(W * k)); H = Math.max(MIN, Math.round(H * k)); s = W / w;
      setSize(W, H, true); cx = W / 2; cy = H / 2; toast(t('bdBaseSet', { w: W, h: H }));
    } else {
      s = Math.min(1, B.W * 0.7 / w, B.H * 0.7 / h);
      if (at) { cx = clamp(at[0], 0, B.W); cy = clamp(at[1], 0, B.H); }
      else { const n = B.layers.length % 6; cx += n * 16; cy += n * 16; }
    }
    const l = { id: B.seq++, name, img: im, w, h, x: cx, y: cy, s, r: 0 };
    B.layers.push(l); B.sel = l.id; draw(); tools();
  }
  function del() {
    const l = sel(); if (!l) return;
    const idx = B.layers.indexOf(l);
    act(() => { B.layers = B.layers.filter(x => x !== l); B.sel = null; draw(); tools(); });
    undoToast(t('delUndoLayer'), {
      undo: () => { B.layers.splice(Math.min(idx, B.layers.length), 0, l); B.sel = l.id; draw(); tools(); }
    });
  }
  function dup() {
    const l = sel(); if (!l) return;
    act(() => { const c = Object.assign({}, l, { id: B.seq++, x: l.x + 24, y: l.y + 24, name: l.name }); B.layers.splice(B.layers.indexOf(l) + 1, 0, c); B.sel = c.id; draw(); tools(); });
  }
  function order(d) {
    const l = sel(); if (!l) return; const i = B.layers.indexOf(l), j = i + d;
    if (j < 0 || j >= B.layers.length) return; act(() => { [B.layers[i], B.layers[j]] = [B.layers[j], B.layers[i]]; draw(); });
  }
  function tools() {
    const l = sel(); const on = !!l;
    ['bdAng', 'bdScl', 'bdR90', 'bdUp', 'bdDn', 'bdDel'].forEach(id => { const e = $('#' + id); if (e) e.disabled = !on; });
    if (l) {
      let a = Math.round(l.r * 180 / Math.PI) % 360; if (a > 180) a -= 360; if (a < -180) a += 360;
      const an = $('#bdAng'), sc = $('#bdScl');
      if (an && document.activeElement !== an) an.value = a;
      if (sc && document.activeElement !== sc) sc.value = Math.round(l.s * 100);
    } else { const an = $('#bdAng'), sc = $('#bdScl'); if (an) an.value = ''; if (sc) sc.value = ''; }
    const em = $('#bdEmpty'); if (em) em.style.display = B.layers.length ? 'none' : '';
  }

  /* ───────── 画布大小 / 背景 ───────── */
  function syncSize() {
    $('#bdW').value = B.W; $('#bdH').value = B.H;
    const key = B.W + 'x' + B.H; $('#bdPre').value = PRESETS.some(p => p[0] === key) ? key : 'custom';
  }
  function setSize(w, h, refit) { B.W = w; B.H = h; syncSize(); if (refit) fit(); else draw(); }
  function syncSw() {
    document.querySelectorAll('#bdSw i').forEach(i => i.classList.toggle('on', i.dataset.c === B.bg));
    if (/^#[0-9a-f]{6}$/i.test(B.bg)) $('#bdCol').value = B.bg;
  }
  function setBg(c) { B.bg = c; syncSw(); draw(); }

  /* ───────── 视图 ───────── */
  function toDoc(sx, sy) { return [(sx - B.px) / B.zoom, (sy - B.py) / B.zoom]; }
  function fit() {
    const st = $('#bdStage'); const w = st.clientWidth, h = st.clientHeight; if (!w || !h) return;
    B.zoom = clamp(Math.min((w - 80) / B.W, (h - 80) / B.H, 1), 0.02, 8);
    B.px = (w - B.W * B.zoom) / 2; B.py = (h - B.H * B.zoom) / 2; B.fitted = true; draw();
  }
  function zoomAt(k, sx, sy) {
    const st = $('#bdStage'); if (sx == null) { sx = st.clientWidth / 2; sy = st.clientHeight / 2; }
    const z = clamp(B.zoom * k, 0.02, 8), d = toDoc(sx, sy); B.zoom = z; B.px = sx - d[0] * z; B.py = sy - d[1] * z; draw();
  }
  function zoomSel() {
    const l = sel(); if (!l) { fit(); return; } const st = $('#bdStage');
    const c = Math.abs(Math.cos(l.r)), s = Math.abs(Math.sin(l.r)), bw = (l.w * c + l.h * s) * l.s, bh = (l.w * s + l.h * c) * l.s;
    const z = clamp(Math.min((st.clientWidth - 80) / bw, (st.clientHeight - 80) / bh), 0.02, 8);
    B.zoom = z; B.px = st.clientWidth / 2 - l.x * z; B.py = st.clientHeight / 2 - l.y * z; draw();
  }
  function zoomTo(z) { const st = $('#bdStage'); const sx = st.clientWidth / 2, sy = st.clientHeight / 2; zoomAt(z / B.zoom, sx, sy); }

  /* ───────── 绘制 ───────── */
  let chk = null;
  function checker() {
    if (chk) return chk; const c = document.createElement('canvas'); c.width = c.height = 20; const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 20, 20); g.fillStyle = '#d9dce3'; g.fillRect(0, 0, 10, 10); g.fillRect(10, 10, 10, 10); return (chk = c);
  }
  function drawLayer(g, l) {
    g.save(); g.translate(l.x, l.y); g.rotate(l.r); g.scale(l.s, l.s); g.drawImage(l.img, -l.w / 2, -l.h / 2); g.restore();
  }
  function corners(l) {                       // 选中框四角 + 旋转柄（屏幕坐标）
    const c = Math.cos(l.r), s = Math.sin(l.r), hw = l.w * l.s / 2, hh = l.h * l.s / 2;
    const P = (lx, ly) => [B.px + (l.x + lx * c - ly * s) * B.zoom, B.py + (l.y + lx * s + ly * c) * B.zoom];
    const cs = [P(-hw, -hh), P(hw, -hh), P(hw, hh), P(-hw, hh)];
    const top = P(0, -hh), rot = [top[0] + s * 30, top[1] - c * 30];
    return { cs, top, rot };
  }
  function draw() {
    const st = $('#bdStage'), cv = $('#bdCv'); if (!st || !cv) return;
    const w = st.clientWidth, h = st.clientHeight; if (!w || !h) return;
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.width = w + 'px'; cv.style.height = h + 'px'; }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const z = B.zoom, X = B.px, Y = B.py, dw = B.W * z, dh = B.H * z;
    g.save(); g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 22; g.shadowOffsetY = 4; g.fillStyle = '#fff'; g.fillRect(X, Y, dw, dh); g.restore();
    g.save(); g.beginPath(); g.rect(X, Y, dw, dh); g.clip();
    if (B.bg === 'transparent') { g.fillStyle = g.createPattern(checker(), 'repeat'); g.fillRect(X, Y, dw, dh); }
    else { g.fillStyle = B.bg; g.fillRect(X, Y, dw, dh); }
    g.imageSmoothingQuality = 'high'; g.translate(X, Y); g.scale(z, z);
    for (const l of B.layers) drawLayer(g, l);
    g.restore();
    const l = sel();
    if (l) {
      const { cs, top, rot } = corners(l), mint = css('--mint');
      g.save(); g.lineWidth = 1.5; g.strokeStyle = mint; g.beginPath(); cs.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.stroke();
      g.beginPath(); g.moveTo(top[0], top[1]); g.lineTo(rot[0], rot[1]); g.stroke();
      g.fillStyle = '#fff'; for (const p of cs) { g.beginPath(); g.rect(p[0] - 5, p[1] - 5, 10, 10); g.fill(); g.stroke(); }
      g.beginPath(); g.arc(rot[0], rot[1], 6, 0, 7); g.fill(); g.stroke(); g.restore();
    }
    $('#bdZl').textContent = Math.round(z * 100) + '%';
  }

  /* ───────── 交互 ───────── */
  function alphaAt(im, u, v) {
    let a = im.__a;
    if (!a) {
      const k = Math.min(1, 160 / Math.max(im.naturalWidth, im.naturalHeight)); const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0, c.width, c.height); a = im.__a = { c, g };
    }
    const x = clamp(Math.floor(u * a.c.width), 0, a.c.width - 1), y = clamp(Math.floor(v * a.c.height), 0, a.c.height - 1);
    return a.g.getImageData(x, y, 1, 1).data[3];
  }
  function local(l, dx, dy) { const c = Math.cos(l.r), s = Math.sin(l.r); return [(dx * c + dy * s) / l.s, (-dx * s + dy * c) / l.s]; }
  function hitLayer(d, bboxOnly) {
    const list = bboxOnly ? [sel()].filter(Boolean) : [...B.layers].reverse();
    for (const l of list) {
      const [lx, ly] = local(l, d[0] - l.x, d[1] - l.y);
      if (Math.abs(lx) > l.w / 2 || Math.abs(ly) > l.h / 2) continue;
      if (bboxOnly || alphaAt(l.img, (lx + l.w / 2) / l.w, (ly + l.h / 2) / l.h) > 12) return l;
    }
    return null;
  }
  function hitHandle(sx, sy) {
    const l = sel(); if (!l) return null; const { cs, rot } = corners(l);
    if (Math.hypot(sx - rot[0], sy - rot[1]) <= 9) return 'rot';
    for (let i = 0; i < 4; i++) if (Math.abs(sx - cs[i][0]) <= 8 && Math.abs(sy - cs[i][1]) <= 8) return 'scale';
    return null;
  }
  const pos = (e) => { const r = $('#bdCv').getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  function down(e) {
    const [sx, sy] = pos(e); const cv = $('#bdCv'); cv.setPointerCapture(e.pointerId);
    if (e.button === 1 || B.space) { B.mode = { k: 'pan', sx, sy, px: B.px, py: B.py }; cv.style.cursor = 'grabbing'; return; }
    const hd = hitHandle(sx, sy), l = sel(), b0 = snapB();
    if (hd && l) {
      const cx = B.px + l.x * B.zoom, cy = B.py + l.y * B.zoom;
      B.mode = hd === 'rot' ? { k: 'rot', a0: Math.atan2(sy - cy, sx - cx), r0: l.r, cx, cy, b: b0 } : { k: 'scale', d0: Math.hypot(sx - cx, sy - cy) || 1, s0: l.s, cx, cy, b: b0 };
      return;
    }
    const d = toDoc(sx, sy); const hit = hitLayer(d, false) || hitLayer(d, true);
    if (hit) { B.sel = hit.id; B.mode = { k: 'move', ox: hit.x - d[0], oy: hit.y - d[1], b: b0 }; draw(); tools(); }
    else { B.sel = null; B.mode = { k: 'pan', sx, sy, px: B.px, py: B.py }; cv.style.cursor = 'grabbing'; draw(); tools(); }
  }
  function move(e) {
    const [sx, sy] = pos(e), m = B.mode, l = sel(), cv = $('#bdCv');
    if (!m) {
      const hd = hitHandle(sx, sy);
      cv.style.cursor = B.space ? 'grab' : hd === 'rot' ? 'grab' : hd === 'scale' ? 'nwse-resize' : (hitLayer(toDoc(sx, sy), false) ? 'move' : 'default'); return;
    }
    if (m.k === 'pan') { B.px = m.px + sx - m.sx; B.py = m.py + sy - m.sy; draw(); }
    else if (!l) return;
    else if (m.k === 'move') { const d = toDoc(sx, sy); l.x = d[0] + m.ox; l.y = d[1] + m.oy; draw(); }
    else if (m.k === 'scale') { l.s = clamp(m.s0 * Math.hypot(sx - m.cx, sy - m.cy) / m.d0, 0.02, 50); draw(); tools(); }
    else if (m.k === 'rot') {
      let r = m.r0 + Math.atan2(sy - m.cy, sx - m.cx) - m.a0;
      if (e.shiftKey) r = Math.round(r / (Math.PI / 12)) * (Math.PI / 12); l.r = r; draw(); tools();
    }
  }
  function up(e) { const m = B.mode; B.mode = null; if (m && m.b) hpush(m.b); try { $('#bdCv').releasePointerCapture(e.pointerId); } catch (_) { } $('#bdCv').style.cursor = B.space ? 'grab' : 'default'; }

  document.addEventListener('keydown', (e) => {
    if (!isOn()) return;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName || '') && e.target.type !== 'checkbox' && e.target.type !== 'range') return;
    const l = sel(), mod = e.ctrlKey || e.metaKey, K = e.key.toLowerCase(), eat = () => { e.preventDefault(); e.stopPropagation(); };
    if (mod && K === 'z') { e.shiftKey ? redo() : undo(); eat(); return; }
    if (mod && K === 'y') { redo(); eat(); return; }
    if (mod && K === 'd') { dup(); eat(); return; }
    if (!mod && (K === '+' || K === '=')) { zoomAt(1.25); eat(); return; }
    if (!mod && K === '-') { zoomAt(1 / 1.25); eat(); return; }
    if (K === '0') { fit(); eat(); return; }
    if (K === '1' && !e.shiftKey) { zoomTo(1); eat(); return; }
    if (!mod && (K === '[' || K === ']') && l) { order(K === ']' ? 1 : -1); eat(); return; }
    if (e.key === ' ') { B.space = true; $('#bdCv').style.cursor = 'grab'; e.preventDefault(); e.stopPropagation(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && l) { del(); e.preventDefault(); e.stopPropagation(); }
    else if (e.key === 'Escape' && l) { B.sel = null; draw(); tools(); e.stopPropagation(); }
    else if (l && /^Arrow/.test(e.key)) {
      const k = e.shiftKey ? 10 : 1; act(() => { if (e.key === 'ArrowLeft') l.x -= k; if (e.key === 'ArrowRight') l.x += k; if (e.key === 'ArrowUp') l.y -= k; if (e.key === 'ArrowDown') l.y += k; draw(); }, 'nudge');
      e.preventDefault(); e.stopPropagation();
    }
  }, true);
  document.addEventListener('keyup', (e) => { if (e.key === ' ') { B.space = false; const c = $('#bdCv'); if (c) c.style.cursor = 'default'; } }, true);
  document.addEventListener('paste', async (e) => {
    if (!isOn()) return; const fs = [...(e.clipboardData && e.clipboardData.files || [])].filter(f => f.type.startsWith('image/'));
    if (!fs.length) return; e.stopPropagation(); e.preventDefault(); for (const f of fs) await addFile(f, null);
  }, true);

  /* ───────── 导出 ───────── */
  function renderDoc(flatten) {
    const c = document.createElement('canvas'); c.width = B.W; c.height = B.H; const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
    if (B.bg !== 'transparent') { g.fillStyle = B.bg; g.fillRect(0, 0, B.W, B.H); } else if (flatten) { g.fillStyle = '#ffffff'; g.fillRect(0, 0, B.W, B.H); }
    for (const l of B.layers) drawLayer(g, l); return c;
  }
  async function bytesOf(c, type, q) {
    const blob = await Promise.race([new Promise(r => c.toBlob(r, type, q)), new Promise(r => setTimeout(() => r(null), 8000))]);
    if (blob) return new Uint8Array(await blob.arrayBuffer());
    const b = atob(c.toDataURL(type, q).split(',')[1]); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u;
  }
  const stamp = () => new Date().toLocaleString('sv').replace(/[: ]/g, '-');
  async function exportFile() {
    try {
      const jpg = B.fmt === 'jpg'; const data = await bytesOf(renderDoc(jpg), jpg ? 'image/jpeg' : 'image/png', 0.95);
      const ok = await api.saveAs({ name: t('bdFile') + ' ' + stamp() + (jpg ? '.jpg' : '.png'), data, filters: [{ name: jpg ? 'JPG' : 'PNG', extensions: [jpg ? 'jpg' : 'png'] }] });
      if (ok) toast(t('bdExported'));
    } catch (e) { toast(t('bdExportFail')); }
  }
  async function toLibrary() {
    try {
      const data = await bytesOf(renderDoc(false), 'image/png');
      const r = await api.saveElements({ files: [{ name: t('bdFile') + ' ' + stamp(), data }], group: t('bdGroup'), quiet: true });
      if (r && r.ok) { toast(t('bdSavedLib')); loadMat(); } else toast(t('saveFail'));
    } catch (e) { toast(t('bdExportFail')); }
  }

  function enter() {
    if (!B.mounted || B.lang !== I18N.lang) mount(); else loadMat();
    requestAnimationFrame(() => { if (!B.fitted) fit(); else draw(); tools(); });
  }
  function select(id) { B.sel = id; draw(); tools(); }
  return { enter, state: B, draw, addLayer, setSize, fit, select, undo, redo, dup, zoomSel, imgFromBlob, addMat };
})();
