# 這週（20261121）計畫：室內設計手機板 App

> 給 AI 助手（Gemini／反重力）讀取的說明。寫程式前請先完整讀過這份檔案。

## 一、專案在哪裡

- App 專案位置：`interior-design-app/`（就在本資料夾下面）
- 這是 Jason（學號 A14530068 黃建升）碩士班「室內設計與 AI」這週的課堂作業。

## 二、環境（已驗證過，不用重裝）

- Expo SDK 58、React Native 0.88.1、React 19.3.0、TypeScript ~6.0
- `node_modules` 已裝好；`npx expo-doctor` 20 項檢查全過
- 入口是根目錄 `App.tsx`，目前還是 Expo 預設範本（只有一行文字）
- **沒有用 Expo Router**（沒裝 expo-router、沒有 `src/app/`）。要做多頁導航前，先問 Jason 要不要加
- 新增套件一律 `npx expo install <package>`，**不要**直接 `npm install`
- 每完成一段跑 `npx expo lint` 和 `npx tsc --noEmit`，兩個都過才算完成

## 三、做什麼

Jason 是室內設計工作室「氣韻居所」的老闆（也接繪圖兼工務），本身已有內部管理系統（龍蝦／自有業務 App）。
因此這支手機 App 定位為**與既有系統互補的《氣韻居所・隨身 AI Agents 智囊團》**，專注於「人在外頭跑（工地巡場、與業主喝咖啡初談、車上回 LINE）且不洩漏公司帳務底價機密」的 4 大隨身 Agents：

1. **🗣️ 溝通談判 Agent（黑白臉話術轉換器）**：輸入現場大白話或點選常見情境（業主凹免費追加、請師傅拆改、工期順延），一鍵切換「溫柔顧問（對業主）」「合約護航（對奧客）」「工地阿兄（對師傅）」三種角色文案，並呼叫 iOS 原生分享面板一鍵傳 LINE。
2. **📐 老工務長 Agent（尺寸悲劇預警 ＆ 隱蔽工程防呆驗收）**：
   - 尺寸底線勸退器：滑動調整走道／櫃體／衛浴尺寸，即時顯示綠／黃／紅燈與「低於此尺寸的真實生活慘況」，當場拿畫面說服業主。
   - 封板／試水前防呆清單：水電、泥作、木作隱蔽工程檢核與必拍照片提醒。
3. **📸 看圖指派 Agent（現場平面／照片紅點標註）**：在空間區域圖上直接點擊釘上編號紅點（📍1、📍2），選擇工種與缺失標籤，自動彙整成「圖文對照 LINE 派工卡」。
4. **🎭 客戶沙盒 Agent（零機密互動診斷）**：可開啟「🔒 客戶展示模式」，讓客戶自己點選家庭成員、寵物、生活習慣與「硬裝／軟裝／設備預算天平」，即時生成《氣韻居所・空間氣質診斷書》。

## 四、寫碼規範、分層架構與 iOS 銜接規範

- 同資料夾 `interior-design-app/AGENTS.md` 是 Expo 官方給 AI 的規範，重點：Expo 每個 SDK 版本都有 breaking change，**不要憑記憶寫 API**，寫之前查 https://docs.expo.dev/versions/v58.0.0/
- **分層模組化架構（不要全部塞在同一個檔案）**：
  - `App.tsx`：主框架、iOS 安全區域、龍蝦連線狀態列、底部 4 大 Agent 導航切換
  - `src/types/agent.ts`：所有 TypeScript 型別定義
  - `src/theme/iosTheme.ts`：「氣韻居所」品牌暖灰木質配色與 iOS HIG 設計常數
  - `src/services/lobsterBridge.ts`：龍蝦系統／外部 AI API 轉接層（支援離線本地智慧引擎與遠端 Webhook/API 切換）＋ iOS 原生 `Share` 分享封裝
  - `src/data/presets.ts`：室內設計專業預設資料庫（情境、人體工學尺寸底線、驗收項目、空間區域）
  - `src/agents/NegotiatorAgent.tsx`：溝通談判 Agent 畫面與邏輯
  - `src/agents/ChiefEngineerAgent.tsx`：老工務長 Agent 畫面與邏輯
  - `src/agents/PinpointAgent.tsx`：看圖指派 Agent 畫面與邏輯
  - `src/agents/ClientSandboxAgent.tsx`：客戶沙盒 Agent 畫面與邏輯
