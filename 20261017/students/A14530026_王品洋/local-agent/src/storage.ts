// 設定的持久化：金鑰存在系統加密儲存區（Android Keystore / iOS Keychain），其餘設定另存。
import * as SecureStore from 'expo-secure-store';
import type { Config } from './agent';

const KEY_SECRET = 'agent.apiKey';
const KEY_SETTINGS = 'agent.settings';

type Settings = Pick<Config, 'baseUrl' | 'model' | 'mock'>;

/** 讀取已儲存的設定；任何一項讀不到就沿用 fallback 的值。 */
export async function loadConfig(fallback: Config): Promise<Config> {
  try {
    const [rawSettings, apiKey] = await Promise.all([
      SecureStore.getItemAsync(KEY_SETTINGS),
      SecureStore.getItemAsync(KEY_SECRET),
    ]);
    const saved: Partial<Settings> = rawSettings ? JSON.parse(rawSettings) : {};
    return {
      baseUrl: typeof saved.baseUrl === 'string' ? saved.baseUrl : fallback.baseUrl,
      model: typeof saved.model === 'string' ? saved.model : fallback.model,
      mock: typeof saved.mock === 'boolean' ? saved.mock : fallback.mock,
      apiKey: apiKey ?? fallback.apiKey,
    };
  } catch {
    return fallback; // 儲存區讀取失敗時，用預設值，不影響 App 使用
  }
}

export async function saveConfig(cfg: Config): Promise<void> {
  try {
    const settings: Settings = { baseUrl: cfg.baseUrl, model: cfg.model, mock: cfg.mock };
    await SecureStore.setItemAsync(KEY_SETTINGS, JSON.stringify(settings));
    if (cfg.apiKey) await SecureStore.setItemAsync(KEY_SECRET, cfg.apiKey);
    else await SecureStore.deleteItemAsync(KEY_SECRET);
  } catch {
    // 儲存失敗就略過：本次仍可使用，只是下次要重填
  }
}
