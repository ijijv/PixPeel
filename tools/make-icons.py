# 生成应用图标：橙色圆角方块 + 白色虚线取景框 + 中心圆点（按用户给的图标重绘成矢量级清晰度）
import math, sys
from PIL import Image, ImageDraw
S = 4096                       # 超采样画布
ORANGE = (255, 107, 61, 255)

def rr_path(cx, cy, half, r, step=6):
    """圆角方形轮廓上的点（顺时针，从上边中点开始）"""
    pts = []
    def arc(ax, ay, a0, a1):
        n = max(8, int(r * abs(a1 - a0) / step))
        for i in range(n + 1):
            a = a0 + (a1 - a0) * i / n
            pts.append((ax + r * math.cos(a), ay + r * math.sin(a)))
    x0, y0, x1, y1 = cx - half, cy - half, cx + half, cy + half
    pts.append((cx, y0))
    pts.append((x1 - r, y0)); arc(x1 - r, y0 + r, -math.pi / 2, 0)
    pts.append((x1, y1 - r)); arc(x1 - r, y1 - r, 0, math.pi / 2)
    pts.append((x0 + r, y1)); arc(x0 + r, y1 - r, math.pi / 2, math.pi)
    pts.append((x0, y0 + r)); arc(x0 + r, y0 + r, math.pi, math.pi * 1.5)
    pts.append((cx - 1, y0))
    return pts

def dashed(draw, pts, dash, gap, width, fill):
    # 沿轮廓等距取样，落在“实线段”里的点盖一个小圆，边缘最平滑
    # 先重采样成等距点
    res = [pts[0]]; carry = 0.0; step = width / 5
    for a, b in zip(pts, pts[1:]):
        seg = math.dist(a, b)
        if seg == 0: continue
        pos = step - carry
        while pos <= seg:
            res.append((a[0] + (b[0]-a[0]) * pos / seg, a[1] + (b[1]-a[1]) * pos / seg)); pos += step
        carry = seg - (pos - step)
    period = dash + gap; w = width / 2
    for i, p in enumerate(res):
        if (i * step) % period < dash:
            draw.ellipse([p[0]-w, p[1]-w, p[0]+w, p[1]+w], fill=fill)

def render(frame=True, bg=True, color=(255, 255, 255, 255)):
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if bg:
        m = int(S * 0.06)
        d.rounded_rectangle([m, m, S - m, S - m], radius=int(S * 0.23), fill=ORANGE)
    c = S / 2
    half = S * 0.255
    per = rr_path(c, c, half, S * 0.07)
    total = sum(math.dist(a, b) for a, b in zip(per, per[1:]))
    n = 12                                   # 12 段虚线
    unit = total / n
    dashed(d, per, unit * 0.58, unit * 0.42, int(S * 0.034), color)
    r = S * 0.082
    d.ellipse([c - r, c - r, c + r, c + r], fill=color)
    return im

def small(im, n): return im.resize((n, n), Image.LANCZOS)

full = render()
full1024 = small(full, 1024)
full1024.save('build/icon.png')
small(full, 128).save('renderer/icon.png')
full1024.save('build/icon.ico', sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
try:
    full1024.save('build/icon.icns')
except Exception as e:
    print('icns skipped:', e)
# 托盘：Windows/Linux 用彩色 32px（@2x 另给），macOS 用黑色单色模板图
small(full, 32).save('build/tray.png'); small(full, 64).save('build/tray@2x.png')
tpl = render(bg=False, color=(0, 0, 0, 255))
small(tpl, 22).save('build/trayTemplate.png'); small(tpl, 44).save('build/trayTemplate@2x.png')
# 通知用图标
small(full, 128).save('build/notify.png')
print('ok')