- **iOS (iPhone) 專屬規範與回家接 MacBook 規範**：
  - 遵循 Apple Human Interface Guidelines (HIG)：預留 iPhone 頂部動態島／瀏海與底部 Home Indicator 安全距離、最小觸控熱區 44pt、圓角卡片與流暢回饋。
  - 使用 `KeyboardAvoidingView`（iOS 設為 `padding`）確保在 iPhone 打字時輸入框不被鍵盤遮擋。
  - 使用 React Native 原生 `Share.share()` 呼叫 iOS 系統分享選單（可直接傳送到 LINE、複製或 AirDrop）。
  - 採用 Continuous Native Generation (CNG)：在 Windows 開發期間不手動建立 `ios/` 資料夾，使用純跨平台核心元件以確保隨時可用 iPhone `Expo Go` 掃碼預覽，回家後在 MacBook 上可直接執行 `npx expo run:ios` 或透過 Xcode 編譯安裝至 iPhone。
- 介面文案一律使用繁體中文。

## 五、課堂規則（必須遵守）

- 只能動 `students/A14530068_黃建升/` 裡面的檔案，其他同學的資料夾和 repo 上層的 README 一律不能改
- 單一檔案不超過 5 MB；`.rvt .skp .dwg` 等大檔、影片、機密檔（金鑰、密碼、token）不能放進來
- 每完成一段就 commit：
  - `git add 20261121/students/A14530068_黃建升`
  - `git commit -m "20261121 A14530068 黃建升：<做了什麼>"`
- **不要 push、不要發 PR**，除非 Jason 明說「交件」

## 六、目前進度

- [x] Expo 專案建好、環境檢查通過
- [x] 功能範圍與分層架構、iOS 規範由 Jason 拍板
- [x] 建立 `src/` 分層模組與 4 大 Agents 畫面並通過 lint / typecheck

## 七、下一輪要加的三件事（Jason 已拍板，照順序做）

### 任務 1：看圖指派改成真的拍照標記（最優先）
- `npx expo install expo-image-picker` 拍案場照片（Expo Go 可直接跑，不要選需要 native build 的庫）
- 在照片上直接點出紅點（取代現在的假平面網格），紅點資料沿用既有 `PinMarker` 型別
- 派工單用現成的 `shareViaIOS`／RN Share 分享出去
- 照片不上傳任何地方，只存本機

### 任務 2：資料落地
- 紅點、派工紀錄重開 App 要在
- 用 `npx expo install expo-sqlite`（青睞）或 AsyncStorage；寫一個簡單儲存層就好，不要做遷移系統
- 「看圖指派」頁要能列出／刪除歷史派工單

### 任務 3：老工務長接論文知識
- Jason 的碩士論文：〈住宅浴室地坪泥作之現場決策知識與 BIM 承載可行性〉
- 在 `presets.ts` 新增一組「浴室地坪決策事件」結構（情境、判斷依據、處理方式），先放**範例結構**，真正的論文資料 Jason 之後自己補，**不要編造論文內容**

### 順手修掉
- `presets.ts` 的 `NEGOTIATOR_SCenarios` 改名為 `NEGOTIATOR_SCENARIOS`（大小寫不一致）
- 假 endpoint `http://192.168.1.100:8787` 在設定 Modal 標明「示範用，尚未串接」

### 驗收標準（每項都要過才算完成）
- `npx expo lint`、`npx tsc --noEmit`、`npx expo-doctor` 三個都過
- 不新增需要 development build 的套件（保持 Expo Go 可跑，課堂要用手機直接演示）

## 八、任務 4：串接本地端 Strata 模型（Jason 已拍板）

### 架構
```
手機 (Expo Go，同 WiFi) → 電腦上的小 proxy server → Strata (OpenAI 相容 API)
```
- Strata 本機端點：`http://127.0.0.1:8080/v1`（只綁本機，手機連不進去，所以必須有 proxy）
- 模型 ID：以 `http://127.0.0.1:8080/v1/models` 實際查詢為準（Jason 說應為 Qwen 3.8 Q3_S 版；寫死前先查一次，proxy 的 `.env` 也填查到的值）

