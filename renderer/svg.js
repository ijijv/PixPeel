/* PixPeel · SVG 库 + SVG 画布
 *
 * SVG 库：单独存 .svg 文件（拆元素页「分层 SVG」导出的也收进来）
 * SVG 画布：把 SVG 里的每一层单独拎出来改——显示/隐藏、移动、缩放、旋转、改不透明度、删除、改名
 *
 * 和「素材库」「画板」的关系：
 *   素材库放的是透明底 PNG 贴纸（小剪动画就是读它），SVG 库是另一套文件，不混在一起；
 *   两边靠「转换」打通：SVG 画布里可以把某一层一键导成 PNG 存进素材库，
 *   素材库里的 PNG 也能拖进画板当图层。这样两边都保持各自的强项，不互相将就。
 */
const SVGNS = 'http://www.w3.org/2000/svg';

/* 去掉脚本、外链之类不该执行的东西 */
function svgSanitize(el) {
  el.querySelectorAll('script, foreignObject, iframe, object, embed').forEach(n => n.remove());
  el.querySelectorAll('*').forEach(n => {
    [...n.attributes].forEach(a => {
      const nm = a.name.toLowerCase(), v = String(a.value || '');
      if (nm.startsWith('on')) n.removeAttribute(a.name);
      else if (/javascript\s*:/i.test(v)) n.removeAttribute(a.name);
    });
  });
  return el;
}

/* ───────────────────────── SVG 库 ───────────────────────── */
const SvgLib = (() => {
  async function render() {
    const el = $('#v-svglib');
    if (!el) return;
    el.innerHTML = '<div class="page"><div class="tip">' + t('libLoading') + '</div></div>';
    const list = await api.listSvg();
    const groups = {};
    for (const it of list) { const g = it.group || t('noGroup'); (groups[g] = groups[g] || []).push(it); }
    el.innerHTML = `<div class="page"><div class="libHead"><h2 class="pt">${t('svgLibTitle')}</h2><span class="sp"></span>
      <button class="btn" id="svgImp">${t('svgImpBtn')}</button><button class="btn ghost" id="svgRef">${t('libRefresh')}</button></div>
      <p class="lead">${t('svgLibLead', { n: list.length })}</p>
      ${list.length ? Object.entries(groups).map(([g, items]) => `<div class="gh"><b>${esc(g)}</b><span>${t('nItems', { n: items.length })}</span></div>
        <div class="grid">${items.map(it => `<div class="cell" data-rel="${esc(it.rel)}">
          <div class="im"><img loading="lazy" src="${esc(it.url)}"></div>
          <div class="nm" title="${esc(it.name)}">${esc(it.name)}</div>
          <div class="bar"><button class="btn sm" data-act="open" title="${t('svgOpenTip')}">${t('svgOpen')}</button>
          <button class="btn sm" data-act="reveal" title="${t('revealTip')}">${t('reveal')}</button>
          <button class="btn sm danger" data-act="del" title="${t('delTip')}">${t('del')}</button></div></div>`).join('')}</div>`).join('')
        : `<div class="blank"><b>${t('svgLibEmptyT')}</b><span>${t('svgLibEmptyD')}</span></div>`}</div>`;
    $('#svgImp').onclick = pick;
    $('#svgRef').onclick = render;
    el.onclick = async (e) => {
      const cell = e.target.closest('.cell'); if (!cell) return;
      const rel = cell.dataset.rel, b = e.target.closest('[data-act]');
      if (b && b.dataset.act === 'reveal') { api.revealLib(rel); return; }
      if (b && b.dataset.act === 'del') {
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
      await SvgCanvas.openRel(rel);
    };
  }
  function pick() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.svg,image/svg+xml'; inp.multiple = true;
    inp.onchange = async () => { for (const f of [...inp.files]) await importFile(f); inp.value = ''; };
    inp.click();
  }
  async function importFile(f) {
    try {
      const txt = await f.text();
      const doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
      if (doc.querySelector('parsererror')) throw new Error('parse');
      const r = await api.saveSvg({ name: (f.name || 'svg').replace(/\.[^.]+$/, ''), data: new TextEncoder().encode(txt), group: '' });
      if (r && r.ok) { toast(t('svgImported')); render(); } else toast(t('saveFail'));
    } catch (e) { toast(t('svgBad')); }
  }
  return { render, importFile, pick };
})();

