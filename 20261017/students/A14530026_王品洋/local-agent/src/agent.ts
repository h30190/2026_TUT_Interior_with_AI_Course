// AI Agent：使用「OpenAI 相容」端點（POST {baseUrl}/chat/completions），含簡單工具呼叫迴圈。
// 相容對象：LM Studio、llama.cpp server、vLLM、Ollama(/v1)、OpenAI 等。

export type ToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string }; // arguments 是 JSON 字串
};

export type Msg = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
};

export type Config = {
  baseUrl: string; // 例如 http://10.0.2.2:1234/v1（要含 /v1）
  model: string;
  apiKey: string; // 本地伺服器通常可留空
  mock: boolean;
};

const SYSTEM_PROMPT = '你是一個在使用者手機上運作的助理，使用繁體中文簡潔回答。需要時可呼叫工具。';

// ---- 工具定義（在手機端執行）----
const tools = [
  {
    type: 'function',
    function: {
      name: 'get_current_time',
      description: '取得手機目前的日期與時間',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculate',
      description: '計算數學算式，例如 (12+3)*4',
      parameters: {
        type: 'object',
        properties: { expression: { type: 'string', description: '算式' } },
        required: ['expression'],
      },
    },
  },
];

function runTool(name: string, rawArgs: string): string {
  let args: Record<string, unknown> = {};
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    return '錯誤：工具參數不是有效的 JSON';
  }
  if (name === 'get_current_time') return new Date().toLocaleString('zh-TW');
  if (name === 'calculate') {
    const expr = String(args.expression ?? '');
    if (!/^[\d+\-*/().\s%]+$/.test(expr)) return '錯誤：算式含不允許的字元';
    try {
      return String(Function(`"use strict"; return (${expr})`)());
    } catch {
      return '錯誤：無法計算';
    }
  }
  return `未知工具：${name}`;
}

let mockId = 0;
function mockCall(name: string, args: object): Msg {
  return {
    role: 'assistant',
    content: null,
    tool_calls: [{ id: `mock_${++mockId}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }],
  };
}

/** 示範模式：不連任何 AI，用固定規則假裝回答，方便在沒有模型時測試 App 與工具流程。 */
function mockReply(messages: Msg[]): Msg {
  const last = messages[messages.length - 1];
  if (last.role === 'tool') {
    return { role: 'assistant', content: `（示範模式）工具「${last.name}」的結果是：${last.content}` };
  }
  const text = last.content ?? '';
  if (/時間|幾點|日期|今天/.test(text)) return mockCall('get_current_time', {});
  const expr = text.match(/[\d+\-*/().%\s]{3,}/)?.[0]?.trim();
  if (expr && /\d/.test(expr) && /[+\-*/]/.test(expr)) return mockCall('calculate', { expression: expr });
  return { role: 'assistant', content: `（示範模式）我收到：「${text}」。目前沒有連接 AI 模型；問我時間或算式可以看到工具呼叫。` };
}

/** 整理端點：就算使用者貼的是完整網址（…/v1/chat/completions），也還原成 …/v1。 */
export function normalizeBase(url: string): string {
  return url
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/chat\/completions$/, '')
    .replace(/\/models$/, '')
    .replace(/\/+$/, '');
}

function authHeaders(cfg: Config): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cfg.apiKey.trim()) headers.Authorization = `Bearer ${cfg.apiKey.trim()}`;
  return headers;
}

/** 向端點查詢可用模型（GET {baseUrl}/models），回傳排序後的模型 ID 清單。 */
export async function listModels(cfg: Config): Promise<string[]> {
  const res = await fetch(`${normalizeBase(cfg.baseUrl)}/models`, { headers: authHeaders(cfg) });
  if (!res.ok) throw new Error(`取得模型清單失敗 ${res.status}：${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const ids: string[] = (data?.data ?? []).map((m: { id?: string }) => m.id).filter(Boolean);
  if (!ids.length) throw new Error('伺服器沒有回傳任何模型');
  return ids.sort((a, b) => a.localeCompare(b));
}

async function chatOnce(cfg: Config, messages: Msg[]): Promise<Msg> {
  if (cfg.mock) return mockReply(messages);

  const res = await fetch(`${normalizeBase(cfg.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: authHeaders(cfg),
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      tools,
      stream: false,
    }),
  });
  if (!res.ok) {
    const hint = res.status === 401 || res.status === 403 ? '\n→ API Key 無效或沒有權限，請到「設定」重新貼上金鑰。' : '';
    throw new Error(`伺服器回應 ${res.status}：${(await res.text()).slice(0, 300)}${hint}`);
  }
  const data = await res.json();
  const msg = data?.choices?.[0]?.message;
  if (!msg) throw new Error('伺服器回應格式不是 OpenAI 相容格式（找不到 choices[0].message）');
  return { role: 'assistant', content: msg.content ?? null, tool_calls: msg.tool_calls };
}

/** 執行 agent 迴圈：模型 → 工具 → 模型，直到產生最終文字。回傳新增的訊息。 */
export async function runAgent(cfg: Config, history: Msg[]): Promise<Msg[]> {
  const added: Msg[] = [];
  for (let step = 0; step < 5; step++) {
    const reply = await chatOnce(cfg, [...history, ...added]);
    added.push(reply);
    if (!reply.tool_calls?.length) break;
    for (const call of reply.tool_calls) {
      added.push({
        role: 'tool',
        tool_call_id: call.id,
        name: call.function.name,
        content: runTool(call.function.name, call.function.arguments),
      });
    }
  }
  return added;
}
