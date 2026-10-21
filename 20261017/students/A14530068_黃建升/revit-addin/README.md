# Revit 外掛：匯出房間給磁磚放樣系統

在 Revit 2024 選一個房間（浴室），匯出網頁版用的「施工圖資料檔」（JSON），到網頁按「📂 匯入資料檔」就有四面牆、地坪外框（含 L 形）與門窗，再設定磁磚與起磚點。

## 匯出什麼

| 項目 | 從 Revit 哪裡讀 |
|---|---|
| 地坪外框 | 房間邊界（**完成面**，也就是貼磚面），曲牆切成折線；不是矩形時附上外框 |
| 四面牆寬、高 | 外框的寬／深；高度＝房間高度（Unbounded Height） |
| 門窗 | 房間邊界牆上的門、窗：位置、寬、高、窗台高 |
| 圖名 | 專案名稱、房間編號＋名稱 |

方位跟網頁一致：平面上方（+Y）＝B 面、下方＝D、左＝A、右＝C；立面站在房間裡面向牆看，A、D 左右相反（換算在 `RoomExportModel.cs`）。

## 限制（請確認）

- 假設牆跟專案座標的 X／Y 軸平行（模型有旋轉時方位會錯）。
- 房間內有柱子（內圈邊界）只匯出外框，會提醒。
- 磁磚尺寸、起磚點、材料在網頁上設定（Revit 裡沒有這些資訊）。

## 編譯與安裝（Windows）

需要：Revit 2024、[.NET SDK 8](https://dotnet.microsoft.com/download)（或 Visual Studio 2022）。

```powershell
cd revit-addin
dotnet build -c Release        # 第一次會從 NuGet 下載 Revit API 參考檔
powershell -File install.ps1   # 複製到 %AppData%\Autodesk\Revit\Addins\2024
```

重開 Revit → **增益集 → 外部工具 → 磁磚放樣：匯出房間（JSON）**。

使用：平面圖上先點選房間（或執行後再點），選存檔位置，完成。

## 開發說明

- `RoomExportModel.cs`：房間 → JSON 的換算，**不依賴 Revit**，可以單獨測試。
- `ExportRoomCommand.cs`：Revit 的部分（選房間、讀邊界與門窗、存檔）。
- `../tests/fixtures/revit-sample.json`：用 `RoomExportModel` 對範例浴室實際產生的檔案，`tests/test-runner.js` 會檢查網頁能不能正確讀它。
- 開發時已用 Revit 2024 API 參考組件編譯通過；**還沒在真的 Revit 裡執行過**，第一次用請對照一間已知尺寸的浴室核對。
