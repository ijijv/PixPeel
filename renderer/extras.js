/* PixPeel · 补充功能（在 app.js / board.js 之后加载）
 *  1) 拆元素页：撤回 / 重做、滚轮缩放 + 平移、键盘快捷键
 *  2) 快捷键一览（设置里打开）
 *  3) 低分辨率元素自动高清修复（素材库里一键 / 保存时自动）
 */

/* ───────────────── 1) 拆元素页：撤回 · 缩放 · 快捷键 ───────────────── */
(function () {
  const V = { z: 1, x: 0, y: 0, fit: true, space: false, pan: null, src: null };
  const H = { u: [], r: [] };
  const snap = () => ({ L: SEG.layers.map(l => Object.assign({}, l)), sel: [...SEG.sel] });
  const same = (b) => b.L.length === SEG.layers.length && b.L.every((o, i) => o.m === SEG.layers[i].m);
  const push = (b) => { H.u.push(b); if (H.u.length > 60) H.u.shift(); H.r = []; ui(); };
  const restore = (b) => { SEG.layers = b.L.map(o => Object.assign({}, o)); SEG.sel = new Set(b.sel); SEG.hov = null; segList(); segRender(); ui(); };
  function undo() { if (!H.u.length) { toast(t('nothingUndo')); return; } H.r.push(snap()); restore(H.u.pop()); }
  function redo() { if (!H.r.length) { toast(t('nothingRedo')); return; } H.u.push(snap()); restore(H.r.pop()); }
  function ui() {
    const a = $('#hUndo'), b = $('#hRedo'); if (a) a.disabled = !H.u.length; if (b) b.disabled = !H.r.length;
  }

  /* 把每一次改动（圈选 / 魔棒 / AI 的新建·加·减）记下来 */
  const _apply = segApply;
  segApply = function (full) { const b = snap(); _apply(full); if (!same(b)) push(b); };
  const host = $('#v-edit');
  host.addEventListener('click', (e) => {
    const id = (e.target.closest('button') || {}).id;
    if (id === 'bDel' || id === 'bMerge') { const b = snap(); setTimeout(() => { if (!same(b)) push(b); }, 0); }
    else if (id === 'segRe') push(snap());
    else if (id === 'hUndo') undo(); else if (id === 'hRedo') redo();
    else if (id === 'hExit') { SEG.src = null; SEG.layers = []; SEG.sel.clear(); H.u = []; H.r = []; renderEmpty(); }
    else if (id === 'zIn') zoomAt(1.25); else if (id === 'zOut') zoomAt(1 / 1.25);
    else if (id === 'zFit') { V.fit = true; applyView(); } else if (id === 'z100') zoomTo(1);
  }, true);

  /* 视图：缩放 + 平移 */
  function applyView() {
    const cv = $('#segCv'), st = $('.segStage'); if (!cv || !st || !SEG.src) return;
    const { w, h } = SEG.src;
    if (V.fit) {
      const sw = st.clientWidth, sh = st.clientHeight; if (!sw || !sh) return;
      V.z = Math.max(0.02, Math.min((sw - 32) / w, (sh - 32) / h, 1)); V.x = (sw - w * V.z) / 2; V.y = (sh - h * V.z) / 2;
    }
    Object.assign(cv.style, { position: 'absolute', maxWidth: 'none', maxHeight: 'none', left: V.x + 'px', top: V.y + 'px', width: w * V.z + 'px', height: h * V.z + 'px', imageRendering: V.z >= 3 ? 'pixelated' : 'auto' });
    const l = $('#zLbl'); if (l) l.textContent = Math.round(V.z * 100) + '%';
  }
  function zoomAt(k, cx, cy) {
    const st = $('.segStage'); if (!st || !SEG.src) return;
    if (cx == null) { cx = st.clientWidth / 2; cy = st.clientHeight / 2; }
    const nz = Math.max(0.05, Math.min(16, V.z * k)), ix = (cx - V.x) / V.z, iy = (cy - V.y) / V.z;
    V.fit = false; V.z = nz; V.x = cx - ix * nz; V.y = cy - iy * nz; applyView();
  }
  function zoomTo(z) { zoomAt(z / V.z); }

  function bindStage() {
    const st = $('.segStage'); if (!st) return;
    st.addEventListener('wheel', (e) => { e.preventDefault(); const r = st.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    st.addEventListener('pointerdown', (e) => {
      if (!(V.space || e.button === 1)) return;
      V.pan = { sx: e.clientX, sy: e.clientY, x: V.x, y: V.y }; V.fit = false; st.setPointerCapture(e.pointerId); st.style.cursor = 'grabbing'; e.preventDefault(); e.stopPropagation();
    }, true);
    st.addEventListener('pointermove', (e) => { if (!V.pan) return; V.x = V.pan.x + e.clientX - V.pan.sx; V.y = V.pan.y + e.clientY - V.pan.sy; applyView(); });
    const end = (e) => { if (!V.pan) return; V.pan = null; try { st.releasePointerCapture(e.pointerId); } catch (_) { } st.style.cursor = V.space ? 'grab' : ''; };
    st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
    if (window.ResizeObserver) new ResizeObserver(() => applyView()).observe(st);
  }

  const _be = buildEdit;
  buildEdit = function () {
    _be();
    if (V.src !== SEG.src) { V.src = SEG.src; H.u = []; H.r = []; V.fit = true; }
    const bar = $('.stageBar'), sp = bar && bar.querySelector('.sp');
    if (bar) {
      const d = document.createElement('div'); d.className = 'tb';
      d.innerHTML = `<button class="btn sm" id="hUndo" title="${t('undo')} (Ctrl+Z)">↶</button><button class="btn sm" id="hRedo" title="${t('redoH')} (Ctrl+Shift+Z)">↷</button>
        <button class="btn sm" id="hExit" title="${t('exitImageTip')}">↩</button>
        <span class="vsep"></span><button class="btn sm" id="zOut" title="${t('bdZoomOut')} (-)">−</button><b id="zLbl" class="zlbl">100%</b><button class="btn sm" id="zIn" title="${t('bdZoomIn')} (+)">+</button>
        <button class="btn sm" id="zFit" title="${t('bdFit')} (0)">${t('bdFit')}</button><button class="btn sm" id="z100" title="100% (1)">100%</button>`;
      bar.insertBefore(d, sp);
    }
    bindStage(); applyView(); ui();
  };

  /* 键盘 */
  const typing = (e) => /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName || '') && e.target.type !== 'checkbox' && e.target.type !== 'range';
  document.addEventListener('keydown', (e) => {
    if (!host.classList.contains('on') || !SEG.src || typing(e)) return;
    const m = $('#docModal'); if (m && m.classList.contains('on')) return;
    const mod = e.ctrlKey || e.metaKey, K = e.key.toLowerCase(), eat = () => { e.preventDefault(); e.stopPropagation(); };
    if (mod && K === 'z') { e.shiftKey ? redo() : undo(); eat(); return; }
    if (mod && K === 'y') { redo(); eat(); return; }
    if (e.key === ' ') { V.space = true; const st = $('.segStage'); if (st) st.style.cursor = 'grab'; eat(); return; }
    if (mod || e.altKey) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && SEG.layers.some(l => l.on)) { const b = $('#bDel'); if (b) b.click(); eat(); return; }
    const tool = { v: 'pick', w: 'wand', l: 'lasso', a: 'ai' }[K];
    if (tool) { const b = document.querySelector('#segTools [data-st="' + tool + '"]'); if (b) b.click(); eat(); return; }
    if (K === '+' || K === '=') { zoomAt(1.25); eat(); } else if (K === '-') { zoomAt(1 / 1.25); eat(); }
    else if (K === '0') { V.fit = true; applyView(); eat(); } else if (K === '1') { zoomTo(1); eat(); }
  }, true);
  document.addEventListener('keyup', (e) => { if (e.key === ' ') { V.space = false; const st = $('.segStage'); if (st && !V.pan) st.style.cursor = ''; } }, true);
})();

