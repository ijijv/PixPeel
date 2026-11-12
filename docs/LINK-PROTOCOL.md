# 小剪动画 ↔ PixPeel 联动协议

`editor/xiaoji-animation.html`（浏览器里的本地动画编辑器）和 PixPeel 桌面版之间靠**本机 HTTP 接口**联动：
不经过任何服务器、不上传任何数据、也不需要账号。

## 谁能连谁

只有一边主动：**小剪动画（H5）去拉 PixPeel**。PixPeel 不会去连浏览器。

```
xiaoji-animation.html（用 file:// 打开）
   │  ① GET http://127.0.0.1:17652/api/ping        → 桌面版在不在
   │  ② GET http://127.0.0.1:17652/api/list        → 素材库里有哪些元素
   │  ③ GET http://127.0.0.1:17652/file/<相对路径>  → 取 PNG 二进制
   ▼
PixPeel 桌面版（本机 HTTP 服务，只监听 127.0.0.1）
```

## 接口

### `GET /api/ping`

判断桌面版在不在、是不是 PixPeel。

```json
{ "app": "pixpeel", "version": 1 }
```

- `app` 固定是 `pixpeel`；老版本「拆元素」是 `chaiyuansu`，H5 仍然兼容这两个值。
- `version` 是接口版本号。H5 目前**不检查**它，留着以后升级协议时用。

### `GET /api/list`

返回素材库里所有元素。

```json
{
  "dir": "拆元素素材",
  "items": [
    {
      "id": "PixPeel 2026-11-12-13-45-22/元素 63.png",
      "name": "元素 63.png",
      "group": "PixPeel 2026-11-12-13-45-22",
      "mtime": 1794462322225,
      "size": 6471,
      "url": "/file/PixPeel%202026-11-12-13-45-22/%E5%85%83%E7%B4%A0%2063.png"
    }
  ]
}
```

`url` 是相对于服务根目录的路径，拼上 `http://127.0.0.1:<端口>` 就能直接取到图片。

### `GET /file/<相对路径>`

返回 PNG / WebP / JPG / GIF 原图。路径相对于素材库目录，越界会被拒绝（`resolveSafe`）。

## 跨域

PixPeel 每次响应都带这些头，所以 `file://` 打开的页面可以直接取：

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: *
Access-Control-Allow-Private-Network: true
```

`Access-Control-Allow-Private-Network: true` 是关键：Chrome 的「本地网络访问」策略会拦网页访问
本机 `127.0.0.1`，少了这个头就会失败。

## 端口

默认 `17652`，两边都能改：

- PixPeel：设置 →「联动服务与端口」
- 小剪动画：贴纸页右侧的端口输入框（记在 `localStorage['xl_port']`）

**两边必须一致。**

## 兼容性约定

H5 不用改，就能适配任何满足下面三条的 PixPeel：

1. `/api/ping` 返回的 JSON 里 `app` 是 `pixpeel`
2. `/api/list` 返回 `{ items: [...] }`，每个 item 有 `name` / `group` / `url`
3. `url` 拼上服务地址后能取到图片二进制

反过来，改 PixPeel 时要保证这三条不变。真要改协议，就把 `/api/ping` 的 `version` 加 1，
并在 H5 里同时兼容新旧两种格式，别一刀切。

## 实测记录

- 2026-11-12，Chromium 里用 `file://` 打开 `xiaoji-animation.html`，PixPeel 1.0.0：
  `/api/ping` 返回 `{"app":"pixpeel","version":1}`，素材库 87 个元素全部拉取成功，
  并以透明贴图的形式导入到「我的贴图」。
