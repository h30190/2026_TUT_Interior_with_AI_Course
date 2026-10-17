# 2026-10-17｜黃麟珍 A15530027

本次成果為兩個可離線操作的室內設計製作估算網頁。下載此資料夾後，用瀏覽器開啟對應 `index.html`，並保留同資料夾的 JS、CSS 等檔案。

## 1. 再生塑膠 3D 列印材料與場域選擇

[開啟材料工具](filament-material-selector/index.html) · [使用說明](filament-material-selector/README.md)

依使用場域、溫度、剛柔性及設備條件，比較 PLA、PETG、ASA、TPU95A、PA11-CF 與未知批次的再生 PET。可上傳 STL/OBJ 模型或 PNG/JPG/WEBP 圖面估算材料體積，自動連動重量、成本、工時與耗電。僅比較3D列印材料，不含木作對照。

有來源的牌號物性與可修改的教學假設分開呈現；資料不足列為待確認，不強行推薦。可調權重與匯出含估算依據的CSV。

## 2. 特殊曲面壁板製作比較

[開啟壁板工具](wave-panel-calculator/index.html) · [使用說明](wave-panel-calculator/README.md)

以波浪曲面或使用者上傳的模型／圖面，估算木作、再生塑膠列印及混合工法的材料、成本、時間與能源，調整五項權重並標記非劣解。

## 驗證

不需安裝套件，使用 Node.js 執行：

```sh
node filament-material-selector/model.test.cjs
node filament-material-selector/geometry.test.cjs
node wave-panel-calculator/model.test.cjs
node wave-panel-calculator/mesh.test.cjs
```

開發時另以 Chrome/Playwright 驗證場域篩選、上傳、兩點比例校正、單位縮放、CSV匯出與手機排版。此提交不含開發機專用的瀏覽器測試路徑或截圖。

## 計算範圍

模型用料是幾何或表皮近似，不是完整切片軟體；圖片需校正尺寸並補入厚度、曲面等假設。未知料性能不外推，費用與產能預設均為教學情境值，可換成實測或報價。網頁保留公式、原始資料來源、查閱日期及限制，成果用於概念選型與課堂展示。