/* ───────────────── 2) 快捷键一览 ───────────────── */
const KEYSHEET = {
  zh: [
    ['全局', [['{hk1}', '框选提取'], ['{hk2}', '点选提取（不变暗）']]],
    ['拆元素页', [['Ctrl + Z', '撤回'], ['Ctrl + Shift + Z / Ctrl + Y', '重做'], ['Enter', '保存勾选的元素'], ['Delete', '删除勾选的元素'], ['Ctrl + A', '全选'], ['V / W / L / A', '点选 / 魔棒 / 套索 / AI 点选'],
      ['滚轮', '以鼠标为中心缩放'], ['空格 + 拖动（或鼠标中键）', '平移画面'], ['+ / −', '放大 / 缩小'], ['0', '适应窗口'], ['1', '100%'], ['Esc', '收起窗口']]],
    ['画板', [['Ctrl + Z', '撤回'], ['Ctrl + Shift + Z / Ctrl + Y', '重做'], ['Ctrl + D', '复制选中的素材'], ['Delete', '删除选中的素材'], ['方向键（Shift 加速）', '微调位置'], ['[ / ]', '下移 / 上移一层'],
      ['拖四角 / 拖圆点', '缩放 / 旋转（旋转时按住 Shift 每次 15°）'], ['滚轮 / + / −', '缩放视图'], ['空格 + 拖动（或空白处拖动）', '平移画布'], ['0 / 1', '适应窗口 / 100%'], ['Esc', '取消选中']]]
  ],
  en: [
    ['Global', [['{hk1}', 'Capture mode'], ['{hk2}', 'Click-to-extract (no dimming)']]],
    ['Extract page', [['Ctrl + Z', 'Undo'], ['Ctrl + Shift + Z / Ctrl + Y', 'Redo'], ['Enter', 'Save ticked elements'], ['Delete', 'Delete ticked elements'], ['Ctrl + A', 'Select all'], ['V / W / L / A', 'Pick / Wand / Lasso / AI pick'],
      ['Wheel', 'Zoom at the cursor'], ['Space + drag (or middle button)', 'Pan'], ['+ / −', 'Zoom in / out'], ['0', 'Fit to window'], ['1', '100%'], ['Esc', 'Hide window']]],
    ['Board', [['Ctrl + Z', 'Undo'], ['Ctrl + Shift + Z / Ctrl + Y', 'Redo'], ['Ctrl + D', 'Duplicate selected'], ['Delete', 'Delete selected'], ['Arrow keys (Shift = faster)', 'Nudge'], ['[ / ]', 'Send backward / Bring forward'],
      ['Drag corner / dot', 'Scale / Rotate (hold Shift to snap 15°)'], ['Wheel / + / −', 'Zoom view'], ['Space + drag (or drag empty space)', 'Pan canvas'], ['0 / 1', 'Fit / 100%'], ['Esc', 'Deselect']]]
  ]
};
function showKeys() {
  let m = $('#docModal'); if (!m) { m = document.createElement('div'); m.id = 'docModal'; document.body.appendChild(m); }
  const sheet = KEYSHEET[I18N.lang] || KEYSHEET.en, rep = (s) => s.replace('{hk1}', pretty(CFG && CFG.hotkey)).replace('{hk2}', pretty(CFG && CFG.hotkey2));
  const kbd = (s) => s.split(' / ').map(p => '<kbd>' + esc(p) + '</kbd>').join(' / ');
  m.innerHTML = `<div class="card"><header><span>${t('keysTitle')}</span><span class="sp"></span><button class="btn sm" id="docX">${t('close')}</button></header><div id="docBody" class="keys">` +
    sheet.map(([h, rows]) => `<h3>${esc(h)}</h3><table>${rows.map(([k, d]) => `<tr><td>${kbd(rep(k))}</td><td>${esc(d)}</td></tr>`).join('')}</table>`).join('') + '</div></div>';
  m.classList.add('on');
  const close = () => m.classList.remove('on');
  $('#docX').onclick = close; m.onclick = (e) => { if (e.target === m) close(); };
}

