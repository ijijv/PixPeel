/* PixPeel · SVG 库 + SVG 画布
 *
 * SVG 库：单独存 .svg 文件（拆元素页导出的分层 SVG 也收进来）
 * SVG 画布：把 SVG 里的每一层单独拎出来改——显示/隐藏、移动、缩放、旋转、改不透明度、删除、改名
 * 交互和「画板」一致：左键点选 / 拖动 / 框选多选，中键或空格拖动平移，四角缩放、顶部圆点旋转。
 *
 * 和「素材库」「画板」的关系：
 *   素材库放的是透明底 PNG 贴纸（小剪动画就是读它），SVG 库是另一套文件，不混在一起；
 *   两边靠「转换」打通：SVG 画布里可以把某一层一键导成透明 PNG 存进素材库，
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
      <button class="btn" id="svgImp">${t('svgImpBtn')}</button><button class="btn ghost" id="svgRef">${t('libRefresh')}</button><button class="btn danger" id="svgClear">${t('libClear')}</button></div>
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
    $('#svgClear').onclick = () => clearAllPending('#v-svglib', 'libClearUndo', 'libCleared');
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
    } catch (e) { console.error('SvgLib.importFile', e); toast(t('svgBad')); }
  }
  return { render, importFile, pick };
})();

/* ───────────────────────── SVG 画布 ───────────────────────── */
const SvgCanvas = (() => {
  const S = {
    name: '', w: 0, h: 0, svg: null, layers: [], sel: null, multi: new Set(),
    z: 1, x: 0, y: 0, fit: true, mode: null, ov: null, lang: ''
  };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

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
    return { w: 512, h: 512 };
  }
  /* 图层内容在 SVG 基础坐标里的包围盒。
   * getBBox 只有在元素已经排版后才准，所以每次都重新量，量不出来才用上一次的值。 */
  function bbox(L) {
    try {
      const b = L.el.getBBox();
      if (b && (b.width > 0 || b.height > 0)) { L.bb = { x: b.x, y: b.y, w: b.width, h: b.height }; return L.bb; }
    } catch (e) { /* 不在文档里或者被隐藏了 */ }
    return (L.bb || { x: 0, y: 0, w: 0, h: 0 });
  }
  function center(L) { const b = bbox(L); return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; }

  function openSvg(svg, name) {
    S.svg = svg; S.name = name || 'svg';
    const sz = sizeOf(svg);
    S.w = Math.max(1, Math.round(sz.w)); S.h = Math.max(1, Math.round(sz.h));
    if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', `0 0 ${S.w} ${S.h}`);
    svg.setAttribute('width', S.w); svg.setAttribute('height', S.h);
    const skip = new Set(['defs', 'title', 'desc', 'style', 'metadata', 'script']);
    const kids = [...svg.childNodes].filter(n => n.nodeType === 1 && !skip.has(n.nodeName.toLowerCase()));
    S.layers = [];
    for (const k of kids) {
      const g = document.createElementNS(SVGNS, 'g');
      g.setAttribute('data-sg', '');
      k.parentNode.insertBefore(g, k);
      g.appendChild(k);
      const nm = k.id || k.getAttribute('data-name') || k.nodeName;
      S.layers.push({ g, el: k, name: nm, x: 0, y: 0, s: 1, r: 0, op: 1, vis: true, bb: null });
    }
    S.sel = null; S.multi.clear(); S.fit = true;
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

  /* 变换：绕「图层自身内容的中心」旋转缩放，而不是绕画布原点 */
  function apply(L) {
    const c = center(L);
    L.g.setAttribute('transform', `translate(${L.x} ${L.y}) translate(${c.x} ${c.y}) rotate(${L.r}) scale(${L.s}) translate(${-c.x} ${-c.y})`);
    L.g.setAttribute('opacity', L.op);
    L.g.style.display = L.vis ? '' : 'none';
  }
  function sel() { return S.layers.find(l => l === S.sel) || null; }
  /** 当前选中的图层（多选时返回全部） */
  function sels() {
    if (S.multi.size) return S.layers.filter(l => S.multi.has(l));
    const s = sel(); return s ? [s] : [];
  }

  function mount() {
    const host = $('#v-svgcanvas');
    /* 还没打开过 SVG：显示空状态，不要去 importNode(null) */
    if (!S.svg) { emptyState(host); return; }
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
    S.svg = svg;                       // 指向真正挂在页面上的这份，后面调层级才是对的
    /* 覆盖层：画选中框和缩放/旋转手柄 */
    const ov = document.createElementNS(SVGNS, 'svg');
    ov.setAttribute('class', 'svOv'); ov.setAttribute('preserveAspectRatio', 'none');
    st.appendChild(ov); S.ov = ov;
    /* 重新把层挂到新节点上（importNode 之后旧引用失效：g 和里面的原始节点都要换成副本里的） */
    const gs = [...svg.querySelectorAll('g[data-sg]')];
    S.layers.forEach((L, i) => {
      if (!gs[i]) return;
      L.g = gs[i];
      if (gs[i].firstElementChild) L.el = gs[i].firstElementChild;
      L.bb = null; apply(L);
    });
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
    st.addEventListener('contextmenu', (e) => e.preventDefault());
    list(); applyView(); fit();
    /* 排版完成后再量一次各层的包围盒（getBBox 排版前不准，旋转中心会算错） */
    requestAnimationFrame(() => {
      S.layers.forEach(L => { L.bb = null; apply(L); });
      drawOverlay();
    });
  }

  /* 还没打开 SVG 时的空状态 */
  function emptyState(host) {
    host.innerHTML = `<div class="page"><div class="tip">${t('svgNoFile')}</div>
      <div style="margin-top:14px;display:flex;gap:8px;justify-content:center">
        <button class="btn" id="svgEmptyImp">${t('svgImpBtn')}</button>
        <button class="btn" id="svgEmptyLib">${t('svgLibTitle')}</button>
      </div></div>`;
    const b1 = $('#svgEmptyImp'); if (b1) b1.onclick = () => SvgLib.pick();
    const b2 = $('#svgEmptyLib'); if (b2) b2.onclick = () => showView('svglib');
  }

  /* ───────── 视图 ───────── */
  function applyView() {
    const svg = $('#v-svgcanvas .svSvg'); if (!svg) return;
    Object.assign(svg.style, { position: 'absolute', left: S.x + 'px', top: S.y + 'px', width: S.w * S.z + 'px', height: S.h * S.z + 'px' });
    const l = $('#svZl'); if (l) l.textContent = Math.round(S.z * 100) + '%';
    drawOverlay();
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
    S.z = clamp(S.z * k, 0.05, 16);
    S.x = cx - ix * S.z; S.y = cy - iy * S.z; S.fit = false; applyView();
  }
  function toSvg(clientX, clientY) {
    const st = $('#svStage'), r = st.getBoundingClientRect();
    return { x: (clientX - r.left - S.x) / S.z, y: (clientY - r.top - S.y) / S.z };
  }
  function stagePos(e) {
    const st = $('#svStage'), r = st.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /* 图层在屏幕上的四个角（用来画框和做命中判断） */
  function corners(L) {
    const b = bbox(L), c = center(L);
    const rad = L.r * Math.PI / 180, cs = Math.cos(rad), sn = Math.sin(rad);
    const raw = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]];
    return raw.map(([px, py]) => {
      const ux = (px - c.x) * L.s, uy = (py - c.y) * L.s;
      const rx = ux * cs - uy * sn, ry = ux * sn + uy * cs;
      return { x: S.x + (c.x + rx + L.x) * S.z, y: S.y + (c.y + ry + L.y) * S.z };
    });
  }
  function rotHandle(cs) {
    const mid = { x: (cs[0].x + cs[1].x) / 2, y: (cs[0].y + cs[1].y) / 2 };
    return { x: mid.x, y: mid.y - 26 };
  }

  /* 覆盖层：选中框 + 四角缩放柄 + 顶部旋转柄 + 框选矩形 */
  function drawOverlay() {
    const ov = S.ov; if (!ov) return;
    const st = $('#svStage'); if (!st) return;
    ov.setAttribute('viewBox', `0 0 ${st.clientWidth} ${st.clientHeight}`);
    ov.setAttribute('width', st.clientWidth); ov.setAttribute('height', st.clientHeight);
    let h = '';
    const list = sels();
    for (const L of list) {
      const cs = corners(L);
      if (!cs[0]) continue;
      const d = 'M' + cs.map(p => p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join('L') + 'Z';
      h += `<path d="${d}" fill="none" stroke="#52e3bd" stroke-width="1.5"/>`;
      if (list.length === 1) {
        for (const p of cs) h += `<rect x="${(p.x - 5).toFixed(1)}" y="${(p.y - 5).toFixed(1)}" width="10" height="10" fill="#fff" stroke="#52e3bd" stroke-width="1.5"/>`;
        const rh = rotHandle(cs);
        h += `<line x1="${cs[0].x.toFixed(1)}" y1="${cs[0].y.toFixed(1)}" x2="${rh.x.toFixed(1)}" y2="${rh.y.toFixed(1)}" stroke="#52e3bd" stroke-width="1.5"/>`;
        h += `<circle cx="${rh.x.toFixed(1)}" cy="${rh.y.toFixed(1)}" r="6" fill="#fff" stroke="#52e3bd" stroke-width="1.5"/>`;
      }
    }
    if (S.mode && S.mode.k === 'marquee') {
      const m = S.mode;
      h += `<rect x="${Math.min(m.sx, m.cx).toFixed(1)}" y="${Math.min(m.sy, m.cy).toFixed(1)}" width="${Math.abs(m.cx - m.sx).toFixed(1)}" height="${Math.abs(m.cy - m.sy).toFixed(1)}" fill="rgba(82,227,189,.14)" stroke="#52e3bd" stroke-width="1" stroke-dasharray="4 3"/>`;
    }
    ov.innerHTML = h;
  }

  /* ───────── 交互 ───────── */
  function hitHandle(sp) {
    const list = sels(); if (list.length !== 1) return null;
    const L = list[0], cs = corners(L);
    const rh = rotHandle(cs);
    if (Math.hypot(sp.x - rh.x, sp.y - rh.y) <= 10) return 'rot';
    for (let i = 0; i < 4; i++) if (Math.abs(sp.x - cs[i].x) <= 9 && Math.abs(sp.y - cs[i].y) <= 9) return 'scale';
    return null;
  }
  function hitLayer(sp) {
    const list = [...S.layers].reverse();
    for (const L of list) {
      if (!L.vis) continue;
      const cs = corners(L);
      if (!cs[0]) continue;
      let inside = false;
      for (let i = 0, j = 3; i < 4; j = i++) {
        const a = cs[i], b = cs[j];
        if ((a.y > sp.y) !== (b.y > sp.y) && sp.x < (b.x - a.x) * (sp.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
      }
      if (inside) return L;
    }
    return null;
  }
  function onDown(e) {
    const st = $('#svStage'); if (!st) return;
    const sp = stagePos(e);
    try { st.setPointerCapture(e.pointerId); } catch (_) { }
    /* 中键 / 右键：平移画布 */
    if (e.button === 1 || e.button === 2) { S.mode = { k: 'pan', sx: sp.x, sy: sp.y, x0: S.x, y0: S.y }; st.style.cursor = 'grabbing'; return; }
    const hd = hitHandle(sp);
    if (hd) {
      const L = sels()[0], c = center(L);
      const cc = { x: S.x + (c.x + L.x) * S.z, y: S.y + (c.y + L.y) * S.z };
      S.mode = hd === 'rot'
        ? { k: 'rot', L, a0: Math.atan2(sp.y - cc.y, sp.x - cc.x), r0: L.r, cc }
        : { k: 'scale', L, d0: Math.hypot(sp.x - cc.x, sp.y - cc.y) || 1, s0: L.s, cc };
      return;
    }
    const hit = hitLayer(sp);
    if (hit) {
      if (e.ctrlKey || e.metaKey) { S.multi.has(hit) ? S.multi.delete(hit) : S.multi.add(hit); }
      else if (!S.multi.has(hit)) { S.multi.clear(); S.multi.add(hit); }
      S.sel = hit;
      S.mode = { k: 'move', L: hit, ox: hit.x - toSvg(e.clientX, e.clientY).x, oy: hit.y - toSvg(e.clientX, e.clientY).y };
      list(); drawOverlay(); return;
    }
    /* 点空白：清空选择并开始框选 */
    if (!e.shiftKey) { S.multi.clear(); S.sel = null; }
    S.mode = { k: 'marquee', sx: sp.x, sy: sp.y, cx: sp.x, cy: sp.y, add: e.shiftKey };
    list(); drawOverlay();
  }
  function onMove(e) {
    const st = $('#svStage'); if (!st) return;
    const sp = stagePos(e), m = S.mode;
    if (!m) {
      const hd = hitHandle(sp);
      st.style.cursor = hd === 'rot' ? 'grab' : hd === 'scale' ? 'nwse-resize' : (hitLayer(sp) ? 'move' : 'default');
      return;
    }
    if (m.k === 'pan') { S.x = m.x0 + sp.x - m.sx; S.y = m.y0 + sp.y - m.sy; S.fit = false; applyView(); return; }
    if (m.k === 'marquee') { m.cx = sp.x; m.cy = sp.y; drawOverlay(); return; }
    if (m.k === 'move') {
      const p = toSvg(e.clientX, e.clientY);
      const dx = p.x - (m.L.x - m.ox), dy = p.y - (m.L.y - m.oy);
      const list2 = sels();
      for (const L of list2) { L.x = m.L.x + dx; L.y = m.L.y + dy; apply(L); }
      drawOverlay(); return;
    }
    if (m.k === 'scale') {
      const d = Math.hypot(sp.x - m.cc.x, sp.y - m.cc.y);
      const s = clamp(m.s0 * d / m.d0, 0.02, 50);
      for (const L of sels()) { L.s = s; apply(L); }
      prop(); drawOverlay(); return;
    }
    if (m.k === 'rot') {
      const a = Math.atan2(sp.y - m.cc.y, sp.x - m.cc.x);
      let r = m.r0 + (a - m.a0) * 180 / Math.PI;
      if (e.shiftKey) r = Math.round(r / 15) * 15;
      for (const L of sels()) { L.r = r; apply(L); }
      prop(); drawOverlay(); return;
    }
  }
  function onUp(e) {
    const st = $('#svStage'); if (!st) return;
    try { st.releasePointerCapture(e.pointerId); } catch (_) { }
    const m = S.mode; S.mode = null; st.style.cursor = 'default';
    if (m && m.k === 'marquee') {
      const x0 = Math.min(m.sx, m.cx), x1 = Math.max(m.sx, m.cx), y0 = Math.min(m.sy, m.cy), y1 = Math.max(m.sy, m.cy);
      if (Math.abs(x1 - x0) > 4 || Math.abs(y1 - y0) > 4) {
        if (!m.add) S.multi.clear();
        for (const L of S.layers) {
          if (!L.vis) continue;
          const cs = corners(L); if (!cs[0]) continue;
          const lx = Math.min(...cs.map(p => p.x)), hx = Math.max(...cs.map(p => p.x));
          const ly = Math.min(...cs.map(p => p.y)), hy = Math.max(...cs.map(p => p.y));
          if (hx >= x0 && lx <= x1 && hy >= y0 && ly <= y1) S.multi.add(L);
        }
        const arr = [...S.multi];
        if (arr.length) S.sel = arr[arr.length - 1];
      }
      list(); prop(); drawOverlay();
    } else if (m) { prop(); drawOverlay(); }
  }

  /* ───────── 图层列表 ───────── */
  function list() {
    const el = $('#svList'); if (!el) return;
    $('#svCount').textContent = S.multi.size > 1 ? t('svgSelN', { n: S.multi.size }) : t('nItems', { n: S.layers.length });
    el.innerHTML = S.layers.length ? S.layers.map((L, i) =>
      `<div class="svRow${S.multi.has(L) ? ' sel' : ''}" data-i="${i}">
        <input type="checkbox" data-vis="${i}" ${L.vis ? 'checked' : ''}>
        <span class="svNm" title="${esc(L.name)}">${esc(L.name)}</span>
        <span class="dim">${i + 1}</span></div>`).join('')
      : `<div class="tip">${t('svgNoLayer')}</div>`;
    el.onclick = (e) => {
      const row = e.target.closest('.svRow'); if (!row) return;
      const i = +row.dataset.i, L = S.layers[i]; if (!L) return;
      if (e.target.matches('input[data-vis]')) { L.vis = e.target.checked; apply(L); drawOverlay(); return; }
      if (e.ctrlKey || e.metaKey) { S.multi.has(L) ? S.multi.delete(L) : S.multi.add(L); }
      else { S.multi.clear(); S.multi.add(L); }
      S.sel = L; list(); prop(); drawOverlay();
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
    const arr = sels();
    if (!arr.length) { p.innerHTML = `<div class="tip">${t('svgPickHint')}</div>
      <div class="sv-p"><button class="btn sm" id="svgClear">${t('svgClearAll')}</button></div>`; const c = $('#svgClear'); if (c) c.onclick = clearAll; return; }
    const L = arr[0], many = arr.length > 1;
    p.innerHTML = `<div class="sv-p"><div class="dim">${many ? t('svgSelN', { n: arr.length }) : esc(L.name)}</div></div>
      <div class="sv-p"><label class="fld"><span>${t('svgPosX')}</span><input type="number" data-p="x" value="${Math.round(L.x)}"></label>
      <label class="fld"><span>${t('svgPosY')}</span><input type="number" data-p="y" value="${Math.round(L.y)}"></label></div>
      <div class="sv-p"><label class="fld"><span>${t('svgScale')}</span><input type="range" data-p="s" min="5" max="400" value="${Math.round(L.s * 100)}"><b>${Math.round(L.s * 100)}%</b></label>
      <label class="fld"><span>${t('svgRotate')}</span><input type="range" data-p="r" min="-180" max="180" value="${Math.round(L.r)}"><b>${Math.round(L.r)}°</b></label></div>
      <div class="sv-p"><label class="fld"><span>${t('svgOpacity')}</span><input type="range" data-p="op" min="0" max="100" value="${Math.round(L.op * 100)}"><b>${Math.round(L.op * 100)}%</b></label></div>
      <div class="sv-p"><button class="btn sm" id="svgFront">${t('svgFront')}</button><button class="btn sm" id="svgBack">${t('svgBack')}</button>
      <button class="btn sm danger" id="svgDel">${t('svgDelSel', { n: arr.length })}</button>
      <button class="btn sm danger" id="svgClear">${t('svgClearAll')}</button></div>`;
    p.oninput = (e) => {
      const k = e.target.dataset.p; if (!k) return;
      const v = parseFloat(e.target.value);
      const b = e.target.parentElement.querySelector('b');
      if (k === 'x' || k === 'y') { for (const X of arr) { X[k] = v; apply(X); } }
      else if (k === 's') { for (const X of arr) { X.s = v / 100; apply(X); } if (b) b.textContent = v + '%'; }
      else if (k === 'r') { for (const X of arr) { X.r = v; apply(X); } if (b) b.textContent = v + '°'; }
      else if (k === 'op') { for (const X of arr) { X.op = v / 100; apply(X); } if (b) b.textContent = v + '%'; }
      drawOverlay();
    };
    $('#svgFront').onclick = () => move(1); $('#svgBack').onclick = () => move(-1);
    $('#svgDel').onclick = delLayer; $('#svgClear').onclick = clearAll;
  }
  /** 层级：既要改数组顺序，也要改 SVG 里 DOM 的先后（DOM 顺序才是真正决定谁盖住谁） */
  function move(d) {
    const arr = sels(); if (!arr.length) return;
    const L = arr[arr.length - 1];
    const i = S.layers.indexOf(L), j = i + d;
    if (j < 0 || j >= S.layers.length) return;
    S.layers.splice(i, 1); S.layers.splice(j, 0, L);
    /* DOM 顺序跟着走：把这一层挪到目标位置 */
    const ref = S.layers[j + 1] || null;
    S.svg.insertBefore(L.g, ref ? ref.g : S.svg.lastChild);
    /* 保持 S.layers 和 DOM 一致 */
    const gs = [...S.svg.querySelectorAll('g[data-sg]')];
    S.layers.forEach((X, k) => { if (gs[k] && X.g !== gs[k]) { X.g = gs[k]; X.bb = null; apply(X); } });
    list(); drawOverlay();
  }
  function delLayer() {
    const arr = sels(); if (!arr.length) return;
    const idxs = arr.map(L => S.layers.indexOf(L)).sort((a, b) => a - b);
    const removed = idxs.map(i => S.layers[i]);
    for (const L of removed) { try { L.g.remove(); } catch (e) { } }
    S.layers = S.layers.filter(L => !removed.includes(L));
    S.multi.clear(); S.sel = null;
    list(); drawOverlay();
    undoToast(t('delUndoLayer'), {
      undo: () => {
        const gs = [...S.svg.querySelectorAll('g[data-sg]')];
        removed.forEach((L, k) => {
          const at = Math.min(idxs[k], S.layers.length);
          S.layers.splice(at, 0, L);
          const ref = S.layers[at + 1] || null;
          S.svg.insertBefore(L.g, ref ? ref.g : S.svg.lastChild);
        });
        const gs2 = [...S.svg.querySelectorAll('g[data-sg]')];
        S.layers.forEach((X, k) => { if (gs2[k] && X.g !== gs2[k]) { X.g = gs2[k]; X.bb = null; apply(X); } });
        S.sel = removed[0]; S.multi.add(removed[0]);
        list(); drawOverlay();
      }
    });
  }
  function clearAll() {
    if (!S.layers.length) return;
    const all = S.layers.slice();
    const nodes = all.map(L => L.g);
    all.forEach(L => { try { L.g.remove(); } catch (e) { } });
    S.layers = []; S.multi.clear(); S.sel = null;
    list(); drawOverlay();
    undoToast(t('svgCleared', { n: all.length }), {
      undo: () => {
        all.forEach(L => { S.layers.push(L); S.svg.appendChild(L.g); });
        const gs = [...S.svg.querySelectorAll('g[data-sg]')];
        S.layers.forEach((X, k) => { if (gs[k]) { X.g = gs[k]; X.bb = null; apply(X); } });
        list(); drawOverlay();
      }
    });
  }

  /* ───────── 导出 ───────── */
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
    /* 还没打开过 SVG 就别挂载，画一个空状态出来（否则 importNode(null) 会抛异常） */
    if (!S.svg) { emptyState($('#v-svgcanvas')); return; }
    /* 语言变了要重新挂载，否则面板上还是上一种语言的文案 */
    if (S.lang !== I18N.lang) { S.lang = I18N.lang; mount(); }
    requestAnimationFrame(() => { if (S.fit) fit(); else drawOverlay(); });
  }
  /* 键盘：Delete 删选中的、Esc 取消选中、方向键微调 */
  document.addEventListener('keydown', (e) => {
    if (!S.svg || !$('#v-svgcanvas').classList.contains('on')) return;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName || '')) return;
    const arr = sels();
    if ((e.key === 'Delete' || e.key === 'Backspace') && arr.length) { e.preventDefault(); e.stopPropagation(); delLayer(); return; }
    if (e.key === 'Escape') { S.multi.clear(); S.sel = null; list(); drawOverlay(); e.stopPropagation(); return; }
    if (arr.length && /^Arrow/.test(e.key)) {
      e.preventDefault(); e.stopPropagation();
      const k = e.shiftKey ? 10 : 1;
      for (const L of arr) {
        if (e.key === 'ArrowLeft') L.x -= k; if (e.key === 'ArrowRight') L.x += k;
        if (e.key === 'ArrowUp') L.y -= k; if (e.key === 'ArrowDown') L.y += k;
        apply(L);
      }
      drawOverlay();
    }
  }, true);
  return { enter, openRel, openFile, state: S, list, mount, apply, prop, drawOverlay };
})();
