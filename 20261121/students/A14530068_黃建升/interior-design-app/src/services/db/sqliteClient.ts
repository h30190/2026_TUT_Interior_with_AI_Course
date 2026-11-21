import * as SQLite from 'expo-sqlite';

const DB_NAME = 'qiyun_pocket_v1.db';
let dbInstance: SQLite.SQLiteDatabase | null = null;
let idCounter = 1000;
const memoryKvFallback: Record<string, string> = {};

export function formatNowTimestamp(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

export function generateUniqueId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

/**
 * 取得單例 SQLite 連線並確保所有資料表已建立
 */
export function getDb(): SQLite.SQLiteDatabase | null {
  if (dbInstance) {
    return dbInstance;
  }
  try {
    const db = SQLite.openDatabaseSync(DB_NAME);
    db.execSync(`
      CREATE TABLE IF NOT EXISTS active_workspace (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        project_name TEXT NOT NULL,
        photo_uri TEXT,
        pins_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS dispatch_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_name TEXT NOT NULL,
        photo_uri TEXT,
        pin_count INTEGER NOT NULL,
        pins_json TEXT NOT NULL,
        report_text TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS bridge_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        config_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS connection_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_name TEXT NOT NULL,
        endpoint_url TEXT NOT NULL,
        api_key TEXT NOT NULL,
        model_id TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        last_message TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        image_uri TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS app_kv_store (
        store_key TEXT PRIMARY KEY,
        json_value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    try {
      db.execSync('ALTER TABLE messages ADD COLUMN image_uri TEXT;');
    } catch {
      // 欄位已存在則略過
    }
    dbInstance = db;
    return db;
  } catch {
    return null;
  }
}

/**
 * 通用 SQLite JSON 鍵值讀取（含預設種子資料自動初始化）
 */
export function readKvJson<T>(key: string, defaultVal: T): T {
  const db = getDb();
  if (db) {
    try {
      const row = db.getFirstSync<{ json_value: string }>(
        'SELECT json_value FROM app_kv_store WHERE store_key = ?',
        [key]
      );
      if (!row) {
        writeKvJson(key, defaultVal);
        return defaultVal;
      }
      return JSON.parse(row.json_value) as T;
    } catch {
      // fallback below
    }
  }
  if (key in memoryKvFallback) {
    try {
      return JSON.parse(memoryKvFallback[key]) as T;
    } catch {
      return defaultVal;
    }
  }
  return defaultVal;
}

/**
 * 通用 SQLite JSON 鍵值寫入
 */
export function writeKvJson<T>(key: string, val: T): void {
  const jsonStr = JSON.stringify(val);
  memoryKvFallback[key] = jsonStr;
  const db = getDb();
  if (!db) {
    return;
  }
  try {
    db.runSync(
      'INSERT OR REPLACE INTO app_kv_store (store_key, json_value, updated_at) VALUES (?, ?, ?)',
      [key, jsonStr, formatNowTimestamp()]
    );
  } catch {
    // fallback in memory
  }
}