### Proxy server（放 `interior-design-app/server/`，純 Node，不加框架）
- 用原生 `http` 模組實作 `POST /v1/chat/completions` 轉發到 Strata；監聽 `0.0.0.0:8787`、開 CORS
- **OpenAI 相容模式**：手機端送標準 OpenAI chat completions 格式（model / messages），proxy 原樣轉發，只換 base URL。以後要換 Ollama、OpenAI、龍蝦 Gateway，改 server 的 `.env` 就好，手機端一行不動
- **API key 擋在 proxy**：key 讀自 `server/.env`（`.gitignore` 排除 `.env`），只在伺服器端附加到 Authorization header；**手機端和 repo 任何檔案不得出現 key**。沒 key 的本地模式就送 `Authorization: Bearer local` 佔位
- `.env.example` 放進 repo（只有變數名，沒有值）：`UPSTREAM_BASE_URL`、`UPSTREAM_API_KEY`、`UPSTREAM_MODEL`

### 手機端（改 `lobsterBridge.ts`）
- `remote_api` 模式真的打 `http://<電腦區域IP>:8787/v1/chat/completions`，標準 OpenAI 格式
- 設定 Modal 可填 endpoint IP、測試連線按鈕（成功顯示模型回的一句話）
- 失敗照現有邏輯降級回本地語料引擎
- 四支 Agent 的話術改成：系統提示詞放 server 端或手機端訊息皆可，但輸出仍要符合 `NegotiatorOutputs` 的四个欄位（要求模型回 JSON，parse 失敗降級）

### 安全紅線
- `.env`、任何真實 key、token 一律不得 commit（課堂規則也禁止 `.env` 進 repo）
- proxy 只轉發 chat completions，不暴露 Strata 的其他端點

### 驗收
- 電腦開 server＋Strata，手機 Expo Go 同 WiFi 輸入一句話，拿到模型生成的四種話術
- 關掉 Strata → App 自動降級本地語料，不閃退
- `git status` 確認 `.env` 沒被追蹤

## 九、任務 5：對話介面（Chat UI，像 CLI 那樣的對話視窗）

### Server 端
- 新增 `POST /v1/chat/converse`：接受 `messages` 陣列（多輪），加上 System Prompt 後轉發給 Strata，回純文字
- System Prompt 放 `server/prompts.ts` 常數：「你是氣韻居所（室內設計工作室，老闆黃建升）的工務助理，用繁體中文白話回答室內設計、施工、材料、預算問題，簡潔不廢話」；之後要換腳色只改這檔

### App 端（新增第五個頁籤 💬「問助理」）
- 新檔案 `src/agents/ChatAgent.tsx`：
  - `FlatList`（`inverted`）顯示對話氣泡：使用者右側、AI 左側
  - 底部 `TextInput` + 發送鈕；送出後顯示「⋯ 思考中」直到回覆
  - 每次送**整段歷史**（OpenAI messages 格式，含 system），模型才有上下文記憶
- **多會話對話管理（像一般 AI 介面）**：
  - 一頁有兩層：左/上為「對話列表」，點任一個進入該場對話；右上角「＋新對話」開新的一場
  - 每場對話自動用使用者第一句話當標題；列表顯示標題＋最後一句＋時間
  - 所有對話用任務 2 的儲存層（expo-sqlite 青睞）落地：`conversations` 與 `messages` 兩張表（或等價結構），重開 App 全部還在、點哪場續聊哪場
  - **全文搜尋**：列表上方搜尋框，搜所有對話的內容（sqlite 用 LIKE/FULLTEXT），點結果直接跳到該訊息位置
  - 每場可刪除（長按或滑出）；不得有「清空全部」誤觸設計
- 走 `lobsterBridge` 同一套設定：連不上 Strata 時回一則本地語料回覆（明講「離線模式，僅供示範」），不閃退

### 限制（不要做）
- 不做 stream 串流、不做 function calling、不做圖片輸入——課堂版只有一来一回的文字

### 驗收
- 手機連續問兩句，第二句能接住第一句的上下文（證明多輪有效）
- 開新對話後舊的一場仍在列表裡、點得回去、內容完整；搜尋舊對話裡的關鍵字找得到並跳到該訊息
- lint / typecheck / expo-doctor 全過，Expo Go 可跑
