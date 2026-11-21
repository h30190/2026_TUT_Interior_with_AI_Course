import { Alert, Share } from 'react-native';
import {
  ChatMessageItem,
  LobsterBridgeConfig,
  NegotiatorOutputs,
  PinMarker,
} from '../types/agent';

/**
 * 🦞 龍蝦系統 / 本地端 Strata (OpenAI 相容 Proxy) & iPhone 原生分享轉接服務
 * - 程式碼預設 apiKey 為空字串（絕不將任何真實 Key 放進 Git repo）
 * - 使用者在手機介面上輸入的 API Key、模型清單與連線紀錄會保存在手機本機 SQLite
 */
export const DEFAULT_LOBSTER_CONFIG: LobsterBridgeConfig = {
  mode: 'local_engine',
  endpointUrl: 'http://192.168.0.101:8787/v1/chat/completions',
  apiKey: '',
  modelId: 'qwen3.8-q3_s',
  availableModels: ['qwen3.8-q3_s', 'auto'],
  deviceTag: 'Jason-iPhone-Pro',
};

export const CONVERSE_SYSTEM_PROMPT =
  '你是氣韻居所（室內設計工作室，老闆黃建升）的工務助理，用繁體中文白話回答室內設計、施工、材料、預算問題，簡潔不廢話';

/**
 * 將使用者輸入的 IP 或網址正規化為 /v1/chat/completions 端點
 */
export function resolveChatCompletionsUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return DEFAULT_LOBSTER_CONFIG.endpointUrl;
  }
  const withProto = trimmed.startsWith('http') ? trimmed : `http://${trimmed}`;
  if (withProto.endsWith('/v1/chat/completions')) {
    return withProto;
  }
  if (withProto.endsWith('/v1/chat/converse')) {
    return withProto.replace(/\/chat\/converse$/, '/chat/completions');
  }
  if (withProto.endsWith('/v1')) {
    return `${withProto}/chat/completions`;
  }
  return `${withProto.replace(/\/+$/, '')}/v1/chat/completions`;
}

/**
 * 由設定網址推導出 /v1/chat/converse 多輪純文字對話端點
 */
export function resolveConverseUrl(rawUrl: string): string {
  const chatUrl = resolveChatCompletionsUrl(rawUrl);
  return chatUrl.replace(/\/chat\/completions$/, '/chat/converse');
}

/**
 * 由 chat completions 網址推導出 /v1/models 模型清單查詢端點
 */
export function resolveModelsUrl(rawUrl: string): string {
  const chatUrl = resolveChatCompletionsUrl(rawUrl);
  return chatUrl.replace(/\/chat\/completions$/, '/models');
}

function buildRequestHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const trimmedKey = apiKey.trim();
  if (trimmedKey) {
    headers.Authorization = trimmedKey.startsWith('Bearer ')
      ? trimmedKey
      : `Bearer ${trimmedKey}`;
  }
  return headers;
}

/**
 * 從伺服器 (/v1/models) 讀取可用模型清單，供手機介面顯示與更換模型
 */
