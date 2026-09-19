---
name: interior-finish-estimator
description: Estimate paint, tile, and wallpaper quantities for interior spaces from room dimensions, openings, coverage, and waste assumptions. Use for early material planning and budget quantities; do not use as a final supplier quote or for structural calculations.
---

# 室內裝修材料估算

把空間尺寸轉成可核對、可採購的材料數量。結果必須讓使用者看得懂用了哪些資料、公式與假設。

## 先確認輸入

依材料類型收集必要資料：

- 空間長、寬、高與單位。
- 要施工的面，例如四面牆、天花板或地坪。
- 門窗等不施工區域的尺寸與數量。
- 油漆塗布率與塗刷道數、磁磚尺寸與每箱片數，或壁紙卷寬與卷長。
- 耗損率；若使用者未指定，先提出建議值並標示為假設。
- 單價與包裝規格；只有在需要估算預算或購買數量時才詢問。

關鍵資料不足時先詢問。若使用者要快速概算，可以採用合理預設，但要把每個預設列在結果最前面，方便替換。

## 使用計算腳本

數值計算一律執行 `scripts/estimate_finishes.py`，不要在回覆中自行重算。這可固定單位、公式、耗損與包裝進位規則。

1. 依材料選擇 `paint`、`tile` 或 `wallpaper` 子命令。
2. 所有空間長度輸入公尺；磁磚尺寸輸入公分；耗損使用百分比。
3. 不確定參數名稱時先執行 `python scripts/estimate_finishes.py <模式> --help`。
4. 執行腳本後讀取 JSON，將 `inputs`、`calculations` 與 `purchase` 轉成使用者易懂的說明。
5. 需要解釋公式或確認參數含義時，讀取 [references/formulas.md](references/formulas.md)。

腳本回報錯誤時修正輸入，不可略過錯誤後自行猜測結果。若環境無法執行 Python，說明限制並提供已整理的輸入資料，等使用者決定下一步。

## 輸出格式

先列「已知資料」與「估算假設」，再用表格呈現：

| 項目 | 淨施工量 | 耗損率 | 含耗損需求 | 建議購買量 |
|---|---:|---:|---:|---:|

表格後簡短列出計算式。若有單價，分開顯示材料小計與總額，不把人工、底材、運費或稅金偷偷算入。

最後用腳本輸出的中間值做合理性檢查：確認門窗扣除、塗刷道數、耗損與包裝進位均只計算一次。提醒使用者現場尺寸、材料批次與施工方式可能改變實際用量。

## 邊界

這是前期概算工具。遇到結構安全、消防、電氣法規、危險材料或正式報價時，清楚說明需要由合格專業人員或供應商確認。