/* ───────────────────────── SVG 画布 ───────────────────────── */
const SvgCanvas = (() => {
  const S = { name: '', w: 0, h: 0, svg: null, layers: [], sel: null, z: 1, x: 0, y: 0, fit: true, drag: null };

  function parse(text) {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    if (doc.querySelector('parsererror')) throw new Error('parse');
    const svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== 'svg') throw new Error('notsvg');
    return svgSanitize(svg);
  }
  function sizeOf(svg) {
    const vb = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) return { w: vb[2], h: vb[3] };
    const w = parseFloat(svg.getAttribute('width')) || 0, h = parseFloat(svg.getAttribute('height')) || 0;
    if (w > 0 && h > 0) return { w, h };
    const bb = svg.getBBox ? svg.getBBox() : null;
    return { w: (bb && bb.width) || 512, h: (bb && bb.height) || 512 };
  }

  function openSvg(svg, name) {
    S.svg = svg; S.name = name || 'svg';
    const sz = sizeOf(svg);
    S.w = Math.max(1, Math.round(sz.w)); S.h = Math.max(1, Math.round(sz.h));
    if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', `0 0 ${S.w} ${S.h}`);
    svg.setAttribute('width', S.w); svg.setAttribute('height', S.h);
    /* 顶层可绘制元素各自包一层 <g>，这样每一层都能单独移动/缩放/隐藏 */
    const skip = new Set(['defs', 'title', 'desc', 'style', 'metadata', 'script']);
    const kids = [...svg.childNodes].filter(n => n.nodeType === 1 && !skip.has(n.nodeName.toLowerCase()));
    S.layers = [];
    for (const k of kids) {
      const g = document.createElementNS(SVGNS, 'g');
      g.setAttribute('data-sg', '');
      k.parentNode.insertBefore(g, k);
      g.appendChild(k);
      const nm = k.id || k.getAttribute('data-name') || k.nodeName;
      S.layers.push({ g, el: k, name: nm, x: 0, y: 0, s: 1, r: 0, op: 1, vis: true });
    }
    S.sel = null; S.fit = true;
    mount();
  }
  async function openRel(rel) {
    try {
      const bytes = await api.readLib(rel); if (!bytes) throw new Error('read failed');
      const txt = new TextDecoder().decode(bytes);
      openSvg(parse(txt), rel.split('/').pop());
      showView('svgcanvas');
    } catch (e) { console.error('SvgCanvas.openRel', e); toast(t('svgBad')); }
  }
  async function openFile(f) {
    try {
      const txt = await f.text();
      openSvg(parse(txt), f.name);
      showView('svgcanvas');
    } catch (e) { console.error('SvgCanvas.openFile', e); toast(t('svgBad')); }
  }

  function apply(L) {
    L.g.setAttribute('transform', `translate(${L.x} ${L.y}) rotate(${L.r}) scale(${L.s})`);
    L.g.setAttribute('opacity', L.op);
    L.g.style.display = L.vis ? '' : 'none';
  }
  function sel() { return S.layers.find(l => l === S.sel) || null; }

  function mount() {
    const host = $('#v-svgcanvas');
    host.innerHTML = `<div class="sv">
      <aside class="sv-side">
        <div class="sv-h"><b>${t('svgLayers')}</b><span class="sp"></span><span class="dim" id="svCount"></span></div>
        <div class="sv-list" id="svList"></div>
        <div class="sv-prop" id="svProp"></div>
      </aside>
      <div class="sv-main">
        <div class="sv-bar">
          <div class="sv-g"><span>${t('svgFile')}</span><b id="svgName"></b></div>
          <div class="sv-g"><button class="btn sm" id="svgImp">${t('svgImpBtn')}</button>
            <button class="btn sm" id="svgSaveLib">${t('svgSaveLib')}</button>
            <button class="btn sm" id="svgExp">${t('svgExp')}</button>
            <button class="btn sm" id="svgPng">${t('svgPng')}</button>
            <button class="btn sm" id="svgLayersExp">${t('svgLayersExp')}</button></div>
          <div class="sv-g"><button class="btn sm" id="svZo">−</button><b id="svZl">100%</b><button class="btn sm" id="svZi">+</button>
            <button class="btn sm" id="svFit">${t('bdFit')}</button></div>
        </div>
        <div class="sv-stage" id="svStage"></div>
      </div></div>`;
    const st = $('#svStage');
    st.innerHTML = '';
    const svg = document.importNode(S.svg, true);
    svg.removeAttribute('style'); svg.removeAttribute('width'); svg.removeAttribute('height');
    svg.setAttribute('class', 'svSvg'); svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    st.appendChild(svg);
    // 重新把层挂到新节点上（importNode 之后旧引用失效）
    const gs = [...svg.querySelectorAll('g[data-sg]')];
    S.layers.forEach((L, i) => { if (gs[i]) { L.g = gs[i]; apply(L); } });
    $('#svgName').textContent = S.name + '  ' + S.w + '×' + S.h;
    $('#svgImp').onclick = () => SvgLib.pick();
    $('#svgSaveLib').onclick = saveToLib;
    $('#svgExp').onclick = exportSvg;
    $('#svgPng').onclick = exportPng;
    $('#svgLayersExp').onclick = exportLayers;
    $('#svZo').onclick = () => zoom(1 / 1.25);
    $('#svZi').onclick = () => zoom(1.25);
    $('#svFit').onclick = fit;
    st.addEventListener('wheel', (e) => { e.preventDefault(); zoom(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX, e.clientY); }, { passive: false });
    st.addEventListener('pointerdown', onDown);
    st.addEventListener('pointermove', onMove);
    st.addEventListener('pointerup', onUp);
    st.addEventListener('pointercancel', onUp);
    list(); applyView(); fit();
  }

  function applyView() {
    const svg = $('#v-svgcanvas .svSvg'); if (!svg) return;
    Object.assign(svg.style, { position: 'absolute', left: S.x + 'px', top: S.y + 'px', width: S.w * S.z + 'px', height: S.h * S.z + 'px' });
    const l = $('#svZl'); if (l) l.textContent = Math.round(S.z * 100) + '%';
  }
  function fit() {
    const st = $('#svStage'); if (!st || !S.w) return;
    const sw = st.clientWidth, sh = st.clientHeight; if (!sw || !sh) return;
    S.z = Math.max(0.02, Math.min(8, (sw - 40) / S.w, (sh - 40) / S.h));
    S.x = (sw - S.w * S.z) / 2; S.y = (sh - S.h * S.z) / 2;
    S.fit = true; applyView();
  }
  function zoom(k, cx, cy) {
    const st = $('#svStage'); if (!st) return;
    const r = st.getBoundingClientRect();
    if (cx == null) { cx = r.width / 2; cy = r.height / 2; }
    const ix = (cx - S.x) / S.z, iy = (cy - S.y) / S.z;
    S.z = Math.max(0.05, Math.min(16, S.z * k));
    S.x = cx - ix * S.z; S.y = cy - iy * S.z; S.fit = false; applyView();
  }
  function toSvg(clientX, clientY) {
    const st = $('#svStage'), r = st.getBoundingClientRect();
    return { x: (clientX - r.left - S.x) / S.z, y: (clientY - r.top - S.y) / S.z };
  }
  function onDown(e) {
    if (e.button !== 0) return;
    const g = e.target.closest ? e.target.closest('g[data-sg]') : null;
    if (!g) { S.sel = null; list(); return; }
    const L = S.layers.find(x => x.g === g); if (!L) return;
    S.sel = L; list();
    const p = toSvg(e.clientX, e.clientY);
    S.drag = { L, ox: p.x - L.x, oy: p.y - L.y, moved: false };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) { }
  }
  function onMove(e) {
    if (!S.drag) return;
    const p = toSvg(e.clientX, e.clientY);
    S.drag.L.x = p.x - S.drag.ox; S.drag.L.y = p.y - S.drag.oy;
    S.drag.moved = true; apply(S.drag.L); prop();
  }
  function onUp(e) {
    if (!S.drag) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) { }
    S.drag = null;
  }

  function list() {
    const el = $('#svList'); if (!el) return;
    $('#svCount').textContent = t('nItems', { n: S.layers.length });
    el.innerHTML = S.layers.length ? S.layers.map((L, i) =>
      `<div class="svRow${L === S.sel ? ' sel' : ''}" data-i="${i}">
        <input type="checkbox" data-vis="${i}" ${L.vis ? 'checked' : ''}>
        <span class="svNm" title="${esc(L.name)}">${esc(L.name)}</span>
        <span class="dim">${i + 1}</span></div>`).join('') : `<div class="tip">${t('svgNoLayer')}</div>`;
    el.onclick = (e) => {
      const row = e.target.closest('.svRow'); if (!row) return;
      const i = +row.dataset.i, L = S.layers[i]; if (!L) return;
      if (e.target.matches('input[data-vis]')) { L.vis = e.target.checked; apply(L); return; }
      S.sel = L; list();
    };
    el.ondblclick = (e) => {
      const row = e.target.closest('.svRow'); if (!row) return;
      const L = S.layers[+row.dataset.i]; if (!L) return;
      const nm = prompt(t('svgRename'), L.name);
      if (nm) { L.name = nm; L.el.setAttribute('id', nm.replace(/[^\w一-龥-]/g, '_')); list(); }
    };
    prop();
  }
  function prop() {
    const p = $('#svProp'); if (!p) return;
    const L = sel();
    if (!L) { p.innerHTML = `<div class="tip">${t('svgPickHint')}</div>`; return; }
    p.innerHTML = `<div class="sv-p"><label class="fld"><span>${t('svgPosX')}</span><input type="number" data-p="x" value="${Math.round(L.x)}"></label>
      <label class="fld"><span>${t('svgPosY')}</span><input type="number" data-p="y" value="${Math.round(L.y)}"></label></div>
      <div class="sv-p"><label class="fld"><span>${t('svgScale')}</span><input type="range" data-p="s" min="5" max="400" value="${Math.round(L.s * 100)}"><b>${Math.round(L.s * 100)}%</b></label>
      <label class="fld"><span>${t('svgRotate')}</span><input type="range" data-p="r" min="-180" max="180" value="${Math.round(L.r)}"><b>${Math.round(L.r)}°</b></label></div>
      <div class="sv-p"><label class="fld"><span>${t('svgOpacity')}</span><input type="range" data-p="op" min="0" max="100" value="${Math.round(L.op * 100)}"><b>${Math.round(L.op * 100)}%</b></label></div>
      <div class="sv-p"><button class="btn sm" id="svgFront">${t('svgFront')}</button><button class="btn sm" id="svgBack">${t('svgBack')}</button>
      <button class="btn sm danger" id="svgDel">${t('svgDel')}</button></div>`;
    p.oninput = (e) => {
      const k = e.target.dataset.p; if (!k || !L) return;
      const v = parseFloat(e.target.value);
      if (k === 'x') L.x = v; else if (k === 'y') L.y = v;
      else if (k === 's') L.s = v / 100; else if (k === 'r') L.r = v; else if (k === 'op') L.op = v / 100;
      const b = e.target.parentElement.querySelector('b'); if (b) b.textContent = k === 's' ? v + '%' : k === 'op' ? v + '%' : (k === 'r' ? v + '°' : v);
      apply(L);
    };
    $('#svgFront').onclick = () => move(1); $('#svgBack').onclick = () => move(-1); $('#svgDel').onclick = delLayer;
  }
  function move(d) {
    const L = sel(); if (!L) return;
    const i = S.layers.indexOf(L), j = i + d;
    if (j < 0 || j >= S.layers.length) return;
    S.layers.splice(i, 1); S.layers.splice(j, 0, L); list();
  }
  function delLayer() {
    const L = sel(); if (!L) return;
    const i = S.layers.indexOf(L);
    S.layers.splice(i, 1); L.g.remove(); S.sel = null; list();
    undoToast(t('delUndoLayer'), { undo: () => { S.layers.splice(Math.min(i, S.layers.length), 0, L); S.svg.insertBefore(L.g, S.svg.childNodes[i] || null); S.sel = L; apply(L); list(); } });
  }

  /* 把当前 SVG 序列化出来（带各层的变换） */
  function serialize(onlyIdx) {
    const svg = S.svg.cloneNode(true);
    const gs = [...svg.querySelectorAll('g[data-sg]')];
    gs.forEach((g, i) => { if (onlyIdx != null && i !== onlyIdx) g.remove(); });
    svg.setAttribute('xmlns', SVGNS); svg.setAttribute('width', S.w); svg.setAttribute('height', S.h);
    svg.setAttribute('viewBox', `0 0 ${S.w} ${S.h}`);
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(svg);
  }
  async function rasterize(str, scale) {
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(str);
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('raster')); img.src = url; });
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(S.w * scale)); c.height = Math.max(1, Math.round(S.h * scale));
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }
  async function exportSvg() {
    try {
      const ok = await api.saveAs({ name: S.name.replace(/\.[^.]+$/, '') + '.svg', data: new TextEncoder().encode(serialize()), filters: [{ name: 'SVG', extensions: ['svg'] }] });
      if (ok) toast(t('svgExpDone'));
    } catch (e) { toast(t('svgExportFail')); }
  }
  async function saveToLib() {
    try {
      const r = await api.saveSvg({ name: S.name.replace(/\.[^.]+$/, ''), data: new TextEncoder().encode(serialize()), group: '' });
      if (r && r.ok) { toast(t('svgSavedLib')); SvgLib.render(); } else toast(t('saveFail'));
    } catch (e) { toast(t('svgExportFail')); }
  }
  async function exportPng() {
    try {
      const c = await rasterize(serialize(), 1);
      const data = new Uint8Array(await (await toBlob(c)).arrayBuffer());
      const ok = await api.saveAs({ name: S.name.replace(/\.[^.]+$/, '') + '.png', data, filters: [{ name: 'PNG', extensions: ['png'] }] });
      if (ok) toast(t('svgPngDone'));
    } catch (e) { toast(t('svgExportFail')); }
  }
  /* 每一层单独导成透明 PNG，存进素材库（这样 SVG 就能变成贴纸用） */
  async function exportLayers() {
    try {
      const files = [];
      for (let i = 0; i < S.layers.length; i++) {
        const L = S.layers[i];
        if (!L.vis) continue;
        const c = await rasterize(serialize(i), 1);
        files.push({ name: S.name.replace(/\.[^.]+$/, '') + '-' + L.name, data: new Uint8Array(await (await toBlob(c)).arrayBuffer()) });
      }
      if (!files.length) { toast(t('svgNoLayer')); return; }
      const r = await api.saveElements({ files, group: '', quiet: true });
      if (r && r.ok) { toast(t('svgLayersDone', { n: files.length })); if ($('#v-lib').classList.contains('on')) renderLib(); } else toast(t('saveFail'));
    } catch (e) { toast(t('svgExportFail')); }
  }

  function enter() {
    if (!S.svg) { mount(); }
    requestAnimationFrame(() => { if (S.fit) fit(); });
  }
  return { enter, openRel, openFile, state: S, list, mount, apply, prop };
})();
