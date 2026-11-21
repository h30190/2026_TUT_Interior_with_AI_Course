# 地端 AI Agent（Expo / React Native）

手機 App 透過 **OpenAI 相容端點**（`POST {baseUrl}/chat/completions`）呼叫 AI，含簡單工具呼叫（時間、計算機）。
預設為「示範模式」，不連任何 AI，可直接測試介面。

## 設定（App 右上角「設定」）
| 欄位 | 說明 |
|---|---|
| 示範模式 | 開＝不連 AI；要接真正的模型時關掉 |
| 端點位址 | 結尾要有 `/v1`（貼完整的 `/v1/chat/completions` 也會自動整理） |
| API Key | 本地伺服器可留空；右側 👁️ 可顯示／隱藏 |
| 模型 | 點開下拉選單，從端點的 `/models` 取得清單，可搜尋或直接輸入 |

### 位址怎麼填
- **Android 模擬器**連電腦：`10.0.2.2`（模擬器專用）
- **實體手機**連電腦：電腦的區網 IP（同一個 Wi-Fi），電腦防火牆需放行該埠
- 常見埠：LM Studio `1234`、Ollama `11434`、llama.cpp `8080`、vLLM `8000`
- NVIDIA：`https://integrate.api.nvidia.com/v1`，金鑰以 `nvapi-` 開頭

## 執行
```powershell
cd local-agent
$env:ANDROID_HOME = 'C:\Users\user\AppData\Local\Android\Sdk'
npx.cmd expo start --lan --android
```
- 先在 Android Studio 的 Device Manager 啟動虛擬手機，再執行上面指令。
- iPhone：App Store 安裝 Expo Go，掃終端機 QR code。

## 測試端點
```powershell
$env:API_KEY = '你的金鑰'
npm.cmd run test:endpoint -- <模型名稱>
```
腳本會測試金鑰、一般對話、工具呼叫，不會印出金鑰。

## 注意
- 工具定義與執行在 `src/agent.ts`，新增工具只要加進 `tools` 與 `runTool`。
- 設定會自動記住：API Key 存在系統加密儲存區（Android Keystore / iOS Keychain），端點、模型、示範模式另存於同一個安全儲存區。若要發佈給別人使用，金鑰應放後端，不要放在 App 裡。
- iOS Simulator 只能在 macOS 執行；Windows 以 Expo Go + 實體 iPhone 測試 iOS。