/* ───────────────── 3) 低分辨率元素高清修复 ───────────────── */
/* 做法（纯代码，不联网）：Lanczos-3 放大（按透明度预乘，避免边缘发黑）→ 按透明度加权的反锐化 →
 * 如果是边缘干脆的贴纸（半透明像素很少），再把透明度边缘收窄成干净的抗锯齿线。
 * 它能让小图放大后更锐、更干净，但不能凭空“发明”原图里没有的细节。 */
const HD = { LOW: 512, TARGET: 1200, MAXOUT: 4096, save: false };
const hdFactor = (w, h, force) => {
  const m = Math.max(w, h);
  if (m >= HD.LOW && !force) return 1;
  return Math.max(2, Math.min(4, Math.ceil(HD.TARGET / m), Math.floor(HD.MAXOUT / m) || 1));
};
const lz = (x, a) => { x = Math.abs(x); if (x < 1e-8) return 1; if (x >= a) return 0; const p = Math.PI * x; return a * Math.sin(p) * Math.sin(p / a) / (p * p); };
function lzTaps(ns, nd) {
  const a = 3, sc = ns / nd, fs = Math.max(1, sc), out = new Array(nd);
  for (let i = 0; i < nd; i++) {
    const c = (i + 0.5) * sc - 0.5, lo = Math.floor(c) - Math.ceil(a * fs) + 1, hi = Math.floor(c) + Math.ceil(a * fs), idx = [], wt = []; let sum = 0;
    for (let j = lo; j <= hi; j++) { const w = lz((j - c) / fs, a); idx.push(Math.min(ns - 1, Math.max(0, j))); wt.push(w); sum += w; }
    for (let k = 0; k < wt.length; k++) wt[k] /= sum; out[i] = { idx, wt };
  }
  return out;
}
function lzResize(pre, sw, sh, dw, dh) {
  const tx = lzTaps(sw, dw), ty = lzTaps(sh, dh), tmp = new Float32Array(dw * sh * 4), out = new Float32Array(dw * dh * 4);
  for (let y = 0; y < sh; y++) for (let x = 0; x < dw; x++) {
    const { idx, wt } = tx[x]; let r = 0, g = 0, b = 0, a = 0;
    for (let k = 0; k < idx.length; k++) { const p = (y * sw + idx[k]) * 4, w = wt[k]; r += pre[p] * w; g += pre[p + 1] * w; b += pre[p + 2] * w; a += pre[p + 3] * w; }
    const o = (y * dw + x) * 4; tmp[o] = r; tmp[o + 1] = g; tmp[o + 2] = b; tmp[o + 3] = a;
  }
  for (let y = 0; y < dh; y++) { const { idx, wt } = ty[y]; for (let x = 0; x < dw; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let k = 0; k < idx.length; k++) { const p = (idx[k] * dw + x) * 4, w = wt[k]; r += tmp[p] * w; g += tmp[p + 1] * w; b += tmp[p + 2] * w; a += tmp[p + 3] * w; }
    const o = (y * dw + x) * 4; out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a;
  } }
  return out;
}
/** 双线性缩放（给误差项用，比 Lanczos 便宜很多） */
function blResize(src, sw, sh, dw, dh) {
  const out = new Float32Array(dw * dh * 4), sx = sw / dw, sy = sh / dh;
  for (let y = 0; y < dh; y++) {
    const fy = (y + 0.5) * sy - 0.5, y0 = Math.max(0, Math.min(sh - 1, Math.floor(fy))), y1 = Math.min(sh - 1, y0 + 1), ty = fy - Math.floor(fy);
    for (let x = 0; x < dw; x++) {
      const fx = (x + 0.5) * sx - 0.5, x0 = Math.max(0, Math.min(sw - 1, Math.floor(fx))), x1 = Math.min(sw - 1, x0 + 1), tx = fx - Math.floor(fx);
      const o = (y * dw + x) * 4;
      for (let c = 0; c < 4; c++) {
        const p00 = src[(y0 * sw + x0) * 4 + c], p10 = src[(y0 * sw + x1) * 4 + c], p01 = src[(y1 * sw + x0) * 4 + c], p11 = src[(y1 * sw + x1) * 4 + c];
        out[o + c] = (p00 * (1 - tx) + p10 * tx) * (1 - ty) + (p01 * (1 - tx) + p11 * tx) * ty;
      }
    }
  }
  return out;
}
/** 盒式缩小（把大图投回原尺寸，用来找放大后跑偏的地方） */
function boxDown(src, sw, sh, dw, dh) {
  const out = new Float32Array(dw * dh * 4), fx = sw / dw, fy = sh / dh;
  for (let y = 0; y < dh; y++) {
    const y0 = Math.floor(y * fy), y1 = Math.max(y0 + 1, Math.min(sh, Math.ceil((y + 1) * fy)));
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor(x * fx), x1 = Math.max(x0 + 1, Math.min(sw, Math.ceil((x + 1) * fx)));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const p = (yy * sw + xx) * 4; r += src[p]; g += src[p + 1]; b += src[p + 2]; a += src[p + 3]; n++; }
      const o = (y * dw + x) * 4; out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n;
    }
  }
  return out;
}
/**
 * img: ImageData → 放大 f 倍后的 ImageData
 * 想要更清楚，单纯“放大 + 锐化”是不够的。这里做了四件事：
 *   ① Lanczos-3 放大（按透明度预乘，边缘不发黑）
 *   ② 迭代反投影：把放大结果投回原图找误差，再把误差加回去，轮廓才不会糊成一团
 *   ③ 去边：半透明边缘的颜色往不透明邻居上靠，消掉白边黑边（贴纸最容易露馅的地方）
 *   ④ 边缘感知锐化：只在有细节的地方加力，平坦区不放大噪点
 */
