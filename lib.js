/* 素材库：扫描保存文件夹。主进程和本地联动服务共用。 */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const EXT = new Set(['.png', '.webp', '.jpg', '.jpeg', '.gif']);
const EXT_SVG = new Set(['.svg']);

/** 在 dir 下找出所有图片（最多两层：dir/文件 或 dir/批次/文件） */
function listKind(dir, exts) {
  const out = [];
  let top;
  try { top = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  const add = (full, rel, group) => {
    try {
      const st = fs.statSync(full);
      out.push({ rel: rel.split(path.sep).join('/'), name: path.basename(full), group, mtime: st.mtimeMs, size: st.size, url: pathToFileURL(full).href });
    } catch (e) { /* ignore */ }
  };
  for (const d of top) {
    if (d.name.startsWith('.')) continue;
    const full = path.join(dir, d.name);
    if (d.isFile() && exts.has(path.extname(d.name).toLowerCase())) add(full, d.name, '');
    else if (d.isDirectory()) {
      let sub = [];
      try { sub = fs.readdirSync(full, { withFileTypes: true }); } catch (e) { /* ignore */ }
      for (const f of sub) if (f.isFile() && exts.has(path.extname(f.name).toLowerCase())) add(path.join(full, f.name), path.join(d.name, f.name), d.name);
    }
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return out;
}
function listLib(dir) { return listKind(dir, EXT); }
/** SVG 单独一份清单：素材库（给小剪动画读）里不能混进 SVG */
function listSvg(dir) { return listKind(dir, EXT_SVG); }

/** 把相对路径安全地解析到 dir 里面，防止 ../ 跳出去 */
function resolveSafe(dir, rel) {
  const base = path.resolve(dir);
  const full = path.resolve(base, rel);
  if (full !== base && !full.startsWith(base + path.sep)) return null;
  return full;
}

/** 文件名里不能有的字符替换掉，并保证不重名 */
function safeName(name) {
  return String(name).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 80) || '元素';
}
function uniquePath(dir, base, ext) {
  let p = path.join(dir, base + ext), i = 2;
  while (fs.existsSync(p)) p = path.join(dir, `${base}_${i++}${ext}`);
  return p;
}

module.exports = { listLib, listSvg, resolveSafe, safeName, uniquePath, EXT };
