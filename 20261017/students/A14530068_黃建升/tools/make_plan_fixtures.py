# 產生「只有地坪平面」的測試 DXF（全部自己畫，不含業主資料）：python tools/make_plan_fixtures.py tests/fixtures
import sys, os, ezdxf
out = sys.argv[1]

def walls_lines(msp, x0, y0, x1, y1, t=15, gaps=(), color=7, layer='0'):
    """雙線牆（直線），gaps: [(side, a, b)] 在 side 牆上 a~b 開口（a,b 為沿牆座標）"""
    def seg(side, inner, outer):
        lo, hi = (x0, x1) if side in 'BD' else (y0, y1)
        cuts = sorted([(a, b) for s, a, b in gaps if s == side])
        pts = [lo] + [v for ab in cuts for v in ab] + [hi]
        for i in range(0, len(pts), 2):
            a, b = pts[i], pts[i + 1]
            for c in (inner, outer):
                if side in 'BD': msp.add_line((a, c), (b, c), dxfattribs={'color': color, 'layer': layer})
                else: msp.add_line((c, a), (c, b), dxfattribs={'color': color, 'layer': layer})
    seg('B', y1, y1 + t); seg('D', y0, y0 - t); seg('A', x0, x0 - t); seg('C', x1, x1 + t)

def abcd_block(doc):
    b = doc.blocks.new('ABCD')
    b.add_circle((1592.53, 316.70), 9.65)
    for k, (dx, dy) in {'B': (0, 1), 'D': (0, -1), 'A': (-1, 0), 'C': (1, 0)}.items():
        b.add_text(k, dxfattribs={'height': 11.58, 'insert': (1592.53 + dx * 28, 316.70 + dy * 28)})

def door_block(doc, name, w):
    b = doc.blocks.new(name)
    b.add_line((0, 0), (0, w))                 # 門片（開到 90°）
    b.add_arc((0, 0), w, 0, 90)                # 開門弧線
    return name

# 1. 有 ABCD、雙線牆、門圖塊（D 面距左 20、寬 86，門洞正好在房間中心下方）、天花與門高文字、材料
doc = ezdxf.new('R2013'); msp = doc.modelspace()
abcd_block(doc); door_block(doc, 'DOOR86', 86)
X, Y = 1000, 500
walls_lines(msp, X, Y, X + 207, Y + 187, gaps=[('D', X + 20, X + 106)])
msp.add_blockref('DOOR86', (X + 20, Y))
cx, cy = X + 207 / 2, Y + 187 / 2
msp.add_blockref('ABCD', (cx - 1592.53, cy - 316.70))
msp.add_text('天花 FL+289', dxfattribs={'height': 10, 'insert': (X + 10, Y + 160)})
msp.add_text('門高 239', dxfattribs={'height': 10, 'insert': (X + 10, Y + 140)})
msp.add_text('主臥浴室', dxfattribs={'height': 12, 'insert': (X + 130, Y + 150)})
msp.add_mtext('壁\\PW120-TEST\\P120*120 白\\P填縫劑：白', dxfattribs={'char_height': 8, 'insert': (X + 300, Y + 180)})
msp.add_mtext('地\\PF60-TEST\\P60*120 灰\\P填縫劑：灰', dxfattribs={'char_height': 8, 'insert': (X + 300, Y + 120)})
doc.saveas(os.path.join(out, 'plan-abcd.dxf'))

# 2. 一條 L 形外框（封閉聚合線）＋A 面開門弧線（直接畫，不是圖塊），沒有任何文字
doc = ezdxf.new('R2013'); msp = doc.modelspace()
msp.add_lwpolyline([(0, 0), (240, 0), (240, 180), (100, 180), (100, 220), (0, 220)], close=True)
msp.add_arc((0, 30), 80, 0, 90)             # 門軸在 A 牆（x=0）離底 30，弧端 (0,110) 在牆上
msp.add_line((0, 30), (80, 30))
doc.saveas(os.path.join(out, 'plan-outline.dxf'))

# 3. 兩間房、雙線牆畫成封閉聚合線（外圈、內圈），其中一間有浴缸外框
doc = ezdxf.new('R2013'); msp = doc.modelspace()
def rect(x0, y0, x1, y1, **a): msp.add_lwpolyline([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], close=True, dxfattribs=a)
rect(0, 0, 210, 180); rect(-15, -15, 225, 195)
rect(300, 0, 480, 240); rect(285, -15, 495, 255)
rect(310, 10, 380, 160)                      # 浴缸 70×150
doc.saveas(os.path.join(out, 'plan-rooms.dxf'))

# 4. 整張平面圖：三間房、彩色直線牆、沒有 ABCD、沒有封閉外框 → 要用點的
doc = ezdxf.new('R2013'); msp = doc.modelspace()
doc.layers.add('WALL', color=2)
walls_lines(msp, 0, 0, 300, 400, layer='WALL', color=256)
walls_lines(msp, 315, 0, 515, 180, layer='WALL', color=256, gaps=[('A', 100, 170)])
walls_lines(msp, 315, 195, 515, 400, layer='WALL', color=256)
msp.add_arc((315, 100), 70, 0, 90)           # 第二間 A 牆上的門
doc.saveas(os.path.join(out, 'plan-floor.dxf'))
print('ok')
