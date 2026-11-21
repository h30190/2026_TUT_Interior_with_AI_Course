import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_SYSTEM_PROMPT =
  '你是氣韻居所（室內設計工作室，老闆黃建升）的工務助理，用繁體中文白話回答室內設計、施工、材料、預算問題，簡潔不廢話';

/**
 * 動態讀取同資料夾下的 prompts.ts 常數（修改 prompts.ts 免重啟即生效）
 */
function loadSystemPrompt() {
  try {
    const promptPath = path.join(__dirname, 'prompts.ts');
    if (fs.existsSync(promptPath)) {
      const content = fs.readFileSync(promptPath, 'utf8');
      const match = content.match(
        /CONVERSE_SYSTEM_PROMPT\s*=\s*['"`]([\s\S]*?)['"`]\s*;/
      );
      if (match && match[1]) {
        return match[1].trim();
      }
    }
  } catch {
    // fallback
  }
  return DEFAULT_SYSTEM_PROMPT;
}

/**
 * 讀取同資料夾下的 .env（純 Node 實作，不依賴外部套件）
 */
function loadDotEnv() {
  const envPath = path.join(__dirname, '.env');
  const config = {
    UPSTREAM_BASE_URL: 'http://127.0.0.1:8080/v1',
    UPSTREAM_API_KEY: 'local',
    UPSTREAM_MODEL: '',
  };

  if (!fs.existsSync(envPath)) {
    return config;
  }

  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) {
      continue;
    }
    const key = line.slice(0, eqIdx).trim();
    const val = line.slice(eqIdx + 1).trim();
    if (key in config && val) {
      config[key] = val;
    }
  }
  return config;
}

const PORT = 8787;
const HOST = '0.0.0.0';
let cachedUpstreamModel = '';

/**
 * 決定要送給上游 Strata 的 Authorization Header
 */
function resolveAuthHeader(req, envConfig) {
  const clientAuth = req.headers.authorization;
  if (typeof clientAuth === 'string' && clientAuth.trim().length > 7) {
    return clientAuth.trim();
  }
  const serverKey = envConfig.UPSTREAM_API_KEY || 'local';
  return serverKey.startsWith('Bearer ') ? serverKey : `Bearer ${serverKey}`;
}

/**
 * 向 Strata /v1/models 查詢實際模型 ID
 */
function probeUpstreamModel(envConfig, authHeader) {
  return new Promise((resolve) => {
    try {
      const base = envConfig.UPSTREAM_BASE_URL.replace(/\/+$/, '');
      const targetUrl = new URL(`${base}/models`);
      const client = targetUrl.protocol === 'https:' ? https : http;

      const req = client.request(
        targetUrl,
        {
          method: 'GET',
          headers: {
            Authorization:
              authHeader || `Bearer ${envConfig.UPSTREAM_API_KEY || 'local'}`,
          },
          timeout: 3000,
        },
        (res) => {
          let raw = '';
          res.on('data', (chunk) => {
            raw += chunk;
          });
          res.on('end', () => {
            try {
              const parsed = JSON.parse(raw);
              const firstId =
                parsed?.data?.[0]?.id || parsed?.models?.[0]?.id || '';
              if (firstId) {
                cachedUpstreamModel = firstId;
                console.log(`[Strata Proxy] 偵測到上游模型 ID: ${firstId}`);
              }
            } catch {
              // ignore
            }
            resolve(cachedUpstreamModel || envConfig.UPSTREAM_MODEL);
          });
        }
      );
      req.on('error', () => resolve(envConfig.UPSTREAM_MODEL));
      req.on('timeout', () => {
        req.destroy();
        resolve(envConfig.UPSTREAM_MODEL);
      });
      req.end();
    } catch {
      resolve(envConfig.UPSTREAM_MODEL);
    }
  });
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

/**
 * 網路搜尋（免費 DuckDuckGo Instant Answer API，不需金鑰）
 */
function webSearch(query) {
  return new Promise((resolve) => {
    try {
      const targetUrl = new URL(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
      );
      const req = https.request(
        targetUrl,
        { method: 'GET', headers: { 'User-Agent': 'qi-yun-pocket-agent/1.0' }, timeout: 8000 },
        (res) => {
          let raw = '';
          res.on('data', (c) => (raw += c));
          res.on('end', () => {
            try {
              const d = JSON.parse(raw);
              const bits = [];
              if (d.AbstractText) bits.push(`${d.AbstractText}（來源：${d.AbstractURL || 'DuckDuckGo'}）`);
              if (Array.isArray(d.RelatedTopics)) {
                for (const t of d.RelatedTopics.slice(0, 3)) {
                  if (t?.Text) bits.push(t.Text);
                }
              }
              resolve(bits.join('\n') || '（搜尋沒有結果）');
            } catch {
              resolve('（搜尋解析失敗）');
            }
          });
        }
      );
      req.on('error', () => resolve('（搜尋連線失敗）'));
      req.on('timeout', () => {
        req.destroy();
        resolve('（搜尋逾時）');
      });
      req.end();
    } catch {
      resolve('（搜尋發生錯誤）');
    }
  });
}

const SEARCH_MARKER = /\[SEARCH:\s*([^\]]+)\]/i;

