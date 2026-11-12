/* 本地联动服务：只监听 127.0.0.1，让“小剪动画”能读到素材库里的元素。
 * GET /api/ping           → {app:"pixpeel"}
 * GET /api/list           → 素材库列表
 * GET /file/<相对路径>     → 图片本身
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { listLib, resolveSafe } = require('./lib');

const MIME = { '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif' };
let srv = null;

function start(getDir, port) {
  return new Promise((resolve) => {
    stop();
    const s = http.createServer((req, res) => {
      const cors = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Private-Network': 'true',
        'Access-Control-Max-Age': '600',
        'Cache-Control': 'no-store'
      };
      if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
      if (req.method !== 'GET') { res.writeHead(405, cors); res.end(); return; }
      let u;
      try { u = new URL(req.url, 'http://127.0.0.1'); } catch (e) { res.writeHead(400, cors); res.end(); return; }
      if (u.pathname === '/api/ping') {
        res.writeHead(200, { ...cors, 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ app: 'pixpeel', version: 1 }));
        return;
      }
      if (u.pathname === '/api/list') {
        const list = listLib(getDir()).map(x => ({
          id: x.rel, name: x.name, group: x.group, mtime: Math.round(x.mtime), size: x.size,
          url: '/file/' + x.rel.split('/').map(encodeURIComponent).join('/')
        }));
        res.writeHead(200, { ...cors, 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ dir: path.basename(getDir()), items: list }));
        return;
      }
      if (u.pathname.startsWith('/file/')) {
        let rel;
        try { rel = decodeURIComponent(u.pathname.slice(6)); } catch (e) { res.writeHead(400, cors); res.end(); return; }
        const full = resolveSafe(getDir(), rel);
        const type = full && MIME[path.extname(full).toLowerCase()];
        if (!full || !type || !fs.existsSync(full) || !fs.statSync(full).isFile()) { res.writeHead(404, cors); res.end(); return; }
        res.writeHead(200, { ...cors, 'Content-Type': type });
        fs.createReadStream(full).pipe(res);
        return;
      }
      res.writeHead(404, cors); res.end();
    });
    s.on('error', (e) => { srv = null; resolve({ ok: false, msg: e.code === 'EADDRINUSE' ? `端口 ${port} 被占用了` : String(e.message || e) }); });
    s.listen(port, '127.0.0.1', () => { srv = s; resolve({ ok: true }); });
  });
}
function stop() { if (srv) { try { srv.close(); } catch (e) { /* ignore */ } srv = null; } }
function running() { return !!srv; }

module.exports = { start, stop, running };