function hdEnhance(img, f) {
  const sw = img.width, sh = img.height, dw = sw * f, dh = sh * f, s = img.data, n = sw * sh;
  const pre = new Float32Array(n * 4); let soft = 0, vis = 0;
  for (let i = 0; i < n; i++) {
    const a = s[i * 4 + 3]; if (a > 0) vis++; if (a > 25 && a < 230) soft++;
    const k = a / 255; pre[i * 4] = s[i * 4] * k; pre[i * 4 + 1] = s[i * 4 + 1] * k; pre[i * 4 + 2] = s[i * 4 + 2] * k; pre[i * 4 + 3] = a;
  }
  const hard = vis > 0 && soft / vis < 0.1;                       // 边缘干脆的贴纸
  let up = lzResize(pre, sw, sh, dw, dh);
  /* ② 迭代反投影：投回去—算误差—加回去，跑 2 轮就够了 */
  for (let k = 0; k < 2; k++) {
    const low = boxDown(up, dw, dh, sw, sh);
    const err = new Float32Array(pre.length);
    for (let i = 0; i < pre.length; i++) err[i] = pre[i] - low[i];
    const eUp = blResize(err, sw, sh, dw, dh);
    for (let i = 0; i < up.length; i++) up[i] += eUp[i] * 0.9;
  }
  const N = dw * dh;
  const A = new Float32Array(N), C = new Float32Array(N * 3);     // 还原成“直通”颜色 + 透明度
  for (let i = 0; i < N; i++) {
    const a = Math.min(255, Math.max(0, up[i * 4 + 3])); A[i] = a;
    if (a > 0.5) { const k = 255 / a; for (let c = 0; c < 3; c++) C[i * 3 + c] = Math.min(255, Math.max(0, up[i * 4 + c] * k)); }
  }
  /* ③ 去边：半透明边缘往不透明邻居的颜色上靠，去掉白边/黑边 */
  if (hard) {
    const R = 2;
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
      const i = y * dw + x, a = A[i]; if (a <= 10 || a >= 245) continue;
      let r = 0, g = 0, b = 0, cnt = 0;
      for (let dy = -R; dy <= R; dy++) { const yy = y + dy; if (yy < 0 || yy >= dh) continue;
        for (let dx = -R; dx <= R; dx++) { const xx = x + dx; if (xx < 0 || xx >= dw) continue;
          const j = yy * dw + xx; if (A[j] <= 240) continue;
          r += C[j * 3]; g += C[j * 3 + 1]; b += C[j * 3 + 2]; cnt++; } }
      if (!cnt) continue;
      const w = 0.8;
      C[i * 3] = C[i * 3] * (1 - w) + (r / cnt) * w;
      C[i * 3 + 1] = C[i * 3 + 1] * (1 - w) + (g / cnt) * w;
      C[i * 3 + 2] = C[i * 3 + 2] * (1 - w) + (b / cnt) * w;
    }
  }
  /* ④ 边缘感知锐化：按透明度加权，只对超过阈值的细节加力，平坦区不放大噪点 */
  const out = new ImageData(dw, dh), amt = 1.15, thr = 3, wk = [1, 2, 1];
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const i = y * dw + x, o = i * 4, a = A[i]; let na = a;
    if (hard) { let t = (a / 255 - 0.5) / 0.56 + 0.5; t = t < 0 ? 0 : t > 1 ? 1 : t; na = t * t * (3 - 2 * t) * 255; }
    if (na < 0.5) { out.data[o + 3] = 0; continue; }
    let sr = 0, sg = 0, sb = 0, sa = 0;
    for (let dy = -1; dy <= 1; dy++) { const yy = Math.min(dh - 1, Math.max(0, y + dy)); for (let dx = -1; dx <= 1; dx++) {
      const xx = Math.min(dw - 1, Math.max(0, x + dx)), j = yy * dw + xx, w = wk[dy + 1] * wk[dx + 1] * A[j];
      sr += C[j * 3] * w; sg += C[j * 3 + 1] * w; sb += C[j * 3 + 2] * w; sa += w;
    } }
    for (let c = 0; c < 3; c++) {
      const v = C[i * 3 + c], bl = (c === 0 ? sr : c === 1 ? sg : sb) / (sa || 1), d = v - bl;
      out.data[o + c] = Math.min(255, Math.max(0, Math.abs(d) < thr ? v : v + amt * d));
    }
    out.data[o + 3] = Math.round(na);
  }
  return out;
}
async function hdCanvas(srcCv, f) {
  const g = srcCv.getContext('2d'), id = g.getImageData(0, 0, srcCv.width, srcCv.height);
  await new Promise(r => setTimeout(r, 0));                        // 让界面先喘口气
  const o = hdEnhance(id, f), c = document.createElement('canvas'); c.width = o.width; c.height = o.height; c.getContext('2d').putImageData(o, 0, 0); return c;
}
async function hdFile(rel) {
  const bytes = await api.readLib(rel); if (!bytes) throw new Error('read');
  const bm = await createImageBitmap(new Blob([bytes])), f = hdFactor(bm.width, bm.height, true);
  if (f < 2) throw new Error('big');
  const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; c.getContext('2d').drawImage(bm, 0, 0);
  const out = await hdCanvas(c, f), data = await toBytes(out), r = await api.saveHD({ rel, data });
  if (!r || !r.ok) throw new Error('save'); return r.rel;
}
let hdBusy = false;
async function hdRun(rels) {
  if (hdBusy) return; hdBusy = true; let ok = 0;
  try {
    for (let i = 0; i < rels.length; i++) {
      toast(t('hdBusy', { i: i + 1, n: rels.length }));
      try { await hdFile(rels[i]); ok++; } catch (e) { /* 单张失败不影响其他 */ }
    }
  } finally { hdBusy = false; }
  toast(ok ? t('hdDone', { n: ok }) : t('hdFail'));
  if ($('#v-lib').classList.contains('on')) renderLib();
}
/* 素材库：标出分辨率、给低清的加“✦ 高清”按钮 */
async function hdDecorate() {
  const cells = [...document.querySelectorAll('#v-lib .cell')]; const low = [];
  await Promise.all(cells.map(async (c) => {
    const im = c.querySelector('img'); try { await im.decode(); } catch (e) { }
    const w = im.naturalWidth, h = im.naturalHeight; if (!w) return;
    const nm = c.querySelector('.nm'); nm.insertAdjacentHTML('beforeend', ` <i class="dm">${w}×${h}</i>`);
    const isHD = /-HD(_\d+)?\.[a-z]+$/i.test(c.dataset.rel);
    if (Math.max(w, h) < HD.LOW && !isHD) {
      low.push(c.dataset.rel); c.classList.add('low');
      c.querySelector('.im').insertAdjacentHTML('beforeend', `<span class="lowTag">${t('hdTag')}</span>`);
      c.querySelector('.bar').insertAdjacentHTML('afterbegin', `<button class="btn sm" data-hd title="${t('hdTip')}">✦ ${t('hdOne')}</button>`);
    }
  }));
  const head = $('#v-lib .libHead');
  if (low.length && head && !$('#hdAll')) head.insertBefore(Object.assign(document.createElement('button'), { id: 'hdAll', className: 'btn primary', textContent: '✦ ' + t('hdAll', { n: low.length }) }), $('#lbOpen'));
  if ($('#hdAll')) $('#hdAll').dataset.rels = JSON.stringify(low);
}
{
  const _rl = renderLib;
  renderLib = async function () { await _rl(); try { await hdDecorate(); } catch (e) { } };
  $('#v-lib').addEventListener('click', (e) => {
    const b = e.target.closest('[data-hd]'), all = e.target.closest('#hdAll');
    if (b) { e.stopPropagation(); e.preventDefault(); hdRun([b.closest('.cell').dataset.rel]); }
    else if (all) { e.stopPropagation(); hdRun(JSON.parse(all.dataset.rels || '[]')); }
  }, true);
  /* 保存元素时自动修复小图（只在“保存”这一条路径上） */
  const _bo = buildOut;
  buildOut = async function () {
    const out = await _bo();
    if (!out || !HD.save || !(CFG && CFG.autoHD)) return out;
    for (const o of out) { const f = hdFactor(o.cv.width, o.cv.height, false); if (f > 1) o.cv = await hdCanvas(o.cv, f); }
    return out;
  };
  const _ds = doSave;
  doSave = async function () { HD.save = true; try { await _ds(); } finally { HD.save = false; } };
}

