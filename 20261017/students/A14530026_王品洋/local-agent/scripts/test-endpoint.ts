// 測試 OpenAI 相容端點：npm run test:endpoint -- <模型名稱>
// 金鑰從環境變數 API_KEY 讀取，端點可用 BASE_URL 覆寫。腳本不會印出金鑰。
import { readFileSync } from 'node:fs';
import { listModels, runAgent } from '../src/agent.ts';

// 金鑰來源：環境變數 API_KEY，或 KEY_FILE 指定的檔案（檔案內只放金鑰）。
function loadKey(): string {
  if (process.env.API_KEY) return process.env.API_KEY.trim();
  if (process.env.KEY_FILE) {
    try {
      return readFileSync(process.env.KEY_FILE, 'utf8').trim();
    } catch {
      return '';
    }
  }
  return '';
}

const cfg = {
  baseUrl: process.env.BASE_URL ?? 'https://integrate.api.nvidia.com/v1',
  apiKey: loadKey(),
  model: process.argv[2] ?? '',
  mock: false,
};

if (!cfg.apiKey) {
  console.error('找不到金鑰：請設定 API_KEY 環境變數，或用 KEY_FILE 指向存放金鑰的檔案。');
  process.exit(1);
}

async function step(name: string, fn: () => Promise<string>) {
  const t = Date.now();
  try {
    console.log(`✅ ${name}（${Date.now() - t}ms）：${await fn()}`);
    return true;
  } catch (e) {
    console.log(`❌ ${name}：${e instanceof Error ? e.message : e}`);
    return false;
  }
}

const ok1 = await step('1. 驗證金鑰並取得模型清單', async () => `${(await listModels(cfg)).length} 個模型`);
if (!cfg.model) {
  console.log('未指定模型，略過對話測試。用法：npm run test:endpoint -- <模型名稱>');
  process.exit(ok1 ? 0 : 1);
}

await step(`2. 一般對話（${cfg.model}）`, async () => {
  const out = await runAgent(cfg, [{ role: 'user', content: '用一句話回答：1+1 等於多少？' }]);
  return String(out.at(-1)?.content ?? '(無內容)').slice(0, 120);
});

await step('3. 工具呼叫（算式）', async () => {
  const out = await runAgent(cfg, [{ role: 'user', content: '請用 calculate 工具算 (12+3)*4，再告訴我結果' }]);
  const used = out.filter((m) => m.role === 'tool').map((m) => `${m.name}=${m.content}`);
  return used.length ? `有呼叫工具 ${used.join(', ')}；最終回覆：${String(out.at(-1)?.content).slice(0, 80)}` : '模型沒有呼叫工具（可能不支援 tools，換一個模型試試）';
});