/**
 * 呼叫上游一次 chat completions，回傳訊息文字
 */
function callUpstreamText(payload, envConfig, authHeader) {
  return new Promise((resolve, reject) => {
    const forwardBody = Buffer.from(JSON.stringify(payload), 'utf8');
    const targetUrl = new URL(`${envConfig.UPSTREAM_BASE_URL.replace(/\/+$/, '')}/chat/completions`);
    const client = targetUrl.protocol === 'https:' ? https : http;
    const upstreamReq = client.request(
      targetUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': forwardBody.length,
          Authorization: authHeader,
        },
        timeout: 30000,
      },
      (upstreamRes) => {
        const respChunks = [];
        upstreamRes.on('data', (c) => respChunks.push(c));
        upstreamRes.on('end', () => {
          const textBody = Buffer.concat(respChunks).toString('utf8');
          if ((upstreamRes.statusCode || 500) >= 400) {
            reject(new Error(textBody.slice(0, 300)));
            return;
          }
          try {
            const parsed = JSON.parse(textBody);
            resolve(parsed?.choices?.[0]?.message?.content || '');
          } catch {
            resolve(textBody);
          }
        });
      }
    );
    upstreamReq.on('error', reject);
    upstreamReq.on('timeout', () => {
      upstreamReq.destroy();
      reject(new Error('Upstream Strata request timed out'));
    });
    upstreamReq.write(forwardBody);
    upstreamReq.end();
  });
}

