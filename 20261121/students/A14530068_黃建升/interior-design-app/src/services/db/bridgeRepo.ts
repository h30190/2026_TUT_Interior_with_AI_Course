import {
  LobsterBridgeConfig,
  SavedConnectionProfile,
} from '../../types/agent';
import { formatNowTimestamp, getDb } from './sqliteClient';

let fallbackBridgeConfig: LobsterBridgeConfig | null = null;
let fallbackProfiles: SavedConnectionProfile[] = [];

export function loadBridgeConfigFromSQLite(
  defaultConfig: LobsterBridgeConfig
): LobsterBridgeConfig {
  const db = getDb();
  if (!db) {
    return fallbackBridgeConfig ?? defaultConfig;
  }
  try {
    const row = db.getFirstSync<{ config_json: string }>(
      'SELECT config_json FROM bridge_settings WHERE id = 1'
    );
    if (!row) {
      saveBridgeConfigToSQLite(defaultConfig);
      return defaultConfig;
    }
    const parsed = JSON.parse(row.config_json) as Partial<LobsterBridgeConfig>;
    return {
      mode: parsed.mode === 'remote_api' ? 'remote_api' : 'local_engine',
      endpointUrl: parsed.endpointUrl || defaultConfig.endpointUrl,
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
      modelId: parsed.modelId || defaultConfig.modelId,
      availableModels:
        Array.isArray(parsed.availableModels) &&
        parsed.availableModels.length > 0
          ? parsed.availableModels
          : defaultConfig.availableModels,
      deviceTag: parsed.deviceTag || defaultConfig.deviceTag,
    };
  } catch {
    return fallbackBridgeConfig ?? defaultConfig;
  }
}

export function saveBridgeConfigToSQLite(config: LobsterBridgeConfig): void {
  fallbackBridgeConfig = config;
  const db = getDb();
  if (!db) {
    return;
  }
  try {
    db.runSync(
      'INSERT OR REPLACE INTO bridge_settings (id, config_json) VALUES (1, ?)',
      [JSON.stringify(config)]
    );
  } catch {
    // ignore
  }
}

export function loadConnectionProfilesFromSQLite(): SavedConnectionProfile[] {
  const db = getDb();
  if (!db) {
    return fallbackProfiles;
  }
  try {
    const rows = db.getAllSync<{
      id: number;
      profile_name: string;
      endpoint_url: string;
      api_key: string;
      model_id: string;
      updated_at: string;
    }>(
      'SELECT id, profile_name, endpoint_url, api_key, model_id, updated_at FROM connection_profiles ORDER BY id DESC'
    );
    return rows.map((r) => ({
      id: r.id,
      profileName: r.profile_name,
      endpointUrl: r.endpoint_url,
      apiKey: r.api_key,
      modelId: r.model_id,
      updatedAt: r.updated_at,
    }));
  } catch {
    return fallbackProfiles;
  }
}

export function insertConnectionProfileToSQLite(
  profileName: string,
  config: LobsterBridgeConfig
): SavedConnectionProfile[] {
  const updatedAt = formatNowTimestamp();
  const cleanName =
    profileName.trim() || `連線設定 (${config.modelId || '預設'})`;

  const db = getDb();
  if (db) {
    try {
      db.runSync(
        `INSERT INTO connection_profiles (profile_name, endpoint_url, api_key, model_id, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [
          cleanName,
          config.endpointUrl,
          config.apiKey,
          config.modelId,
          updatedAt,
        ]
      );
      return loadConnectionProfilesFromSQLite();
    } catch {
      // fallback below
    }
  }

  const nextId =
    fallbackProfiles.length > 0 ? fallbackProfiles[0].id + 1 : 1;
  const rec: SavedConnectionProfile = {
    id: nextId,
    profileName: cleanName,
    endpointUrl: config.endpointUrl,
    apiKey: config.apiKey,
    modelId: config.modelId,
    updatedAt,
  };
  fallbackProfiles = [rec, ...fallbackProfiles];
  return fallbackProfiles;
}

export function removeConnectionProfileFromSQLite(
  id: number
): SavedConnectionProfile[] {
  const db = getDb();
  if (db) {
    try {
      db.runSync('DELETE FROM connection_profiles WHERE id = ?', [id]);
      return loadConnectionProfilesFromSQLite();
    } catch {
      // fallback below
    }
  }
  fallbackProfiles = fallbackProfiles.filter((p) => p.id !== id);
  return fallbackProfiles;
}
