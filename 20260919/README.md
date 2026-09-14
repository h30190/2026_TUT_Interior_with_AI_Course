# 2026-09-19 GitHub＋Agent Coding（第一堂，個人制）

- 主題：GitHub 工作流＋Agent Coding 入門；不綁特定設計軟體，以網頁小工具為主
- 對象：coding 0 經驗、可能第一次用 GitHub／第一次叫 agent 寫程式
- 節奏：10:00–12:00 講座 → 12:00–15:00 黑克松 → 15:00–16:00 輪流簡報
- 本檔即簡報內容來源：每節對應投影片章節

## 課前準備

### 學生端

1. 帶筆電＋電源＋滑鼠（有就帶）
2. **開 GitHub 帳號**：免費註冊＋收驗證信開通（沒帳號後面全卡住）
3. **裝 Git**：`git config` 設好姓名與 email（對應 GitHub 帳號）
4. **Node.js LTS（20.x 以上）**：後面跑網頁小工具、部署用
5. **裝 Google Antigravity＋OpenCode** 並登入（本課統一用這套，其他 agent 不用裝）
6. 課前不用預習程式，帶一個「想自動化的室設麻煩事」來（估價、排磚、燈具配置都可）

### 業師端

- [ ] 示範機：Git＋Node＋Antigravity＋OpenCode 全流程跑通
- [ ] 主 repo `main` 分支保護：禁直接 push，一律走 PR（admin＝業師除外，可直接推）
- [ ] 課程聯絡管道（待定：LINE 群／Teams／信箱）
- [ ] 備用機一台：學生環境救不回時頂上
- [ ] 教室網路確認能抓 npm／Go module（或預先準備離線包）

## 課程內容

### Part 1｜GitHub＋coding agent 入門（講座前半）

對象是 0 經驗，以示範＋跟做為主，少用名詞。

- **概念**
  - repo／commit／push／issue／PR，用「全班共寫一份工具清單」的情境講；
    為什麼工具開發要版本控制
  - agent 是什麼：LLM 會「叫工具」→ 直接改檔案、跑指令、開 PR，
    室設從「手算手排」變成「講需求、驗結果」
  - **AI 協作三原則**：
    1. 給情境：跟 agent 講清楚專案、輸入、輸出長什麼樣，越具體越可靠
    2. agent 會錯：任何產出都要親自驗（跑起來看、尺寸重算一次），截圖就是證據
    3. 可追溯：改動都用 commit 進 repo；大改前先 commit 一次方便回滾
  - GitHub 在這門課的定位：版本控制＋協作＋agent 的「軌道」
- **跟做**：業師畫面示範，學生同步操作（個人制，每人獨立一條線，無作業，當堂做完）：
  1. `git config`；每人 fork 主 repo 到自己帳號，再 clone 到本機
  2. 在 `20260919/students/` 下建 `學號_姓名/` 資料夾（例 `B112001_王小明/`），裡面放自己的東西
  3. 改自己資料夾內檔案 → commit → push 到自己的 fork（版本控制最小循環）
  4. **大檔案不進 repo**：`.rvt`／`.skp`／影片原檔留在本機；
     repo 只放程式、文件、截圖、匯出資料（JSON／CSV）
  5. **跟上游同步**：主 repo 更新時，到自己 fork 網頁按
     Sync fork → Update branch，再回本機 `git pull`
- **常用操作流程**：只教到發表會用到的
  - 起手式（只做一次）： fork 主 repo → `git clone <fork URL>` 到本機
  - 個人：開工 `pull` → 只動 `students/學號_姓名/` → `add＋commit` → `push`
  - 交件：當堂 push 到自己的 fork 就是交件；期末發表再從 fork 發 PR 回主 repo（0116 用）
  - 卡住或衝突：先停手不要硬解，找業師

個人日常＋交件循環：

```mermaid
flowchart LR
    A[開工先 pull] --> B[只動 students/學號_姓名] --> C[add＋commit] --> D[push 到 fork 即交件]
    D --> A
```