const server = http.createServer(async (req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const reqUrl = (req.url || '').split('?')[0];
  const envConfig = loadDotEnv();
  const authHeader = resolveAuthHeader(req, envConfig);
  const base = envConfig.UPSTREAM_BASE_URL.replace(/\/+$/, '');

  // 1. 支援手機端「讀取可用模型清單 (GET /v1/models)」
  if (req.method === 'GET' && reqUrl === '/v1/models') {
    const targetUrl = new URL(`${base}/models`);
    const client = targetUrl.protocol === 'https:' ? https : http;

    const upstreamReq = client.request(
      targetUrl,
      {
        method: 'GET',
        headers: { Authorization: authHeader },
        timeout: 10000,
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode || 502, {
          'Content-Type':
            upstreamRes.headers['content-type'] ||
            'application/json; charset=utf-8',
        });
        upstreamRes.pipe(res);
      }
    );
    upstreamReq.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          error: { message: `Upstream Strata unreachable: ${err.message}` },
        })
      );
    });
    upstreamReq.end();
    return;
  }

  // 安全紅線：僅允許 POST /v1/chat/completions 與 POST /v1/chat/converse
  if (
    req.method !== 'POST' ||
    (reqUrl !== '/v1/chat/completions' && reqUrl !== '/v1/chat/converse')
  ) {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        error: {
          message:
            'Only POST /v1/chat/completions, POST /v1/chat/converse, and GET /v1/models are allowed.',
        },
      })
    );
    return;
  }

  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', async () => {
    const rawBody = Buffer.concat(chunks).toString('utf8');

    let payload;
    try {
      payload = JSON.parse(rawBody || '{}');
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: { message: 'Invalid JSON body' } }));
      return;
    }

    const discoveredModel =
      cachedUpstreamModel || (await probeUpstreamModel(envConfig, authHeader));
    if (
      !payload.model ||
      payload.model === 'auto' ||
      payload.model === 'default'
    ) {
      payload.model =
        discoveredModel || envConfig.UPSTREAM_MODEL || 'qwen3.8-q3_s';
    }

    // 任務 5：若為 POST /v1/chat/converse，自動補上 server/prompts.ts 的 System Prompt，並回傳純文字
    const isConverseEndpoint = reqUrl === '/v1/chat/converse';
    if (isConverseEndpoint) {
      const sysPrompt = loadSystemPrompt();
      const rawMessages = Array.isArray(payload.messages)
        ? payload.messages
        : [];
      const nonSystemMessages = rawMessages.filter(
        (m) => m && m.role !== 'system'
      );
      payload = {
        model: payload.model,
        messages: [{ role: 'system', content: sysPrompt }, ...nonSystemMessages],
        temperature:
          typeof payload.temperature === 'number' ? payload.temperature : 0.5,
      };
    }

    const forwardBody = Buffer.from(JSON.stringify(payload), 'utf8');
    const targetUrl = new URL(`${base}/chat/completions`);
    const client = targetUrl.protocol === 'https:' ? https : http;

    const upstreamReq = client.request(
      targetUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': forwardBody.length,
          Authorization: authHeader,
        },
        timeout: 30000,
      },
      (upstreamRes) => {
        if (!isConverseEndpoint) {
          res.writeHead(upstreamRes.statusCode || 502, {
            'Content-Type':
              upstreamRes.headers['content-type'] ||
              'application/json; charset=utf-8',
          });
          upstreamRes.pipe(res);
          return;
        }

        // /v1/chat/converse 解析上游 JSON 並回傳純文字（含網路搜尋一輪）
        const respChunks = [];
        upstreamRes.on('data', (c) => respChunks.push(c));
        upstreamRes.on('end', async () => {
          const textBody = Buffer.concat(respChunks).toString('utf8');
          if ((upstreamRes.statusCode || 500) >= 400) {
            res.writeHead(upstreamRes.statusCode || 502, {
              'Content-Type': 'text/plain; charset=utf-8',
            });
            res.end(textBody);
            return;
          }
          try {
            const parsed = JSON.parse(textBody);
            let rawContent = parsed?.choices?.[0]?.message?.content || '';

            const searchMatch = rawContent.match(SEARCH_MARKER);
            if (searchMatch) {
              const query = searchMatch[1].trim();
              console.log(`[Strata Proxy] 觸發網路搜尋：${query}`);
              const searchResult = await webSearch(query);
              const followUpMessages = [
                ...payload.messages,
                { role: 'assistant', content: rawContent },
                {
                  role: 'user',
                  content: `【網路搜尋結果（DuckDuckGo）】\n${searchResult}\n\n請根據以上搜尋結果回答使用者原本的問題，並標註來源。`,
                },
              ];
              try {
                rawContent = await callUpstreamText(
                  { ...payload, messages: followUpMessages },
                  envConfig,
                  authHeader
                );
              } catch (err) {
                rawContent = `（已取得搜尋結果，但二次提問失敗：${err.message}）\n搜尋結果：\n${searchResult}`;
              }
            }

            const cleanText = rawContent
              .replace(/<think>[\s\S]*?<\/think>/gi, '')
              .replace(SEARCH_MARKER, '')
              .trim();
            res.writeHead(200, {
              'Content-Type': 'text/plain; charset=utf-8',
            });
            res.end(cleanText || '（模型未回傳文字）');
          } catch {
            res.writeHead(200, {
              'Content-Type': 'text/plain; charset=utf-8',
            });
            res.end(textBody);
          }
        });
      }
    );

    upstreamReq.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          error: {
            message: `Upstream Strata unreachable: ${err.message}`,
          },
        })
      );
    });

    upstreamReq.on('timeout', () => {
      upstreamReq.destroy();
      res.writeHead(504, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          error: { message: 'Upstream Strata request timed out' },
        })
      );
    });

    upstreamReq.write(forwardBody);
    upstreamReq.end();
  });
});

server.listen(PORT, HOST, async () => {
  const envConfig = loadDotEnv();
  await probeUpstreamModel(envConfig);
  console.log(
    `[Strata Proxy] Listening on http://${HOST}:${PORT} (/v1/chat/completions & /v1/chat/converse) -> ${envConfig.UPSTREAM_BASE_URL}`
  );
});
