# 產生匯出 DXF 用的空白圖檔骨架 → js/dxf-template.js
# 為什麼要骨架：AutoCAD 讀 R2013 DXF 很嚴格（表格、物件字典、代碼都要齊），
# 用 ezdxf 產一份保證合格的空圖，網頁只往裡面加圖元，就不會被 AutoCAD 拒絕。
# 平常不用跑；要改圖層、字型、尺寸樣式時才改這裡再執行：
#   pip install ezdxf
#   python tools/make_dxf_template.py
import json, os, ezdxf

doc = ezdxf.new('R2013')
# 跟使用者施工圖一樣：檔頭寫 mm，實際 1 單位＝1 cm（插入時才不會被放大縮小）
doc.header['$INSUNITS'] = 4
doc.header['$MEASUREMENT'] = 1
# 圖層名稱跟施工圖一樣，插入原圖時會併到原本的圖層
doc.layers.add('地磚', color=8)
doc.layers.add('壁磚', color=8)
# 每種磁磚的 Hatch 另外一層，在 AutoCAD 可以單獨關掉／凍結
doc.layers.add('壁磚-HATCH', color=8)
doc.layers.add('地磚-HATCH', color=8)
doc.layers.add('T-DIM', color=8)
doc.layers.add('標註', color=4)
doc.styles.add('AEK', font='arial.ttf')
# 尺寸樣式「複本 ISO-25」：字高 10、箭頭 2.5、小數 1 位且去掉尾數 0
doc.dimstyles.new('複本 ISO-25', dxfattribs={
    'dimtxt': 10, 'dimasz': 2.5, 'dimexe': 1.25, 'dimexo': 0.625, 'dimgap': 0.625,
    'dimtad': 1, 'dimdec': 1, 'dimzin': 8, 'dimtxsty': 'Standard'})

here = os.path.dirname(os.path.abspath(__file__))
tmp = os.path.join(here, '_template.dxf')
doc.saveas(tmp)
text = open(tmp, encoding='utf-8').read()
os.remove(tmp)
# 拿掉 ezdxf 寫入的建立時間，重跑時檔案內容才會一樣
lines = text.split('\n')
for i, s in enumerate(lines):
    if '@ ' in s and s.strip().startswith(ezdxf.__version__):
        lines[i] = ezdxf.__version__
text = '\n'.join(lines)
out = os.path.join(here, '..', 'js', 'dxf-template.js')
with open(out, 'w', encoding='utf-8', newline='\n') as f:
    f.write('// 自動產生，請勿手改：python tools/make_dxf_template.py\n')
    f.write('// 匯出 DXF 用的空白 R2013 圖檔（圖層 地磚／壁磚／HATCH／T-DIM／標註、字型 AEK、尺寸樣式「複本 ISO-25」）\n')
    f.write('const DXF_TEMPLATE = ' + json.dumps(text, ensure_ascii=False) + ';\n')
print('wrote', out, len(text), 'chars')