### Part 2｜Antigravity＋OpenCode：第一次從 prompt 到網頁（講座後半）

- **架構**：你在 Antigravity 裡講話 → OpenCode 改檔案＋跑指令 → 瀏覽器驗收。不是聊天，是「需求→可跑的東西→驗證」
- **邊界與風險**：
  - 先從靜態網頁開始（HTML＋JS 單檔）：磁磚計算機、油漆用量、櫃體估價表都適合
  - 不要一次叫 agent 做太大：切小步、每步跑起來看
  - 授權注意：網路抓的圖、業主平面不要直接丟公開 repo
- **連線驗證＋排錯**：課前已裝好 Antigravity＋OpenCode，課上是驗通＋救火
  1. 開 terminal：`node -v`、`git --version` 有反應
  2. 在 Antigravity 叫 OpenCode：「幫我在 `students/學號_姓名/` 建一個 `hello.html`，打開顯示今天日期」→ 瀏覽器打開驗證
  3. 再叫一個：「加一個輸入坪數、輸出油漆公升數的計算機」→ 輸入 10 坪驗算一次
  4. 不順的人照附錄排；業師巡場
  5. 跑完的人直接開始 Part 3 任務

### Part 3｜實作：黑克松（3hr，個人）

- 目標：跑通個人 fork 流程、用 OpenCode 做出第一個「能跑的」網頁雛形；不用漂亮，能算能看就好
- 步驟：
  1. fork＋clone 主 repo 到本機
  2. 在 `students/` 下建 `學號_姓名/` 資料夾
  3. 最小循環：在自己資料夾內改檔案 → commit → push 到自己的 fork（push 就是交件）
  4. 使用：Antigravity 開 OpenCode 下指令 → 瀏覽器驗證 → 截圖留底
- 題目（由低到高，做出來為止）：
  1. 單檔計算機：油漆用量／窗簾布尺／插座數量估算
  2. 表格工具：貼上 Excel 估價單，自動加總＋排序＋匯出 CSV
  3. 自由試：把早上帶來的「室設麻煩事」丟給 OpenCode（驗證＋截圖存自己資料夾）

```mermaid
flowchart TD
    A[fork＋clone＋建學號資料夾] --> B[最小循環 commit push 即交件]
    B --> C[OpenCode 下指令做網頁]
    C --> D[瀏覽器驗證＋實算]
    D -->|不行| E[照附錄排錯＋切小步重問]
    E --> C
    D -->|可以| F[截圖＋commit 留痕]
```

### Part 4｜簡報＋預告（1hr，無作業）

- 簡報：每人輪流講（每人 2–3 分鐘）：題目方向＋今天做出什麼＋最卡的地方
- 無作業：當堂 push 到自己 fork 就是交件，不用額外出功課
- **預告 10/3**：AI 基礎知識（素養／邊界／治理／資料分析四選，待定）＋繼續磨小工具；
  有興趣碰 Revit 的先確認電腦跑不跑得動 Revit 2024 學生版
- 收尾：公布課程聯絡管道

## 附錄：常見問題（課上隨查）

| 症狀 | 檢查 |
|------|------|
| `git push` 被拒 | fork 沒 sync → 網頁按 Sync fork 後 pull 再推；只動自己 `學號_姓名/` 資料夾 |
| 動到別人資料夾 | 只動 `students/學號_姓名/`，別碰別人的；不小心動到就 `git checkout` 還原 |
| merge 衝突 | 先停手找業師；動手前先 pull＋Sync fork |
| agent 亂改檔案 | 大改前先 commit；叫 agent 前先講清楚「只動哪個檔、輸出長怎樣」 |
| `node -v` 沒反應 | Node 沒裝好或 terminal 沒重開；重裝 LTS 後重開 terminal |
| 網頁打開空白 | 檔名路徑錯／瀏覽器快取；F12 看 console 第一行紅字 |
| 不想公開業主圖 | 去識別化再放 repo；平面、地址、人名先馬賽克或假資料代替 |