/* 设置页：新增“素材处理与快捷键” */
{
  const _rs = renderSettings;
  renderSettings = async function () {
    await _rs();
    const page = $('#v-set .page'), sets = page && page.querySelectorAll('.set'); if (!sets || !sets.length || $('#sHD')) return;
    const box = document.createElement('div'); box.className = 'set';
    box.innerHTML = `<h3>${t('sTools')}</h3>
      <label class="item"><div><div class="t">${t('sHD')}</div><div class="d">${t('sHDD', { n: HD.LOW })}</div></div><input type="checkbox" class="sw" id="sHD" ${CFG.autoHD ? 'checked' : ''}></label>
      <div class="item"><div><div class="t">${t('aiModel')}</div><div class="d">${t('aiModelDesc')}</div></div>
        <select id="sAiModel"><option value="q8">${t('aiModelQ')} · ${t('aiModelQDesc')}</option><option value="fp32">${t('aiModelF')} · ${t('aiModelFDesc')}</option></select></div>
      <div class="item"><div><div class="t">${t('sKeys')}</div><div class="d">${t('sKeysD')}</div></div><button class="btn" id="sKeys">${t('viewBtn')}</button></div>`;
    sets[Math.min(1, sets.length - 1)].after(box);
    $('#sHD').onchange = async (e) => { const r = await api.setSettings({ autoHD: e.target.checked }); if (r && r.settings) CFG = r.settings; else CFG.autoHD = e.target.checked; };
    const sm = $('#sAiModel');
    if (sm) {
      sm.value = (CFG && CFG.aiModel) || 'q8';
      sm.onchange = async (e) => { const v = e.target.value; aiSetMode(v); const r = await api.setSettings({ aiModel: v }); if (r && r.settings) CFG = r.settings; };
    }
    $('#sKeys').onclick = showKeys;
  };
}