export async function fetchAvailableModelsFromServer(
  config: LobsterBridgeConfig
): Promise<{ ok: boolean; models: string[]; message: string }> {
  const modelsUrl = resolveModelsUrl(config.endpointUrl);
  try {
    const response = await fetch(modelsUrl, {
      method: 'GET',
      headers: buildRequestHeaders(config.apiKey),
    });

    if (!response.ok) {
      const errText = await response.text();
      return {
        ok: false,
        models: config.availableModels,
        message: `查詢模型失敗 (HTTP ${response.status})：${errText.slice(0, 100)}`,
      };
    }

    const data = (await response.json()) as {
      data?: { id?: string }[];
      models?: { id?: string; name?: string }[];
    };

    const listFromData =
      data.data?.map((item) => item.id || '').filter(Boolean) ?? [];
    const listFromModels =
      data.models
        ?.map((item) => item.id || item.name || '')
        .filter(Boolean) ?? [];
    const merged = Array.from(new Set([...listFromData, ...listFromModels]));

    if (merged.length > 0) {
      return {
        ok: true,
        models: merged,
        message: `成功從伺服器讀取到 ${merged.length} 個模型：${merged.join('、')}`,
      };
    }

    return {
      ok: false,
      models: config.availableModels,
      message: '伺服器已回應，但未列出模型 ID，可於下方手動輸入模型名稱。',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '網路無法連線';
    return {
      ok: false,
      models: config.availableModels,
      message: `無法連線至 ${modelsUrl}：${msg}`,
    };
  }
}

/**
 * 呼叫 iOS 原生系統分享面板（可一鍵傳 LINE、AirDrop、備忘錄或拷貝）
 */
export async function shareViaIOS(
  title: string,
  message: string
): Promise<void> {
  try {
    await Share.share(
      {
        title,
        message,
      },
      {
        subject: title,
        dialogTitle: title,
      }
    );
  } catch {
    Alert.alert('分享提示', '無法開啟系統分享選單，請再試一次。');
  }
}

/**
 * 本地智慧語料引擎（純同步函式，可供初始狀態與斷線降級直接呼叫）
 */
export function buildLocalNegotiationScripts(
  rawInput: string
): NegotiatorOutputs {
  const cleaned =
    rawInput.trim() || '現場施工細節需依圖面規範調整並確認工期與費用。';

  return {
    consultant: `【氣韻居所・設計工務回報】\n親愛的屋主您好，跟您說明一下現場最新進度：\n為了確保您未來入住後的使用安全與空間質感，關於「${cleaned}」這部分，我們在現場做了詳細評估。\n\n若在此階段進行調整，需要配合既有工序重新施作與養護，我們會為您把關每一個細節，待您確認追加項目與天數後，我們即刻安排工班接續進場，謝謝您的理解與支持！`,
    contract: `【氣韻居所・工程變更與工期確認書】\n屋主您好，針對本次提出之現場變更需求（詳情：${cleaned}）：\n\n1. 依雙方簽訂之工程承攬合約，已完工或已封槽／封板之隱蔽工程如需變更，屬「工程追加減項目」。\n2. 本項調整將產生對應之工料費用與必要順延工期（不計入原合約完工逾期日數）。\n3. 請於今日內回覆確認是否施作，以利工務鎖定工班排程；若維持原核定圖面則不影響原訂進度。`,
    foreman: `【氣韻工務派工・現場修正通知】\n師傅辛苦了！現場巡場發現以下項目請幫忙處理：\n👉 重點：「${cleaned}」\n\n⚠️ 麻煩請照施工圖尺寸與收尾標準調整到位，改好後請拍一張「拉捲尺入鏡」的照片傳到群組，方便我們幫你簽認這階段進度，感謝力挺！`,
    neighbor: `【氣韻居所・敦親睦鄰施工公告】\n各位芳鄰與管委會總幹事您好：\n感謝大家在裝修期間的包涵與體諒。針對現場作業（說明：${cleaned}），本團隊皆嚴格遵守社區裝修管理規約之准許時段施作，並已要求工班加強公共區域防塵與減噪措施。\n\n造成短暫不便深感抱歉，我們將盡速完成高聲響工序，如有任何問題歡迎隨時聯繫現場工務負責人：黃建升設計師。`,
  };
}

/**
 * 從模型回傳內容中提取 JSON（自動去除 <think> 標籤與 Markdown code fence）
 */
function parseNegotiatorJsonFromContent(
  content: string
): NegotiatorOutputs | null {
  try {
    const withoutThink = content
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .trim();
    const firstBrace = withoutThink.indexOf('{');
    const lastBrace = withoutThink.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return null;
    }
    const jsonSlice = withoutThink.slice(firstBrace, lastBrace + 1);
    const parsed = JSON.parse(jsonSlice) as Partial<NegotiatorOutputs>;
    if (
      typeof parsed.consultant === 'string' &&
      typeof parsed.contract === 'string' &&
      typeof parsed.foreman === 'string' &&
      typeof parsed.neighbor === 'string'
    ) {
      return {
        consultant: parsed.consultant,
        contract: parsed.contract,
        foreman: parsed.foreman,
        neighbor: parsed.neighbor,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 設定 Modal 中的「測試連線」按鈕：發送標準 OpenAI chat completions 請求，成功回傳模型的一句話與實際模型 ID
 */
export async function testStrataProxyConnection(
  config: LobsterBridgeConfig
): Promise<{ ok: boolean; reply: string; detectedModel?: string }> {
  const url = resolveChatCompletionsUrl(config.endpointUrl);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: buildRequestHeaders(config.apiKey),
      body: JSON.stringify({
        model: config.modelId || 'auto',
        messages: [
          {
            role: 'system',
            content:
              '你是台灣室內設計工作室「氣韻居所」的隨身 AI 特助，請用繁體中文簡短一句話向黃建升設計師打招呼確認連線成功。',
          },
          {
            role: 'user',
            content: '測試連線，請用一句話回覆。',
          },
        ],
        temperature: 0.5,
        max_tokens: 120,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return {
        ok: false,
        reply: `HTTP ${response.status}：${errText.slice(0, 120)}`,
      };
    }

    const data = (await response.json()) as {
      model?: string;
      choices?: { message?: { content?: string } }[];
    };
    const rawReply =
      data.choices?.[0]?.message?.content
        ?.replace(/<think>[\s\S]*?<\/think>/gi, '')
        .trim() || '';
    const modelTag = data.model ? `（回應模型：${data.model}）` : '';

    if (rawReply) {
      return {
        ok: true,
        reply: `${rawReply} ${modelTag}`.trim(),
        detectedModel: data.model,
      };
    }
    return {
      ok: false,
      reply: '已連上伺服器，但模型未回傳文字內容。',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '網路無法連線';
    return {
      ok: false,
      reply: `無法連上 ${url}：${msg}。App 將自動降級使用本地語料引擎。`,
    };
  }
}

/**
 * 溝通談判 Agent：根據設計師輸入的大白話，轉換為 4 種角色專業話術
 */
export async function generateNegotiationScripts(
  rawInput: string,
  config: LobsterBridgeConfig
): Promise<NegotiatorOutputs> {
  const cleaned =
    rawInput.trim() || '現場施工細節需依圖面規範調整並確認工期與費用。';

  if (config.mode === 'remote_api') {
    const url = resolveChatCompletionsUrl(config.endpointUrl);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: buildRequestHeaders(config.apiKey),
        body: JSON.stringify({
          model: config.modelId || 'auto',
          messages: [
            {
              role: 'system',
              content: [
                '你是台灣室內設計工作室「氣韻居所」（負責人：黃建升設計師）的現場溝通談判 AI 特助。',
                '請將設計師輸入的現場大白話，轉換為四種發送給不同對象的繁體中文 LINE 訊息，並嚴格只回傳 JSON 物件（不要有任何額外說明文字），JSON 必須包含以下四個字串欄位：',
                '1. "consultant": 溫柔專業顧問口吻（發給業主，強調安全、品質與美感，委婉說明追加費用或工期）。',
                '2. "contract": 合約護航口吻（發給想凹免費追加的奧客，不失禮貌但明確引用工程承攬合約、追加減規範與工期免責）。',
                '3. "foreman": 工地阿兄派工口吻（發給工班師傅，直接講尺寸重點、收尾標準、期限與拉捲尺拍照回報）。',
                '4. "neighbor": 管委會與鄰居安撫口吻（發給總幹事或芳鄰，說明合規施工時段、防塵減噪措施與致意）。',
              ].join('\n'),
            },
            {
              role: 'user',
              content: `設計師現場大白話：「${cleaned}」\n請直接輸出 JSON：{"consultant":"...","contract":"...","foreman":"...","neighbor":"..."}`,
            },
          ],
          temperature: 0.4,
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const content = data.choices?.[0]?.message?.content || '';
        const parsed = parseNegotiatorJsonFromContent(content);
        if (parsed) {
          return parsed;
        }
      }
    } catch {
      // Strata 未開機或網路中斷時，自動無縫降級回本地智慧語料引擎
    }
  }

  return buildLocalNegotiationScripts(cleaned);
}

/**
 * 任務 5：離線模式或連不上 Strata 時的多輪上下文示範回覆（明確標註「離線模式，僅供示範」）
 */
function buildOfflineContextualConverseReply(
  history: ChatMessageItem[]
): string {
  const userMsgs = history.filter((m) => m.role === 'user');
  const latestMsg = userMsgs[userMsgs.length - 1];
  const latestUser = latestMsg?.content || '';
  const hasPhoto = !!latestMsg?.imageUri;
  const prevUser =
    userMsgs.length >= 2 ? userMsgs[userMsgs.length - 2]?.content : null;

  const contextPrefix = prevUser
    ? `承接您上一句提到的「${prevUser.slice(0, 18)}」，`
    : '';

  if (hasPhoto) {
    return `${contextPrefix}📷 已收到您上傳的現場照片與說明「${latestUser}」！\n建議現場重點檢核：\n1. 收邊與水平垂直基準是否符合施工圖面\n2. 隱蔽管線或防水交接面是否已拉捲尺拍照留存\n3. 若需標註紅點派工，可點下方「＋ ➔ 📍 照片釘紅點」工具。（離線模式，僅供示範）`;
  }

  if (latestUser.includes('浴室') || latestUser.includes('防水') || latestUser.includes('洩水')) {
    return `${contextPrefix}針對「${latestUser}」：浴室地坪泥作建議乾區洩水坡度抓 1/100、濕區淋浴間抓 1/50～1/60；防水層淋浴區塗刷至少 180cm 以上並做 48 小時滿水試水。（離線模式，僅供示範）`;
  }
  if (latestUser.includes('木作') || latestUser.includes('天花') || latestUser.includes('窗簾盒')) {
    return `${contextPrefix}針對「${latestUser}」：雙軌窗簾盒建議預留淨深 18～20cm（蛇形簾建議 22～25cm），封矽酸鈣板前務必先完成吊隱式冷氣排水注水測試。（離線模式，僅供示範）`;
  }
  if (latestUser.includes('水電') || latestUser.includes('插座') || latestUser.includes('專迴')) {
    return `${contextPrefix}針對「${latestUser}」：廚房 IH 爐、烤箱、洗碗機需配置獨立 5.5mm² 專用迴路，封槽前請拍下管線距地與門框基準尺寸存檔。（離線模式，僅供示範）`;
  }

  return `${contextPrefix}收到您的問題「${latestUser}」：建議先核對現場放樣基準線、材料損耗（抓 5%～10%）與工序交接介面。若需連上 Strata 取得完整 AI 推理，請確認電腦端 8787 Proxy 與 Strata 已啟動。（離線模式，僅供示範）`;
}

/**
 * 任務 5 + 多功能拍照傳圖對話請求：
 * - 若附帶照片 Base64，優先嘗試 OpenAI Vision 多模態格式；若本機為純文字模型則自動無縫轉為文字描述格式送給 Strata
 */
export async function sendChatConverseMessages(
  history: ChatMessageItem[],
  config: LobsterBridgeConfig,
  latestImageBase64?: string | null
): Promise<string> {
  if (config.mode === 'remote_api') {
    const headers = buildRequestHeaders(config.apiKey);

    // 1. 若有附帶照片 base64，先嘗試以 OpenAI Vision 多模態格式呼叫 /v1/chat/completions
    if (latestImageBase64 && history.length > 0) {
      try {
        const completionsUrl = resolveChatCompletionsUrl(config.endpointUrl);
        const visionMessages = [
          { role: 'system', content: CONVERSE_SYSTEM_PROMPT },
          ...history.slice(0, -1).map((m) => ({
            role: m.role,
            content: m.content,
          })),
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  history[history.length - 1].content ||
                  '請幫我檢視這張室內設計／工地現場照片並提供專業建議。',
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${latestImageBase64}`,
                },
              },
            ],
          },
        ];

        const vRes = await fetch(completionsUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: config.modelId || 'auto',
            messages: visionMessages,
            temperature: 0.5,
          }),
        });

        if (vRes.ok) {
          const vData = (await vRes.json()) as {
            choices?: { message?: { content?: string } }[];
          };
          const vText = vData.choices?.[0]?.message?.content;
          if (vText) {
            return vText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
          }
        }
      } catch {
        // 若上游為純文字模型不支援 image_url，自動降級走下方純文字 converse
      }
    }

    // 2. 純文字多輪對話（若該則訊息有照片，自動標記 [附上現場照片] 供文字模型理解上下文）
    const converseUrl = resolveConverseUrl(config.endpointUrl);
    const openAiMessages = [
      { role: 'system' as const, content: CONVERSE_SYSTEM_PROMPT },
      ...history.map((m) => ({
        role: m.role,
        content: m.imageUri ? `[附上案場照片] ${m.content}` : m.content,
      })),
    ];

    try {
      const response = await fetch(converseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.modelId || 'auto',
          messages: openAiMessages,
          temperature: 0.5,
        }),
      });

      if (response.ok) {
        const rawText = (await response.text()).trim();
        if (rawText) {
          if (rawText.startsWith('{')) {
            try {
              const parsed = JSON.parse(rawText) as {
                choices?: { message?: { content?: string } }[];
              };
              const msgContent = parsed.choices?.[0]?.message?.content;
              if (msgContent) {
                return msgContent
                  .replace(/<think>[\s\S]*?<\/think>/gi, '')
                  .trim();
              }
            } catch {
              // 直接回傳純文字
            }
          }
          return rawText;
        }
      }
    } catch {
      // 連不上 Strata 時無縫降級回本地示範回覆
    }
  }

  return buildOfflineContextualConverseReply(history);
}

/**
 * 看圖指派 Agent：將所有紅點標註彙整成 LINE 圖文對照派工單
 */
export function buildPinpointDispatchReport(
  projectName: string,
  pins: PinMarker[]
): string {
  if (pins.length === 0) {
    return `【${projectName}・現場巡檢】目前尚無標註待修紅點。`;
  }

  const header = `📐【氣韻居所・現場看圖指派單】\n案場：${projectName}\n標註數：共 ${pins.length} 處待辦\n━━━━━━━━━━━━━━`;
  const lines = pins.map(
    (p) =>
      `📍 紅點 #${p.number}｜【${p.trade}】${p.zoneName}\n   • 項目：${p.issueTag}\n   • 說明：${p.note || '請依圖面標準修正並拍照回報'}\n   • 座標：照片 (${p.xPercent}%, ${p.yPercent}%)｜期限：${p.deadline}`
  );
  const footer = `━━━━━━━━━━━━━━\n✅ 請各工種師傅完成後，直接回覆「紅點編號＋完工照片」，感謝！`;

  return [header, ...lines, footer].join('\n');
}

/**
 * 老工務長 Agent：呼叫 Strata AI 針對特定空間與預留尺寸撰寫專業勸退／動線分析說帖
 */
export async function generateAiErgonomicAdvice(
  space: string,
  title: string,
  currentCm: number,
  minLimit: number,
  comfortMin: number,
  config: LobsterBridgeConfig
): Promise<string> {
  const prompt = `空間：${space}「${title}」，目前業主想只留 ${currentCm}cm（舒適標準為 ${comfortMin}cm，極限底線為 ${minLimit}cm）。請用老工務長專業口吻，寫一段 100 字內、能當場給業主看的生活動線風險與尺寸調整建議。`;
  return sendChatConverseMessages(
    [
      {
        id: 1,
        conversationId: 0,
        role: 'user',
        content: prompt,
        createdAt: '',
      },
    ],
    config
  );
}

/**
 * 看圖指派 Agent：呼叫 Strata AI 將照片紅點清單潤飾並補充各工種驗收標準
 */
export async function generateAiEnhancedPinpointReport(
  projectName: string,
  pins: PinMarker[],
  config: LobsterBridgeConfig
): Promise<string> {
  const baseReport = buildPinpointDispatchReport(projectName, pins);
  if (pins.length === 0) {
    return baseReport;
  }
  const prompt = `請幫我把以下工地紅點指派單，潤飾成發給工班群組的專業派工指令，並針對裡面的工種補充 2 點關鍵驗收提醒：\n${baseReport}`;
  return sendChatConverseMessages(
    [
      {
        id: 1,
        conversationId: 0,
        role: 'user',
        content: prompt,
        createdAt: '',
      },
    ],
    config
  );
}

/**
 * 客戶沙盒 Agent：呼叫 Strata AI 根據屋主勾選的生活場景與預算比重，真實生成客製化《空間氣質診斷書》
 */
export async function generateAiClientSandboxDiagnosis(
  clientName: string,
  moodName: string,
  moodDesc: string,
  selectedTags: string[],
  hardDecorRatio: number,
  config: LobsterBridgeConfig
): Promise<string> {
  const softRatio = 100 - hardDecorRatio;
  const prompt = [
    `屋主案名：${clientName || '貴賓屋主'}`,
    `偏好調性：${moodName}（${moodDesc}）`,
    `日常場景需求：${selectedTags.join('、') || '一般住宅需求'}`,
    `預算天平：硬裝基礎工程 ${hardDecorRatio}% vs 軟裝家具家電 ${softRatio}%`,
    '請以「氣韻居所」設計總監黃建升的角度，為這位屋主撰寫一份約 180 字、分點條列的《空間氣質與機能配置診斷書》（包含材質建議、動線重點與預算分配建議，不出現具體金額數字）。',
  ].join('\n');

  return sendChatConverseMessages(
    [
      {
        id: 1,
        conversationId: 0,
        role: 'user',
        content: prompt,
        createdAt: '',
      },
    ],
    config
  );
}
